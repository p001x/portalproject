import json
"""RUSLE soil erosion analysis — no Streamlit dependency."""
import math
import ee
from cachetools import TTLCache
import concurrent.futures
from threading import Lock

_cache: TTLCache = TTLCache(maxsize=64, ttl=3600)
_lock = Lock()

FACTOR_VIS = {
    "R": {"label": "R — Rainfall Erosivity", "unit": "MJ·mm·ha⁻¹·h⁻¹·yr⁻¹",
          "description": "Roose (1977): R = 38.5 + 0.35×P (CHIRPS annual rainfall)",
          "min": 700, "max": 1300,
          "palette": ["#ffffcc", "#a1dab4", "#41b6c4", "#2c7fb8", "#253494"],
          "normal_desc": "Higher rainfall erosivity = higher erosion risk",
          "reversed_desc": "Higher rainfall erosivity treated as lower risk (reversed)"},
    "K": {"label": "K — Soil Erodibility", "unit": "t·ha·h·MJ⁻¹·ha⁻¹·mm⁻¹",
          "description": "Williams (1995) EPIC formula — OpenLandMap clay & sand (0–10 cm)",
          "min": 0.020, "max": 0.060,
          "palette": ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"],
          "normal_desc": "More erodible soil = higher erosion risk",
          "reversed_desc": "More erodible soil treated as lower risk (reversed)"},
    "LS": {"label": "LS — Topographic Factor", "unit": "dimensionless",
           "description": "L: Desmet & Govers (1996) via HydroSHEDS; S: McCool et al. (1987)",
           "min": 0, "max": 100,
           "palette": ["#f7fcfd", "#e0ecf4", "#bfd3e6", "#9ebcda", "#8c96c6", "#88419d", "#6e016b"],
           "normal_desc": "Longer/steeper slopes = higher erosion risk",
           "reversed_desc": "Longer/steeper slopes treated as lower risk (reversed)"},
    "C": {"label": "C — Cover Management", "unit": "0 – 1",
          "description": "Van der Knijff (2000): C = exp(−2×NDVI/(1−NDVI)) — Sentinel-2 SR",
          "min": 0.0, "max": 1.0,
          "palette": ["#1a9641", "#a6d96a", "#ffffbf", "#fdae61", "#d7191c"],
          "normal_desc": "Less vegetation cover = higher erosion risk",
          "reversed_desc": "Less vegetation cover treated as lower risk (reversed)"},
    "P": {"label": "P — Support Practice", "unit": "0 – 1",
          "description": "Slope-based Rwanda terracing: <5°→0.10 … >30°→1.00",
          "min": 0.0, "max": 1.0,
          "palette": ["#1a9641", "#a6d96a", "#ffffbf", "#fdae61", "#d7191c"],
          "normal_desc": "Less conservation support = higher erosion risk",
          "reversed_desc": "Less conservation support treated as lower risk (reversed)"},
    "A": {"label": "A — Annual Soil Loss", "unit": "t·ha⁻¹·yr⁻¹",
          "description": "RUSLE result: A = R × K × LS × C × P",
          "min": 0, "max": 200,
          "palette": ["#1a9641", "#a6d96a", "#ffffbf", "#fdae61", "#d7191c"]},
}

RECLASS_FACTOR_ORDER = ["R", "K", "LS", "C", "P"]
RECLASS_WEIGHT_PCT = 20


def _class_palette(n: int) -> list:
    full = ["#1a9850", "#66bd63", "#a6d96a", "#d9ef8b", "#ffffbf",
            "#fee08b", "#fdae61", "#f46d43", "#d73027", "#a50026"]
    if n == 1:
        return ["#ffffbf"]
    if n >= len(full):
        return full[:n]
    step = (len(full) - 1) / (n - 1)
    return [full[round(i * step)] for i in range(n)]


def _class_tile_url(cls_img, n_classes: int) -> str:
    vis = {"min": 1, "max": n_classes, "palette": _class_palette(n_classes)}
    smoothed = cls_img.focal_mode(150, 'circle', 'meters')
    return smoothed.getMapId(vis)["tile_fetcher"].url_format


