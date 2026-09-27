from __future__ import annotations
import json
import base64
import io
import os
import ee
import concurrent.futures
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import mapping, box
from shapely.geometry import shape as shapely_shape
from scipy import stats as scipy_stats
from cachetools import TTLCache
from threading import Lock

_cache: TTLCache = TTLCache(maxsize=32, ttl=3600)
_lock = Lock()

_c_ll = (232, 232, 232)
_c_hl = (190, 100, 172)
_c_lh = (90, 200, 200)
_c_hh = (59, 73, 148)

NO_DATA_COLOR = "#d0d0d0"

def get_dynamic_scale(geom):
    try:
        area_sqkm = geom.area().divide(1e6).getInfo()
        if area_sqkm > 10000: return 200
        elif area_sqkm > 2000: return 100
        else: return 100
    except:
        return 100

def _get_sectors_fc(aoi_geometry):
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    shp_path = os.path.join(base_dir, "sectrstu", "villages.shp")
    df = gpd.read_file(shp_path)
    if df.crs != "EPSG:4326": df = df.to_crs("EPSG:4326")
    
    # Dissolve by Sector
    sectors = df.dissolve("NAME_3").reset_index()
    
    # Filter bounds to AOI locally to reduce payload
    bounds = aoi_geometry.bounds().getInfo()["coordinates"][0]
    lon_min, lat_min = bounds[0]
    lon_max, lat_max = bounds[2]
    aoi_box = box(lon_min, lat_min, lon_max, lat_max)
    
    sectors = sectors[sectors.intersects(aoi_box)].copy()
    
    # Create simplified version for GEE payload to avoid 10MB limit
    sectors_simplified = sectors.copy()
    sectors_simplified.geometry = sectors_simplified.geometry.simplify(0.005, preserve_topology=True)
    
    features = []
    for i, row in sectors_simplified.iterrows():
        # Clean Sector Name
        name = row["NAME_3"] if pd.notnull(row["NAME_3"]) else f"Sector_{i}"
        features.append(ee.Feature(mapping(row.geometry), {"grid_id": name}))
        
    grid_fc = ee.FeatureCollection(features)
    # Intersect with exact AOI in GEE
    grid_fc = grid_fc.map(lambda f: ee.Feature(ee.Geometry(f.geometry()).intersection(aoi_geometry, ee.ErrorMargin(10)), f.toDictionary()))
    
    return sectors, grid_fc

def _build_uhi_base(aoi_config: dict, start_date: str, end_date: str, grid_size: int, lst_source: str = "hybrid"):
    from gee.lst import lst_image_and_aoi
    from gee.ndbi import ndbi_image_and_aoi
    from gee.landsat_utils import get_harmonized_landsat_collection, gap_fill
    from gee.aoi_utils import get_aoi_geometry
    
    aoi = get_aoi_geometry(aoi_config)
    
    if lst_source == "landsat":
        harmonized = get_harmonized_landsat_collection(start_date, end_date, aoi, max_cloud_cover=100)
        def scale_temp(img):
            return img.select("ST_B10").multiply(0.00341802).add(149.0).subtract(273.15).rename("LST")
        lst = gap_fill(harmonized.map(scale_temp).median()).clip(aoi)
    elif lst_source == "modis":
        m8 = ee.ImageCollection("MODIS/061/MOD11A2").filterDate(start_date, end_date).filterBounds(aoi).select("LST_Day_1km")
        md = ee.ImageCollection("MODIS/061/MOD11A1").filterDate(start_date, end_date).filterBounds(aoi).select("LST_Day_1km")
        lst = m8.merge(md).median().multiply(0.02).subtract(273.15).rename("LST")
    else:
        # Default to hybrid
        lst_median_raw, _ = lst_image_and_aoi(aoi_config, start_date, end_date)
        lst = lst_median_raw.select("LST")
    
    ndbi_median_raw, _ = ndbi_image_and_aoi(aoi_config, start_date, end_date)
    ndbi = ndbi_median_raw.select("NDBI")
    
    # Construct gap-filled NDVI using the same harmonized collection as NDBI
    def compute_ndvi(image):
        return image.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI").copyProperties(image, ["system:time_start"])
    
    def apply_scale_factors(image):
        optical = image.select("SR_B.").multiply(0.0000275).add(-0.2)
        return image.addBands(optical, None, True)
        
    collection = get_harmonized_landsat_collection(start_date, end_date, aoi, max_cloud_cover=80).map(apply_scale_factors).map(compute_ndvi)
    ndvi = gap_fill(collection.median()).clip(aoi)

    # Strictly clip all maps to the exact boundaries of the AOI so there is no edge spillover
    lst = lst.clip(aoi)
    ndbi = ndbi.clip(aoi)
    ndvi = ndvi.clip(aoi)

    # Combine
    combined = lst.addBands(ndbi).addBands(ndvi)
    
    # Admin Boundary Zonal Stats (Sector-level) instead of arbitrary grid
    sectors_gdf, grid_fc = _get_sectors_fc(aoi)
    
    # Reduce at 100m resolution (matching Landsat TIRS native resolution)
    scale = get_dynamic_scale(aoi)
    stats_fc = combined.reduceRegions(collection=grid_fc, reducer=ee.Reducer.mean(), scale=scale)
    
    return aoi, lst, ndbi, ndvi, stats_fc, sectors_gdf

