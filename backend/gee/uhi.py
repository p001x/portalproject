from __future__ import annotations
import json
"""Urban Heat Island (UHI) — LST × NDBI bivariate analysis. No Streamlit dep."""
import base64
import io
import ee

def get_dynamic_scale(geom):
    try:
        area_sqkm = geom.area().divide(1e6).getInfo()
        if area_sqkm > 10000: return 500
        elif area_sqkm > 2000: return 250
        elif area_sqkm > 500: return 100
        else: return 30
    except:
        return 250

import concurrent.futures
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from shapely.geometry import shape as shapely_shape
from cachetools import TTLCache
from threading import Lock
from gee.lst import lst_image_and_aoi
from gee.ndbi import ndbi_image_and_aoi

_cache: TTLCache = TTLCache(maxsize=32, ttl=3600)
_lock = Lock()

_c_ll = (232, 232, 232)
_c_hl = (190, 100, 172)
_c_lh = (90, 200, 200)
_c_hh = (59, 73, 148)

NO_DATA_COLOR = "#d0d0d0"


def _grid_cells(aoi, grid_size: int):
    bounds = aoi.bounds().getInfo()["coordinates"][0]
    lon_min, lat_min = bounds[0]
    lon_max, lat_max = bounds[2]
    dx = (lon_max - lon_min) / grid_size
    dy = (lat_max - lat_min) / grid_size
    features = []
    cell_id = 0
    for i in range(grid_size):
        for j in range(grid_size):
            rect = ee.Geometry.Rectangle([lon_min + i * dx, lat_min + j * dy,
                                          lon_min + (i + 1) * dx, lat_min + (j + 1) * dy])
            features.append(ee.Feature(rect, {"grid_id": cell_id}))
            cell_id += 1
            
    # Intersect the grid with the AOI server-side to avoid duplicating the client-side AOI geometry in the request payload
    grid_fc = ee.FeatureCollection(features)
    return grid_fc.map(lambda f: ee.Feature(ee.Geometry(f.geometry()).intersection(aoi, ee.ErrorMargin(10)), f.toDictionary()))


def _build_uhi_base(aoi_config: dict, start_date: str, end_date: str, grid_size: int):
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    lst_median_raw, _ = lst_image_and_aoi(aoi_config, start_date, end_date)
    lst_median = lst_median_raw.select("LST")
    ndbi_median_raw, _ = ndbi_image_and_aoi(aoi_config, start_date, end_date)
    ndbi_median = ndbi_median_raw.select("NDBI")

    grid_fc = _grid_cells(aoi, grid_size)
    combined = lst_median.rename("LST").addBands(ndbi_median.rename("NDBI"))
    stats_fc = combined.reduceRegions(collection=grid_fc, reducer=ee.Reducer.mean(), scale=get_dynamic_scale(aoi))
    
    return aoi, lst_median, ndbi_median, stats_fc