def _class_thumb_url(cls_img, n_classes: int, aoi) -> str:
    vis = {"min": 1, "max": n_classes, "palette": _class_palette(n_classes)}
    smoothed = cls_img.focal_mode(150, 'circle', 'meters')
    return smoothed.getThumbURL({**vis, "region": aoi.bounds(), "dimensions": 512, "format": "png"})


def _factor_urls(image, key: str, aoi) -> dict:
    vis = FACTOR_VIS[key]
    vp = {"min": vis["min"], "max": vis["max"], "palette": vis["palette"]}
    smoothed = image.focal_mean(150, 'circle', 'meters')
    return {
        "tile_url": smoothed.getMapId(vp)["tile_fetcher"].url_format,
        "thumb_url": smoothed.getThumbURL({**vp, "region": aoi.bounds(), "dimensions": 512, "format": "png"}),
    }


def _classify_from_breakpoints(img, breakpoints: list, reverse: bool = False):
    cls = ee.Image(1)
    for i, bp in enumerate(breakpoints):
        cls = cls.where(img.gt(bp), i + 2)
    if reverse:
        n = len(breakpoints) + 1
        cls = ee.Image(n + 1).subtract(cls)
    return cls


def compute_rusle(
    aoi_config: dict, year: int, n_classes: int = 5,
    reverse_r: bool = False, reverse_k: bool = False, reverse_ls: bool = False,
    reverse_c: bool = False, reverse_p: bool = False,
) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), year, n_classes, reverse_r, reverse_k, reverse_ls, reverse_c, reverse_p)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    start = f"{year}-01-01"
    end = f"{year}-12-31"

    chirps_annual = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate(start, end).filterBounds(aoi).sum()
    R = chirps_annual.multiply(0.35).add(38.5).rename("R")

    clay = ee.Image("projects/soilgrids-isric/clay_mean_0-5cm_250m").select(0).divide(10)
    sand = ee.Image("projects/soilgrids-isric/sand_mean_0-5cm_250m").select(0).divide(10)
    silt = clay.add(sand).multiply(-1).add(100).max(1)
    f_csand = sand.multiply(clay.add(sand).divide(100)).multiply(-0.0256).exp().multiply(0.3).add(0.2)
    f_cl_si = silt.divide(clay.add(silt).max(1)).pow(0.3)
    K = f_csand.multiply(f_cl_si).multiply(0.763).multiply(0.1317).max(0.020).min(0.060).rename("K")

    dem = ee.Image("USGS/SRTMGL1_003").select("elevation")
    slope_deg = ee.Terrain.slope(dem)
    slope_rad = slope_deg.multiply(math.pi / 180)
    sin_theta = slope_rad.sin()
    flow_acc = ee.Image("WWF/HydroSHEDS/15ACC").select("b1").max(0)
    cell_area_m2 = 450.0 * 450.0
    As = flow_acc.add(0.5).multiply(cell_area_m2)
    L = As.divide(22.13).pow(0.4)
    S_gentle = sin_theta.multiply(10.8).add(0.03)
    S_steep = sin_theta.multiply(16.8).subtract(0.50)
    S = S_gentle.where(slope_deg.gte(5.14), S_steep).max(0.03)
    LS = L.multiply(S).min(300).rename("LS")

    s2_ndvi_col = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterDate(start, end)
        .filterBounds(aoi)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30))
        .map(lambda img: img.normalizedDifference(["B8", "B4"]).rename("NDVI"))
    )
    l8_ndvi_col = (
        ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
        .filterDate(start, end)
        .filterBounds(aoi)
        .filter(ee.Filter.lt("CLOUD_COVER", 30))
        .map(lambda img: img.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI"))
    )
    l7_ndvi_col = (
        ee.ImageCollection("LANDSAT/LE07/C02/T1_L2")
        .filterDate(start, end)
        .filterBounds(aoi)
        .filter(ee.Filter.lt("CLOUD_COVER", 30))
        .map(lambda img: img.normalizedDifference(["SR_B4", "SR_B3"]).rename("NDVI"))
    )
    ndvi = s2_ndvi_col.merge(l8_ndvi_col).merge(l7_ndvi_col).median()
    ndvi_safe = ndvi.max(0.001).min(0.990)
    C = ndvi_safe.multiply(-2).divide(ndvi_safe.multiply(-1).add(1)).exp().max(0.001).min(1.0).rename("C")

    P = (ee.Image(1.0).where(slope_deg.lt(5), 0.10).where(slope_deg.gte(5).And(slope_deg.lt(10)), 0.12)
         .where(slope_deg.gte(10).And(slope_deg.lt(15)), 0.14).where(slope_deg.gte(15).And(slope_deg.lt(20)), 0.19)
         .where(slope_deg.gte(20).And(slope_deg.lt(25)), 0.25).where(slope_deg.gte(25).And(slope_deg.lt(30)), 0.50)
         .where(slope_deg.gte(30), 1.00).rename("P"))

    A = R.multiply(K).multiply(LS).multiply(C).multiply(P).rename("A")
    A = A.where(A.lt(0), 0).clip(aoi)

    factor_img = R.rename("R").addBands(K.rename("K")).addBands(LS.rename("LS")).addBands(C.rename("C")).addBands(P.rename("P"))

    factor_images = {"R": R, "K": K, "LS": LS, "C": C, "P": P, "A": A}

    fixed_class_thresholds = [
        ("Very Low (<10 t/ha/yr)", A.lt(10)),
        ("Low (10–30)", A.gte(10).And(A.lt(30))),
        ("Moderate (30–50)", A.gte(30).And(A.lt(50))),
        ("High (50–100)", A.gte(50).And(A.lt(100))),
        ("Very High (100–200)", A.gte(100).And(A.lt(200))),
        ("Extreme (>200)", A.gte(200)),
    ]
    fixed_labels = [lbl for lbl, _ in fixed_class_thresholds]
    fixed_area_img = ee.Image.cat([mask.multiply(ee.Image.pixelArea()).rename(f"c{i}") for i, (_, mask) in enumerate(fixed_class_thresholds)])

    n_classes = max(2, min(n_classes, 10))
    all_factors_img = ee.Image.cat([R.rename("R"), K.rename("K"), LS.rename("LS"), C.rename("C"), P.rename("P"), A.rename("A")])

    # OPTIMIZATION: Combine mean/min/max/stdDev into a single pass (removed percentile to avoid execution limit and ensure clear equal-interval classes)
    combined_reducer = (
        ee.Reducer.mean()
        .combine(ee.Reducer.min(), sharedInputs=True)
        .combine(ee.Reducer.max(), sharedInputs=True)
        .combine(ee.Reducer.stdDev(), sharedInputs=True)
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_combined = executor.submit(
            lambda: all_factors_img.reduceRegion(
                reducer=combined_reducer, geometry=aoi, scale=250, maxPixels=10000, bestEffort=True, tileScale=4
            ).getInfo()
        )
        f_bounds = executor.submit(
            lambda: aoi.bounds().getInfo()["coordinates"][0]
        )

        combined_dict = f_combined.result()
        bounds = f_bounds.result()

    # Reconstruct the expected variable names from the combined dictionary
    stats_raw = {
        "A_mean": combined_dict.get("A_mean"),
        "A_min": combined_dict.get("A_min"),
        "A_max": combined_dict.get("A_max"),
        "A_stdDev": combined_dict.get("A_stdDev"),
    }
    factor_raw = {
        "R": combined_dict.get("R_mean"),
        "K": combined_dict.get("K_mean"),
        "LS": combined_dict.get("LS_mean"),
        "C": combined_dict.get("C_mean"),
        "P": combined_dict.get("P_mean"),
    }
    pct_dict = combined_dict

    def _thresholds(band_name):
        min_val = FACTOR_VIS[band_name]["min"]
        max_val = FACTOR_VIS[band_name]["max"]
        step = (max_val - min_val) / n_classes if n_classes > 0 else 0
        return [min_val + step * j for j in range(1, n_classes)]

    reverse_map = {"R": reverse_r, "K": reverse_k, "LS": reverse_ls, "C": reverse_c, "P": reverse_p}
    class_images = {}
    factor_maps = {k: dict(FACTOR_VIS[k]) for k in RECLASS_FACTOR_ORDER}
    for key in RECLASS_FACTOR_ORDER:
        bps = [ee.Number(v) for v in _thresholds(key)]
        cls_img = _classify_from_breakpoints(factor_images[key], bps, reverse_map[key]).clip(aoi)
        class_images[key] = cls_img
        factor_maps[key]["reversed"] = reverse_map[key]
        vis_meta = FACTOR_VIS[key]
        factor_maps[key]["direction_desc"] = vis_meta["reversed_desc"] if reverse_map[key] else vis_meta["normal_desc"]
        factor_maps[key]["class_tile_url"] = _class_tile_url(cls_img, n_classes)
        factor_maps[key]["class_thumb_url"] = _class_thumb_url(cls_img, n_classes, aoi)
        factor_maps[key]["class_breakpoints"] = _thresholds(key)

    smoothed_A = A.focal_mean(150, 'circle', 'meters')
    A_map_id = smoothed_A.getMapId({"min": FACTOR_VIS["A"]["min"], "max": FACTOR_VIS["A"]["max"], "palette": FACTOR_VIS["A"]["palette"]})
    factor_maps["A"] = {
        **FACTOR_VIS["A"],
        "tile_url": A_map_id["tile_fetcher"].url_format,
        "thumb_url": smoothed_A.getThumbURL({**FACTOR_VIS["A"], "region": aoi.bounds(), "dimensions": 800, "format": "png"}),
    }

    a_bps = [ee.Number(v) for v in _thresholds("A")]
    A_class = _classify_from_breakpoints(A, a_bps).clip(aoi)

    risk_index = (
        class_images["R"].add(class_images["K"]).add(class_images["LS"])
        .add(class_images["C"]).add(class_images["P"]).divide(5.0).clip(aoi).rename("RiskIndex")
    )
    risk_tile_url = _class_tile_url(risk_index, n_classes)
    risk_thumb_url = _class_thumb_url(risk_index, n_classes, aoi)

    risk_bps_vals = [1 + (n_classes - 1) * j / n_classes for j in range(1, n_classes)]
    risk_class_masks = []
    for j in range(n_classes):
        lo = risk_bps_vals[j - 1] if j > 0 else None
        hi = risk_bps_vals[j] if j < n_classes - 1 else None
        if lo is None:
            mask = risk_index.lt(hi)
        elif hi is None:
            mask = risk_index.gte(lo)
        else:
            mask = risk_index.gte(lo).And(risk_index.lt(hi))
        risk_class_masks.append(mask)

    risk_area_img = ee.Image.cat([m.multiply(ee.Image.pixelArea()).rename(f"r{i}") for i, m in enumerate(risk_class_masks)])
    a_class_masks = []
    for j in range(n_classes):
        lo = _thresholds("A")[j - 1] if j > 0 else None
        hi = _thresholds("A")[j] if j < n_classes - 1 else None
        if lo is None:
            mask = A.lt(hi)
        elif hi is None:
            mask = A.gte(lo)
        else:
            mask = A.gte(lo).And(A.lt(hi))
        a_class_masks.append(mask)

    a_class_area_img = ee.Image.cat([m.multiply(ee.Image.pixelArea()).rename(f"a{i}") for i, m in enumerate(a_class_masks)])

    # OPTIMIZATION: Combine area computations into a single pass
    combined_area_img = ee.Image.cat([fixed_area_img, risk_area_img, a_class_area_img])
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_combined_area = executor.submit(
            lambda: combined_area_img.reduceRegion(reducer=ee.Reducer.sum(), geometry=aoi, scale=250, maxPixels=10000, bestEffort=True, tileScale=4).getInfo()
        )
        f_risk_stats = executor.submit(
            lambda: risk_index.reduceRegion(
                reducer=ee.Reducer.mean().combine(ee.Reducer.stdDev(), sharedInputs=True),
                geometry=aoi, scale=250, maxPixels=10000, bestEffort=True, tileScale=4,
            ).getInfo()
        )

        combined_area_dict = f_combined_area.result()
        risk_stats_raw = f_risk_stats.result()
    
    fixed_area_dict = combined_area_dict
    risk_area_dict = combined_area_dict
    a_class_area_dict = combined_area_dict

    risk_class_labels = [f"Risk Class {j + 1}" for j in range(n_classes)]
    risk_class_areas = {lbl: round((risk_area_dict.get(f"r{i}", 0) or 0) / 1e6, 2) for i, lbl in enumerate(risk_class_labels)}

    a_thresholds = _thresholds("A")
    a_class_labels = []
    for j in range(n_classes):
        lo = round(a_thresholds[j - 1], 1) if j > 0 else None
        hi = round(a_thresholds[j], 1) if j < n_classes - 1 else None
        a_class_labels.append(f"Class 1 (<{hi})" if lo is None else (f"Class {j+1} (≥{lo})" if hi is None else f"Class {j+1} ({lo}–{hi})"))
    a_class_areas = {lbl: round((a_class_area_dict.get(f"a{i}", 0) or 0) / 1e6, 2) for i, lbl in enumerate(a_class_labels)}

    class_areas = {lbl: round((fixed_area_dict.get(f"c{i}", 0) or 0) / 1e6, 2) for i, lbl in enumerate(fixed_labels)}

    center = [(bounds[0][1] + bounds[2][1]) / 2, (bounds[0][0] + bounds[2][0]) / 2]

    # OPTIMIZATION: Generate raw map download URLs asynchronously and at 250m scale to prevent timeouts
    def get_dl_url(img):
        return img.getDownloadURL({"region": aoi.bounds(), "scale": 250, "format": "GEO_TIFF", "crs": "EPSG:4326"})

    with concurrent.futures.ThreadPoolExecutor(max_workers=7) as dl_executor:
        f_dl_A = dl_executor.submit(lambda: get_dl_url(A))
        f_dl_risk = dl_executor.submit(lambda: get_dl_url(risk_index))
        dl_factors = {}
        for key in RECLASS_FACTOR_ORDER:
            dl_factors[key] = dl_executor.submit(lambda k=key: get_dl_url(factor_images[k]))

        factor_maps["A"]["download_url"] = f_dl_A.result()
        risk_download_url = f_dl_risk.result()
        for key in RECLASS_FACTOR_ORDER:
            factor_maps[key]["download_url"] = dl_factors[key].result()

    result = {
        "tile_url": factor_maps["A"]["tile_url"],
        "risk_index": {
            "tile_url": risk_tile_url, "thumb_url": risk_thumb_url, "download_url": risk_download_url,
            "mean": round(risk_stats_raw.get("RiskIndex_mean") or 0, 2),
            "std_dev": round(risk_stats_raw.get("RiskIndex_stdDev") or 0, 2),
            "class_areas_km2": risk_class_areas, "weight_pct_each": RECLASS_WEIGHT_PCT,
        },
        "stats": {
            "Mean (t/ha/yr)": round(stats_raw.get("A_mean") or 0, 2),
            "Min (t/ha/yr)": round(stats_raw.get("A_min") or 0, 2),
            "Max (t/ha/yr)": round(stats_raw.get("A_max") or 0, 2),
            "Std Dev (t/ha/yr)": round(stats_raw.get("A_stdDev") or 0, 2),
        },
        "factor_means": {
            "R — Rainfall Erosivity": round(factor_raw.get("R") or 0, 1),
            "K — Soil Erodibility": round(factor_raw.get("K") or 0, 4),
            "LS — Topographic Factor": round(factor_raw.get("LS") or 0, 2),
            "C — Cover Management": round(factor_raw.get("C") or 0, 3),
            "P — Support Practice": round(factor_raw.get("P") or 0, 3),
        },
        "class_areas_km2": class_areas,
        "n_class_soil_loss_km2": a_class_areas,
        "n_class_soil_loss_tile": _class_tile_url(A_class, n_classes),
        "factor_maps": factor_maps,
        "reverse_flags": reverse_map,
        "n_classes": n_classes,
        "center": center,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
        "bbox": bounds,
        "year": year,
    }
    with _lock:
        _cache[cache_key] = result
    return result