def _render_bivariate_map(gdf, no_data, aoi, aoi_config, bivar_colors, bivar_labels):
    # Renders the actual Sectors instead of grid cells
    fig, ax = plt.subplots(figsize=(8, 8))
    ax.set_aspect("equal")
    # Filter to only Polygons/MultiPolygons to prevent matplotlib Line2D 'edgecolor' error on slivers/lines
    if len(gdf):
        gdf = gpd.GeoDataFrame(gdf, geometry="geometry", crs="EPSG:4326")
        gdf = gdf[gdf.geom_type.isin(["Polygon", "MultiPolygon"])]
        if len(gdf):
            gdf.plot(ax=ax, color=gdf["bivar_color"], edgecolor="white", linewidth=0.6)
            
    if len(no_data):
        gdf_nd = gpd.GeoDataFrame(no_data, geometry="geometry", crs="EPSG:4326")
        gdf_nd = gdf_nd[gdf_nd.geom_type.isin(["Polygon", "MultiPolygon"])]
        if len(gdf_nd):
            gdf_nd.plot(ax=ax, color=NO_DATA_COLOR, edgecolor="#999999", linewidth=0.4, hatch="///")
    
    district_name = aoi_config.get("district", aoi_config.get("name", "Custom AOI"))
    ax.set_title(f"Bivariate: LST × NDBI (Admin Sectors)\n{district_name}", fontsize=11, fontweight="bold")
    
    legend_ax = ax.inset_axes([0.01, 0.01, 0.35, 0.35])
    legend_ax.set_xlim(0, len(bivar_labels)); legend_ax.set_ylim(0, len(bivar_labels))
    for i, ll in enumerate(bivar_labels):
        for j, nl in enumerate(bivar_labels):
            legend_ax.add_patch(mpatches.Rectangle((j, i), 1, 1, color=bivar_colors.get((ll, nl), "#cccccc"), ec="white", lw=0.5))
    ticks = [x + 0.5 for x in range(len(bivar_labels))]
    legend_ax.set_xticks(ticks); legend_ax.set_xticklabels(bivar_labels, fontsize=5, rotation=45)
    legend_ax.set_yticks(ticks); legend_ax.set_yticklabels(bivar_labels, fontsize=5)
    legend_ax.set_xlabel("NDBI →", fontsize=5.5, labelpad=1); legend_ax.set_ylabel("LST →", fontsize=5.5, labelpad=1)
    legend_ax.tick_params(length=0)
    
    ax.axis("off")
    
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="white", transparent=True)
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _render_scatter(df: pd.DataFrame, intercept, slope_ndbi, slope_ndvi, r2, p, n) -> str:
    x_line = np.linspace(df["NDBI"].min(), df["NDBI"].max(), 100)
    # Hold NDVI at its mean to plot the partial regression line of NDBI
    mean_ndvi = df["NDVI"].mean()
    y_line = intercept + (slope_ndbi * x_line) + (slope_ndvi * mean_ndvi)
    
    fig, ax = plt.subplots(figsize=(6, 6))
    
    # Bubble plot where size = NDVI (Vegetation Cooling Effect)
    sizes = (df["NDVI"] - df["NDVI"].min()) / (df["NDVI"].max() - df["NDVI"].min() + 1e-6)
    sizes = sizes * 150 + 20
    
    scatter = ax.scatter(df["NDBI"], df["LST"], c=df["bivar_color"], s=sizes, edgecolors="black", linewidths=0.6, alpha=0.8, zorder=3)
    ax.plot(x_line, y_line, color="#1a1a2e", linewidth=2, linestyle="--", label=f"Multivariate OLS Fit", zorder=4)
    
    stats_text = (f"R²={r2:.4f} (p={p:.4g})\n"
                  f"NDBI Slope={slope_ndbi:.2f} (Heating)\n"
                  f"NDVI Slope={slope_ndvi:.2f} (Cooling)\n"
                  f"n={n} Sectors")
    
    ax.text(0.04, 0.97, stats_text, transform=ax.transAxes, fontsize=9,
            verticalalignment="top", bbox=dict(boxstyle="round,pad=0.4", facecolor="#fff8e7", edgecolor="#ccaa00", alpha=0.95))
            
    ax.set_xlabel("Mean NDBI (Urban Density)", fontsize=10); ax.set_ylabel("Mean LST (°C)", fontsize=10)
    ax.set_title("Multivariate: Heat vs Urban Density & Vegetation", fontsize=11, fontweight="bold")
    ax.legend(fontsize=8, loc="lower right"); ax.grid(True, alpha=0.25, linestyle="--")
    ax.spines[["top", "right"]].set_visible(False)
    
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")