def compute_uhi_map(aoi_config: dict, start_date: str, end_date: str, grid_size: int = 6) -> dict:
    cache_key = ("uhi_map", json.dumps(aoi_config, sort_keys=True), start_date, end_date, grid_size)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]
            
    aoi, lst_median, ndbi_median, _ = _build_uhi_base(aoi_config, start_date, end_date, grid_size)
    bounds = aoi.bounds().getInfo()["coordinates"][0]
    center = [(bounds[0][1] + bounds[2][1]) / 2, (bounds[0][0] + bounds[2][0]) / 2]

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_lst_pct = executor.submit(
            lambda: lst_median.reduceRegion(reducer=ee.Reducer.percentile([2, 98]), geometry=aoi, scale=get_dynamic_scale(aoi), maxPixels=1e10).getInfo()
        )
        f_ndbi_pct = executor.submit(
            lambda: ndbi_median.reduceRegion(reducer=ee.Reducer.percentile([2, 98]), geometry=aoi, scale=get_dynamic_scale(aoi), maxPixels=1e10).getInfo()
        )
        lst_pct = f_lst_pct.result()
        ndbi_pct = f_ndbi_pct.result()

    lst_vis_cont = {"min": lst_pct.get("LST_p2", 15), "max": lst_pct.get("LST_p98", 40),
               "palette": ["#313695", "#74add1", "#fee090", "#f46d43", "#a50026"]}
    ndbi_vis_cont = {"min": ndbi_pct.get("NDBI_p2", -0.3), "max": ndbi_pct.get("NDBI_p98", 0.3),
                "palette": ["#1a9850", "#d9ef8b", "#fee08b", "#f46d43", "#a50026"]}

    lst_map_id = lst_median.getMapId(lst_vis_cont)
    ndbi_map_id = ndbi_median.getMapId(ndbi_vis_cont)

    result = {
        "lst_tile_url": lst_map_id["tile_fetcher"].url_format,
        "lst_thumb_url": lst_median.getThumbURL({**lst_vis_cont, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),
        "ndbi_tile_url": ndbi_map_id["tile_fetcher"].url_format,
        "ndbi_thumb_url": ndbi_median.getThumbURL({**ndbi_vis_cont, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),
        "center": center,
        "bbox": bounds,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
    }
    with _lock:
        _cache[cache_key] = result
    return result


def compute_uhi_stats(aoi_config: dict, start_date: str, end_date: str, grid_size: int = 6) -> dict:
    cache_key = ("uhi_stats", json.dumps(aoi_config, sort_keys=True), start_date, end_date, grid_size)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, lst_median, ndbi_median, stats_fc = _build_uhi_base(aoi_config, start_date, end_date, grid_size)
    features = stats_fc.getInfo()["features"]
    
    rows = []
    for f in features:
        props = f["properties"]
        if props.get("LST") is not None and props.get("NDBI") is not None:
            rows.append({"LST": props.get("LST"), "NDBI": props.get("NDBI")})
            
    df = pd.DataFrame(rows)
    
    result = {
        "lst_stats": {"Mean (°C)": round(df["LST"].mean(), 2) if len(df) else None,
                      "Min (°C)": round(df["LST"].min(), 2) if len(df) else None,
                      "Max (°C)": round(df["LST"].max(), 2) if len(df) else None},
        "ndbi_stats": {"Mean": round(df["NDBI"].mean(), 4) if len(df) else None,
                       "Min": round(df["NDBI"].min(), 4) if len(df) else None,
                       "Max": round(df["NDBI"].max(), 4) if len(df) else None},
        "n_cells_with_data": int(len(df)),
    }
    with _lock:
        _cache[cache_key] = result
    return result

def compute_uhi_classify(aoi_config: dict, start_date: str, end_date: str, grid_size: int = 6, n_classes: int = 5, method: str = "natural_breaks", custom_labels: list = None) -> dict:
    cache_key = ("uhi_classify", json.dumps(aoi_config, sort_keys=True), start_date, end_date, grid_size, n_classes, method, tuple(custom_labels) if custom_labels else None)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, lst_median, ndbi_median, stats_fc = _build_uhi_base(aoi_config, start_date, end_date, grid_size)
    
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
            
    features = stats_fc.getInfo()["features"]

    rows = []
    for f in features:
        props = f["properties"]
        geom = f.get("geometry")
        rows.append({"grid_id": props.get("grid_id"), "LST": props.get("LST"), "NDBI": props.get("NDBI"),
                     "geometry": shapely_shape(geom) if geom and geom.get("coordinates") else None})
    df = pd.DataFrame(rows)
    df = df[df["geometry"].apply(lambda g: g is not None and not g.is_empty)]

    has_data = df.dropna(subset=["LST", "NDBI"]).copy()
    no_data = df[df["LST"].isna() | df["NDBI"].isna()].copy()

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

            # Default to Natural Breaks (Jenks)
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
            lst_bins = []
            ndbi_bins = []
            
        has_data["bivar_color"] = has_data.apply(
            lambda r: bivar_colors.get((str(r["LST_class"]), str(r["NDBI_class"])), "#cccccc"), axis=1
        )

        slope, intercept, r, p, _ = scipy_stats.linregress(has_data["NDBI"], has_data["LST"])
        n = len(has_data)
        regression = {"slope": round(float(slope), 4), "intercept": round(float(intercept), 4),
                      "r2": round(float(r) ** 2, 4), "p_value": float(p), "n": int(n)}

        bivariate_png_b64 = _render_bivariate_map(has_data, no_data, aoi, aoi_config, bivar_colors, bivar_labels)
        scatter_png_b64 = _render_scatter(has_data, slope, intercept, r, p, n)

    result = {
        "n_cells_total": int(len(df)), "n_cells_with_data": int(len(has_data)), "n_cells_no_data": int(len(no_data)),
        "regression": regression,
        "bivariate_png": bivariate_png_b64,
        "scatter_png": scatter_png_b64,
        "grid_table": has_data[["grid_id", "LST", "NDBI"]].round(3).to_dict("records") if len(has_data) else [],
    }
    with _lock:
        _cache[cache_key] = result
    return result

def compute_uhi_export(aoi_config: dict, start_date: str, end_date: str, grid_size: int = 6) -> dict:
    cache_key = ("uhi_export", json.dumps(aoi_config, sort_keys=True), start_date, end_date, grid_size)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, lst_median, ndbi_median, _ = _build_uhi_base(aoi_config, start_date, end_date, grid_size)

    def safe_download(img, params):
        try:
            return img.getDownloadURL(params)
        except Exception:
            return None

    result = {
        "lst_download_url": safe_download(lst_median, {"region": aoi.bounds(), "scale": get_dynamic_scale(aoi), "format": "GEO_TIFF", "crs": "EPSG:4326", "maxPixels": 1e10}),
        "ndbi_download_url": safe_download(ndbi_median, {"region": aoi.bounds(), "scale": get_dynamic_scale(aoi), "format": "GEO_TIFF", "crs": "EPSG:4326", "maxPixels": 1e10}),
    }
    with _lock:
        _cache[cache_key] = result
    return result


def _render_bivariate_map(has_data: pd.DataFrame, no_data: pd.DataFrame, aoi, aoi_config: dict, bivar_colors: dict, bivar_labels: list) -> str:
    import geopandas as gpd
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.set_facecolor("#cce6ff")
    if len(has_data):
        gdf = gpd.GeoDataFrame(has_data, geometry="geometry", crs="EPSG:4326")
        gdf.plot(ax=ax, color=gdf["bivar_color"], edgecolor="white", linewidth=0.6)
    if len(no_data):
        gdf_nd = gpd.GeoDataFrame(no_data, geometry="geometry", crs="EPSG:4326")
        gdf_nd.plot(ax=ax, color=NO_DATA_COLOR, edgecolor="#999999", linewidth=0.4, hatch="///")
    district_name = aoi_config.get("district", aoi_config.get("name", "Custom AOI"))
    ax.set_title(f"Bivariate: LST × NDBI\n{district_name}", fontsize=11, fontweight="bold")
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
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _render_scatter(df: pd.DataFrame, slope, intercept, r, p, n) -> str:
    x_line = np.linspace(df["NDBI"].min(), df["NDBI"].max(), 100)
    y_line = slope * x_line + intercept
    residuals = df["LST"] - (slope * df["NDBI"] + intercept)
    se_resid = np.sqrt(np.sum(residuals ** 2) / max(n - 2, 1))
    ci = 1.96 * se_resid * np.sqrt(1 / n + (x_line - df["NDBI"].mean()) ** 2 / max(np.sum((df["NDBI"] - df["NDBI"].mean()) ** 2), 1e-9))
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.scatter(df["NDBI"], df["LST"], c=df["bivar_color"], edgecolors="black", linewidths=0.6, s=90, zorder=3)
    ax.plot(x_line, y_line, color="#1a1a2e", linewidth=2, linestyle="--", label=f"OLS: y={slope:.2f}x+{intercept:.2f}", zorder=4)
    ax.fill_between(x_line, y_line - ci, y_line + ci, alpha=0.15, color="#1a1a2e", label="95% CI")
    ax.text(0.04, 0.97, f"R²={r**2:.4f}\nSlope={slope:.2f}\np={p:.4g}\nn={n}", transform=ax.transAxes, fontsize=9,
            verticalalignment="top", bbox=dict(boxstyle="round,pad=0.4", facecolor="#fff8e7", edgecolor="#ccaa00", alpha=0.95))
    ax.set_xlabel("Mean NDBI per grid cell", fontsize=10); ax.set_ylabel("Mean LST (°C)", fontsize=10)
    ax.set_title("OLS Regression: LST vs NDBI", fontsize=11, fontweight="bold")
    ax.legend(fontsize=8, loc="lower right"); ax.grid(True, alpha=0.25, linestyle="--")
    ax.spines[["top", "right"]].set_visible(False)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")

def compute_uhi(aoi_config: dict, start_date: str, end_date: str, grid_size: int = 6, n_classes: int = 5, method: str = "natural_breaks", custom_labels: list = None) -> dict:
    cache_key = ("uhi_all", json.dumps(aoi_config, sort_keys=True), start_date, end_date, grid_size, n_classes, method, tuple(custom_labels) if custom_labels else None)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    # Replicate logic from map, stats, classify, export efficiently
    aoi, lst_median, ndbi_median, stats_fc = _build_uhi_base(aoi_config, start_date, end_date, grid_size)
    bounds = aoi.bounds().getInfo()["coordinates"][0]
    center = [(bounds[0][1] + bounds[2][1]) / 2, (bounds[0][0] + bounds[2][0]) / 2]

    # Map part
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_lst_pct = executor.submit(
            lambda: lst_median.reduceRegion(reducer=ee.Reducer.percentile([2, 98]), geometry=aoi, scale=get_dynamic_scale(aoi), maxPixels=1e10).getInfo()
        )
        f_ndbi_pct = executor.submit(
            lambda: ndbi_median.reduceRegion(reducer=ee.Reducer.percentile([2, 98]), geometry=aoi, scale=get_dynamic_scale(aoi), maxPixels=1e10).getInfo()
        )
        lst_pct = f_lst_pct.result()
        ndbi_pct = f_ndbi_pct.result()

    lst_vis_cont = {"min": lst_pct.get("LST_p2", 15), "max": lst_pct.get("LST_p98", 40),
               "palette": ["#313695", "#74add1", "#fee090", "#f46d43", "#a50026"]}
    ndbi_vis_cont = {"min": ndbi_pct.get("NDBI_p2", -0.3), "max": ndbi_pct.get("NDBI_p98", 0.3),
                "palette": ["#1a9850", "#d9ef8b", "#fee08b", "#f46d43", "#a50026"]}

    lst_map_id = lst_median.getMapId(lst_vis_cont)
    ndbi_map_id = ndbi_median.getMapId(ndbi_vis_cont)
    
    lst_tile_url = lst_map_id["tile_fetcher"].url_format
    ndbi_tile_url = ndbi_map_id["tile_fetcher"].url_format
    lst_thumb_url = lst_median.getThumbURL({**lst_vis_cont, "region": aoi.bounds(), "dimensions": 800, "format": "png"})
    ndbi_thumb_url = ndbi_median.getThumbURL({**ndbi_vis_cont, "region": aoi.bounds(), "dimensions": 800, "format": "png"})

    # Export part
    def safe_download(img, params):
        try:
            return img.getDownloadURL(params)
        except Exception:
            return None

    lst_download_url = safe_download(lst_median, {"region": aoi.bounds(), "scale": get_dynamic_scale(aoi), "format": "GEO_TIFF", "crs": "EPSG:4326", "maxPixels": 1e10})
    ndbi_download_url = safe_download(ndbi_median, {"region": aoi.bounds(), "scale": get_dynamic_scale(aoi), "format": "GEO_TIFF", "crs": "EPSG:4326", "maxPixels": 1e10})

    # Stats and Classify part
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
        geom = f.get("geometry")
        if props.get("LST") is not None and props.get("NDBI") is not None:
            rows.append({"grid_id": props.get("grid_id"), "LST": props.get("LST"), "NDBI": props.get("NDBI"),
                         "geometry": shapely_shape(geom) if geom and geom.get("coordinates") else None})
    df = pd.DataFrame(rows)
    df = df[df["geometry"].apply(lambda g: g is not None and not g.is_empty)] if not df.empty else df

    has_data = df.dropna(subset=["LST", "NDBI"]).copy() if not df.empty else df
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

            # Default to Natural Breaks (Jenks)
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

        slope, intercept, r, p, _ = scipy_stats.linregress(has_data["NDBI"], has_data["LST"])
        n = len(has_data)
        regression = {"slope": round(float(slope), 4), "intercept": round(float(intercept), 4),
                      "r2": round(float(r) ** 2, 4), "p_value": float(p), "n": int(n)}

        bivariate_png_b64 = _render_bivariate_map(has_data, no_data, aoi, aoi_config, bivar_colors, bivar_labels)
        scatter_png_b64 = _render_scatter(has_data, slope, intercept, r, p, n)

    result = {
        "center": center,
        "bbox": bounds,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
        "start_date": start_date,
        "end_date": end_date,
        "lst_tile_url": lst_tile_url,
        "lst_download_url": lst_download_url,
        "lst_thumb_url": lst_thumb_url,
        "ndbi_tile_url": ndbi_tile_url,
        "ndbi_download_url": ndbi_download_url,
        "ndbi_thumb_url": ndbi_thumb_url,
        "lst_stats": lst_stats,
        "ndbi_stats": ndbi_stats,
        "n_cells_total": int(len(df)),
        "n_cells_with_data": int(len(has_data)),
        "n_cells_no_data": int(len(no_data)),
        "regression": regression,
        "bivariate_png": bivariate_png_b64,
        "scatter_png": scatter_png_b64,
        "grid_table": has_data[["grid_id", "LST", "NDBI"]].round(3).to_dict("records") if len(has_data) else [],
    }
    
    with _lock:
        _cache[cache_key] = result
    return result