def compute_uhi(aoi_config: dict, start_date: str, end_date: str, grid_size: int = 6, n_classes: int = 5, method: str = "natural_breaks", custom_labels: list = None, lst_source: str = "hybrid") -> dict:
    cache_key = ("uhi_all", json.dumps(aoi_config, sort_keys=True), start_date, end_date, grid_size, n_classes, method, tuple(custom_labels) if custom_labels else None, lst_source)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, lst_median, ndbi_median, ndvi_median, stats_fc, sectors_gdf = _build_uhi_base(aoi_config, start_date, end_date, grid_size, lst_source)
    bounds = aoi.bounds().getInfo()["coordinates"][0]
    center = [(bounds[0][1] + bounds[2][1]) / 2, (bounds[0][0] + bounds[2][0]) / 2]
    scale = get_dynamic_scale(aoi)

    # Server-side percentile reduction for LST and NDBI
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_lst_pct = executor.submit(
            lambda: lst_median.reduceRegion(reducer=ee.Reducer.percentile([2, 98]), geometry=aoi, scale=scale, maxPixels=1e10).getInfo()
        )
        f_ndbi_pct = executor.submit(
            lambda: ndbi_median.reduceRegion(reducer=ee.Reducer.percentile([2, 98]), geometry=aoi, scale=scale, maxPixels=1e10).getInfo()
        )
        lst_pct = f_lst_pct.result()
        ndbi_pct = f_ndbi_pct.result()

    lst_vis_cont = {"min": lst_pct.get("LST_p2", 15), "max": lst_pct.get("LST_p98", 40),
               "palette": ["#313695", "#74add1", "#fee090", "#f46d43", "#a50026"]}
    ndbi_vis_cont = {"min": ndbi_pct.get("NDBI_p2", -0.3), "max": ndbi_pct.get("NDBI_p98", 0.3),
                "palette": ["#1a9850", "#d9ef8b", "#fee08b", "#f46d43", "#a50026"]}

    # Create Map IDs for the frontend Map component
    # Also push bivariate class visualization completely to GEE if we had time, but
    # the frontend relies on bivariate_png. We will serve both!
    
    lst_tile_url = lst_median.getMapId(lst_vis_cont)["tile_fetcher"].url_format
    ndbi_tile_url = ndbi_median.getMapId(ndbi_vis_cont)["tile_fetcher"].url_format
    
    lst_thumb_url = lst_median.getThumbURL({**lst_vis_cont, "region": aoi.bounds(), "dimensions": 800, "format": "png"})
    ndbi_thumb_url = ndbi_median.getThumbURL({**ndbi_vis_cont, "region": aoi.bounds(), "dimensions": 800, "format": "png"})

    # Zonal Stats
    features = stats_fc.getInfo()["features"]
    
    n_classes = max(4, min(n_classes, 10))
    bivar_labels = custom_labels if custom_labels and len(custom_labels) == n_classes else [f"Class {i+1}" for i in range(n_classes)]
    
    bivar_colors = {}
    for i, y_lbl in enumerate(bivar_labels):
        for j, x_lbl in enumerate(bivar_labels):
            wy = i / (n_classes - 1)
            wx = j / (n_classes - 1)
            c_y0 = [ (1 - wx) * _c_ll[k] + wx * _c_lh[k] for k in range(3) ]
            c_y1 = [ (1 - wx) * _c_hl[k] + wx * _c_hh[k] for k in range(3) ]
            c = [ int((1 - wy) * c_y0[k] + wy * c_y1[k]) for k in range(3) ]
            bivar_colors[(y_lbl, x_lbl)] = f"#{c[0]:02x}{c[1]:02x}{c[2]:02x}"
            
    rows = []
    for f in features:
        props = f["properties"]
        if props.get("LST") is not None and props.get("NDBI") is not None and props.get("NDVI") is not None:
            rows.append({"grid_id": props.get("grid_id"), "LST": props.get("LST"), "NDBI": props.get("NDBI"), "NDVI": props.get("NDVI")})
                         
    stats_df = pd.DataFrame(rows)
    
    sectors_gdf["grid_id"] = sectors_gdf["NAME_3"].fillna(pd.Series([f"Sector_{i}" for i in range(len(sectors_gdf))]))
    if not stats_df.empty:
        df = pd.merge(sectors_gdf, stats_df, on="grid_id", how="left")
    else:
        df = sectors_gdf
        df["LST"] = None; df["NDBI"] = None; df["NDVI"] = None
        
    df = df[df["geometry"].apply(lambda g: g is not None and not g.is_empty)] if not df.empty else df

    has_data = df.dropna(subset=["LST", "NDBI", "NDVI"]).copy() if not df.empty else df
    no_data = df[df["LST"].isna() | df["NDBI"].isna()].copy() if not df.empty else df

    lst_stats = {"Mean (°C)": round(has_data["LST"].mean(), 2) if len(has_data) else None,
                 "Min (°C)": round(has_data["LST"].min(), 2) if len(has_data) else None,
                 "Max (°C)": round(has_data["LST"].max(), 2) if len(has_data) else None}
    ndbi_stats = {"Mean": round(has_data["NDBI"].mean(), 4) if len(has_data) else None,
                  "Min": round(has_data["NDBI"].min(), 4) if len(has_data) else None,
                  "Max": round(has_data["NDBI"].max(), 4) if len(has_data) else None}

    regression = None
    bivariate_png_b64 = ""
    scatter_png_b64 = ""

    if len(has_data) >= 4:
        def get_jenks_breaks_1d(values, n_classes=3):
            import random
            vals = sorted(list(values))
            if len(vals) <= n_classes: return vals
            centroids = [vals[int(i * len(vals) / n_classes)] for i in range(n_classes)]
            for _ in range(30):
                clusters = [[] for _ in range(n_classes)]
                cluster_sums = [0.0] * n_classes
                for val in vals:
                    distances = [abs(val - c) for c in centroids]
                    min_dist_idx = distances.index(min(distances))
                    clusters[min_dist_idx].append(val)
                    cluster_sums[min_dist_idx] += val
                new_centroids = []
                for i, cl in enumerate(clusters):
                    if len(cl) > 0:
                        new_centroids.append(cluster_sums[i] / len(cl))
                    else:
                        new_centroids.append(random.choice(vals))
                new_centroids.sort()
                if centroids == new_centroids: break
                centroids = new_centroids
            breaks = []
            for cl in clusters[:-1]:
                if cl: breaks.append(max(cl))
            return sorted(list(set(breaks)))

        def classify_1d(series, labels=bivar_labels, classification_method=method):
            valid_vals = series.dropna().tolist()
            if len(valid_vals) < len(labels):
                res = pd.qcut(series, q=len(labels), labels=labels, retbins=True, duplicates="drop")
                return res[0], res[1].tolist()
            if classification_method == "quantiles":
                res = pd.qcut(series, q=len(labels), labels=labels, retbins=True, duplicates="drop")
                if len(res[1]) - 1 == len(labels):
                    return res[0], res[1].tolist()
            elif classification_method == "equal_interval":
                res = pd.cut(series, bins=len(labels), labels=labels, include_lowest=True, retbins=True)
                return res[0], res[1].tolist()
            # Jenks
            breaks = get_jenks_breaks_1d(valid_vals, len(labels))
            bins = [-float("inf")] + breaks + [float("inf")]
            bins = sorted(list(set(bins)))
            if len(bins) - 1 == len(labels):
                res = pd.cut(series, bins=bins, labels=labels, include_lowest=True, retbins=True)
                return res[0], res[1].tolist()
            else:
                res = pd.qcut(series, q=len(labels), labels=labels[:len(bins)-1], retbins=True, duplicates="drop")
                return res[0], res[1].tolist()

        try:
            has_data["LST_class"], lst_bins = classify_1d(has_data["LST"])
            has_data["NDBI_class"], ndbi_bins = classify_1d(has_data["NDBI"])
        except Exception:
            has_data["LST_class"] = bivar_labels[n_classes // 2]
            has_data["NDBI_class"] = bivar_labels[n_classes // 2]
            
        has_data["bivar_color"] = has_data.apply(
            lambda r: bivar_colors.get((str(r["LST_class"]), str(r["NDBI_class"])), "#cccccc"), axis=1
        )

        # Multivariate Regression: LST = intercept + slope_ndbi * NDBI + slope_ndvi * NDVI
        # Using numpy lstsq for multiple regression
        X = np.column_stack((has_data["NDBI"], has_data["NDVI"], np.ones(len(has_data))))
        y = has_data["LST"]
        coeffs, residuals, rank, s = np.linalg.lstsq(X, y, rcond=None)
        slope_ndbi, slope_ndvi, intercept = coeffs
        
        # R-squared
        y_pred = X.dot(coeffs)
        ss_res = np.sum((y - y_pred)**2)
        ss_tot = np.sum((y - np.mean(y))**2)
        r2 = 1 - (ss_res / ss_tot)
        
        # P-value (approx via F-test)
        n = len(y)
        k = 2 # predictors
        f_stat = (r2 / k) / ((1 - r2) / (n - k - 1))
        p_val = 1 - scipy_stats.f.cdf(f_stat, k, n - k - 1)

        regression = {"slope": round(float(slope_ndbi), 4), "intercept": round(float(intercept), 4),
                      "slope_ndvi": round(float(slope_ndvi), 4),
                      "r2": round(float(r2), 4), "p_value": float(p_val), "n": int(n)}

        bivariate_png_b64 = _render_bivariate_map(has_data, no_data, aoi, aoi_config, bivar_colors, bivar_labels)
        scatter_png_b64 = _render_scatter(has_data, intercept, slope_ndbi, slope_ndvi, r2, p_val, n)

    result = {
        "center": center,
        "bbox": bounds,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
        "start_date": start_date,
        "end_date": end_date,
        "lst_tile_url": lst_tile_url,
        "lst_download_url": "",
        "lst_thumb_url": lst_thumb_url,
        "ndbi_tile_url": ndbi_tile_url,
        "ndbi_download_url": "",
        "ndbi_thumb_url": ndbi_thumb_url,
        "lst_stats": lst_stats,
        "ndbi_stats": ndbi_stats,
        "n_cells_total": int(len(df)),
        "n_cells_with_data": int(len(has_data)),
        "n_cells_no_data": int(len(no_data)),
        "regression": regression,
        "bivariate_png": bivariate_png_b64,
        "scatter_png": scatter_png_b64,
        "grid_table": has_data[["grid_id", "LST", "NDBI", "NDVI"]].round(3).to_dict("records") if len(has_data) else [],
    }
    
    with _lock:
        _cache[cache_key] = result
    return result

def compute_uhi_map(aoi_config: dict, start_date: str, end_date: str, grid_size: int = 6, lst_source: str = "hybrid") -> dict:
    return compute_uhi(aoi_config, start_date, end_date, grid_size, lst_source=lst_source)
def compute_uhi_stats(aoi_config: dict, start_date: str, end_date: str, grid_size: int = 6, lst_source: str = "hybrid") -> dict:
    return compute_uhi(aoi_config, start_date, end_date, grid_size, lst_source=lst_source)
def compute_uhi_classify(aoi_config: dict, start_date: str, end_date: str, grid_size: int = 6, n_classes: int = 5, method: str = "natural_breaks", custom_labels: list = None, lst_source: str = "hybrid") -> dict:
    return compute_uhi(aoi_config, start_date, end_date, grid_size, n_classes, method, custom_labels, lst_source=lst_source)
def compute_uhi_export(aoi_config: dict, start_date: str, end_date: str, grid_size: int = 6, lst_source: str = "hybrid") -> dict:
    return compute_uhi(aoi_config, start_date, end_date, grid_size, lst_source=lst_source)
