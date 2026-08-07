"""Grey Crowned Crane Habitat Suitability (AHP / Weighted Overlay) — FastAPI backend."""
import json
import math
import ee
from cachetools import TTLCache
from threading import Lock
import concurrent.futures
from gee.classify_utils import quantile_classify

_cache: TTLCache = TTLCache(maxsize=128, ttl=86400)
_lock = Lock()

# Default AHP weights matching the poster
DEFAULT_WEIGHTS = {
    "wetlands": 0.22,
    "water": 0.16,
    "landcover": 0.13,
    "rainfall": 0.10,
    "buildings": 0.10,
    "irrigated": 0.08,
    "slope": 0.07,
    "roads": 0.06,
    "elevation": 0.04,
    "temperature": 0.04
}

FACTOR_ORDER = [
    "wetlands", "water", "landcover", "rainfall", "buildings",
    "irrigated", "slope", "roads", "elevation", "temperature"
]

FACTOR_META = {
    "wetlands":    {"label": "Distance from Wetlands",    "weight_pct": 22, "normal_desc": "Closer = more suitable", "reversed_desc": "Farther = more suitable (reversed)"},
    "water":       {"label": "Distance from Water",       "weight_pct": 16, "normal_desc": "Closer = more suitable", "reversed_desc": "Farther = more suitable (reversed)"},
    "landcover":   {"label": "Land Cover",                "weight_pct": 13, "normal_desc": "Natural/grassland = more suitable", "reversed_desc": "Urban/bare = more suitable (reversed)"},
    "rainfall":    {"label": "Mean Annual Rainfall",      "weight_pct": 10, "normal_desc": "Higher rainfall = more suitable", "reversed_desc": "Lower rainfall = more suitable (reversed)"},
    "buildings":   {"label": "Distance from Buildings",   "weight_pct": 10, "normal_desc": "Farther = more suitable", "reversed_desc": "Closer = more suitable (reversed)"},
    "irrigated":   {"label": "Distance from Irrigated",   "weight_pct": 8,  "normal_desc": "Closer = more suitable", "reversed_desc": "Farther = more suitable (reversed)"},
    "slope":       {"label": "Slope",                     "weight_pct": 7,  "normal_desc": "Gentler slope = more suitable", "reversed_desc": "Steeper slope = more suitable (reversed)"},
    "roads":       {"label": "Distance from Roads",       "weight_pct": 6,  "normal_desc": "Farther = more suitable", "reversed_desc": "Closer = more suitable (reversed)"},
    "elevation":   {"label": "Elevation",                 "weight_pct": 4,  "normal_desc": "Lower elevation = more suitable", "reversed_desc": "Higher elevation = more suitable (reversed)"},
    "temperature": {"label": "Mean Annual Temperature",   "weight_pct": 4,  "normal_desc": "Optimal temps = more suitable", "reversed_desc": "Extreme temps = more suitable (reversed)"},
}

_SCORE_VIS = {"min": 1, "max": 5, "palette": ["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"]}
_RI = {1: 0.0, 2: 0.0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}


def compute_ahp_data(weights: dict) -> dict:
    n = len(FACTOR_ORDER)
    w = [max(weights.get(f, DEFAULT_WEIGHTS[f]), 1e-9) for f in FACTOR_ORDER]
    total = sum(w)
    w_norm = [x / total for x in w]
    matrix = [[round(w_norm[i] / w_norm[j], 3) if w_norm[j] > 0 else 1.0 for j in range(n)] for i in range(n)]
    lambda_max = float(n)
    ci = (lambda_max - n) / (n - 1) if n > 1 else 0.0
    ri = _RI.get(n, 1.49)
    cr = ci / ri if ri > 0 else 0.0

    return {
        "weights": {FACTOR_ORDER[i]: round(w_norm[i], 4) for i in range(n)},
        "matrix": matrix,
        "factor_labels": [FACTOR_META[f]["label"] for f in FACTOR_ORDER],
        "lambda_max": round(lambda_max, 4),
        "ci": round(ci, 4),
        "cr": round(cr, 4),
        "ri": ri,
        "consistent": cr < 0.10,
        "n": n,
    }


def _distance_km(mask, aoi, scale=100):
    filled = mask.unmask(0).selfMask().unmask(0).toByte()
    distance_m = (
        filled.fastDistanceTransform(256, "pixels", "squared_euclidean")
        .sqrt().multiply(ee.Image.pixelArea().sqrt()).clip(aoi)
    )
    return distance_m.divide(1000).reproject(crs="EPSG:4326", scale=scale)

def _reclass_far_is_good(d):
    return (ee.Image(1).where(d.gte(0.5).And(d.lt(1)), 2).where(d.gte(1).And(d.lt(2)), 3)
            .where(d.gte(2).And(d.lt(4)), 4).where(d.gte(4), 5))

def _reclass_near_is_good(d):
    return (ee.Image(1).where(d.lt(4), 2).where(d.lt(2), 3).where(d.lt(1), 4).where(d.lt(0.5), 5))

def _apply_reverse(score_img, flag):
    return ee.Image(6).subtract(score_img) if flag else score_img

def _normalize_weights(custom: dict | None) -> dict:
    if not custom:
        return DEFAULT_WEIGHTS.copy()
    raw = {k: max(float(custom.get(k, DEFAULT_WEIGHTS[k])), 1e-9) for k in FACTOR_ORDER}
    total = sum(raw.values())
    return {k: v / total for k, v in raw.items()}


def compute_habitat_suitability(
    aoi_config: dict,
    reverse_flags: dict,
    n_classes: int = 5,
    custom_weights: dict | None = None,
) -> dict:
    weights = _normalize_weights(custom_weights)
    weights_tuple = tuple(round(weights[k], 6) for k in FACTOR_ORDER)
    rev_tuple = tuple(reverse_flags.get(k, False) for k in FACTOR_ORDER)
    cache_key = (json.dumps(aoi_config, sort_keys=True), rev_tuple, n_classes, weights_tuple)
    
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)

    # 1. ESA WorldCover (10m)
    lc = ee.Image("ESA/WorldCover/v200/2021").select("Map").clip(aoi)
    
    # Distance from Wetlands (Class 90)
    wetlands_mask = lc.eq(90).Or(lc.eq(95))
    wetlands_dist = _distance_km(wetlands_mask, aoi)
    wetlands_score = _apply_reverse(_reclass_near_is_good(wetlands_dist), reverse_flags.get("wetlands", False)).rename("wetlands_score")

    # Distance from Water bodies (Class 80 or JRC)
    water_mask = lc.eq(80)
    water_dist = _distance_km(water_mask, aoi)
    water_score = _apply_reverse(_reclass_near_is_good(water_dist), reverse_flags.get("water", False)).rename("water_score")

    # Land Cover Suitability (Grassland/Cropland > Forest > Bare > Urban)
    landcover_score = (
        ee.Image(1) # Urban (50), Bare (60)
        .where(lc.eq(10).Or(lc.eq(20)).Or(lc.eq(70)), 2) # Trees/Shrubs
        .where(lc.eq(40), 4) # Cropland
        .where(lc.eq(30).Or(lc.eq(90)).Or(lc.eq(80)), 5) # Grassland/Wetland/Water
        .clip(aoi)
    )
    landcover_score = _apply_reverse(landcover_score, reverse_flags.get("landcover", False)).rename("landcover_score")

    # Distance from Buildings (Class 50)
    buildings_mask = lc.eq(50)
    buildings_dist = _distance_km(buildings_mask, aoi)
    buildings_score = _apply_reverse(_reclass_far_is_good(buildings_dist), reverse_flags.get("buildings", False)).rename("buildings_score")

    # Distance from Irrigated Areas (Class 40 Cropland as proxy)
    irrigated_mask = lc.eq(40)
    irrigated_dist = _distance_km(irrigated_mask, aoi)
    irrigated_score = _apply_reverse(_reclass_near_is_good(irrigated_dist), reverse_flags.get("irrigated", False)).rename("irrigated_score")

    # Distance from Roads (Using proxy: nightlights or high intensity built up, or just buffer buildings)
    # We will use buildings as a fallback proxy for roads since robust global vector roads are heavy.
    roads_score = _apply_reverse(_reclass_far_is_good(buildings_dist), reverse_flags.get("roads", False)).rename("roads_score")

    # DEM (SRTM)
    dem = ee.Image("USGS/SRTMGL1_003").select("elevation").clip(aoi)
    slope_pct = ee.Terrain.slope(dem).multiply(math.pi / 180).tan().multiply(100)
    
    # Slope (Gentler = better)
    slope_score = (
        ee.Image(1).where(slope_pct.lt(15), 2).where(slope_pct.lt(10), 3)
        .where(slope_pct.lt(5), 4).where(slope_pct.lt(2), 5)
    )
    slope_score = _apply_reverse(slope_score, reverse_flags.get("slope", False)).rename("slope_score")
    
    # Elevation (Lower = better for Kigali, typically valley bottoms)
    elev_score = (
        ee.Image(1).where(dem.lt(1800), 2).where(dem.lt(1600), 3)
        .where(dem.lt(1500), 4).where(dem.lt(1400), 5)
    )
    elev_score = _apply_reverse(elev_score, reverse_flags.get("elevation", False)).rename("elevation_score")

    # Climate (CHIRPS Precipitation & MODIS LST)
    # Mean annual rainfall (2020-2023)
    rainfall = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate("2020-01-01", "2023-12-31").sum().divide(4).clip(aoi)
    # Kigali rainfall ~1000mm. Higher is better for wetlands.
    rainfall_score = (
        ee.Image(1).where(rainfall.gt(800), 2).where(rainfall.gt(900), 3)
        .where(rainfall.gt(1000), 4).where(rainfall.gt(1100), 5)
    )
    rainfall_score = _apply_reverse(rainfall_score, reverse_flags.get("rainfall", False)).rename("rainfall_score")
    
    # Mean annual temperature (MODIS LST)
    lst = ee.ImageCollection("MODIS/061/MOD11A1").filterDate("2020-01-01", "2020-12-31").select("LST_Day_1km").mean().multiply(0.02).subtract(273.15).clip(aoi)
    # Optimal temp around 20-25C
    temp_score = (
        ee.Image(1).where(lst.gt(15).And(lst.lt(30)), 3)
        .where(lst.gt(20).And(lst.lt(28)), 4).where(lst.gt(22).And(lst.lt(26)), 5)
    )
    temp_score = _apply_reverse(temp_score, reverse_flags.get("temperature", False)).rename("temperature_score")

    score_images = {
        "wetlands": wetlands_score, "water": water_score, "landcover": landcover_score,
        "rainfall": rainfall_score, "buildings": buildings_score, "irrigated": irrigated_score,
        "slope": slope_score, "roads": roads_score, "elevation": elev_score, "temperature": temp_score
    }

    # Weighted Overlay
    suitability = ee.Image(0).rename("suitability")
    for factor in FACTOR_ORDER:
        suitability = suitability.add(score_images[factor].multiply(weights[factor]))

    map_id = suitability.getMapId(_SCORE_VIS)
    final_thumb_url = suitability.getThumbURL({
        **_SCORE_VIS, "region": aoi.bounds(), "dimensions": 512, "format": "png",
    })

    classes = {
        "Very Low Suitability": suitability.lt(2),
        "Low Suitability": suitability.gte(2).And(suitability.lt(3)),
        "Moderate Suitability": suitability.gte(3).And(suitability.lt(4)),
        "High Suitability": suitability.gte(4).And(suitability.lt(4.5)),
        "Very High Suitability": suitability.gte(4.5)
    }
    labels = list(classes.keys())
    area_img = ee.Image.cat([classes[lbl].multiply(ee.Image.pixelArea()).rename(f"c{i}") for i, lbl in enumerate(labels)])

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        f_area = executor.submit(lambda: area_img.reduceRegion(reducer=ee.Reducer.sum(), geometry=aoi, scale=100, maxPixels=1e8, bestEffort=True).getInfo())
        f_classify = executor.submit(lambda: quantile_classify(
            layers=[{"name": "suitability", "image": suitability, "title": "Habitat Suitability"}] + 
                   [{"name": f"{k}_score", "image": v, "title": FACTOR_META[k]["label"]} for k,v in score_images.items()],
            aoi=aoi, scale=100, n_classes=n_classes,
        ))
        area_dict = f_area.result()
        classify = f_classify.result()

    class_areas = {lbl: round((area_dict.get(f"c{i}") or 0) / 1e6, 2) for i, lbl in enumerate(labels)}

    def safe_url(img, name):
        try:
            return img.getDownloadURL({"name": name, "scale": 100, "region": aoi.bounds(), "format": "GEO_TIFF"})
        except Exception:
            return None

    def safe_thumb(img):
        try:
            return img.getThumbURL({**_SCORE_VIS, "region": aoi.bounds(), "dimensions": 512, "format": "png"})
        except Exception:
            return None

    result = {
        "map_id": map_id["mapid"],
        "token": map_id["token"],
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": final_thumb_url,
        "download_url": safe_url(suitability, "Habitat_Suitability"),
        "class_areas_km2": class_areas,
        "factors": {
            k: {
                "label": FACTOR_META[k]["label"],
                "weight_pct": weights[k] * 100,
                "reversed": bool(reverse_flags.get(k, False)),
                "description": FACTOR_META[k]["reversed_desc"] if reverse_flags.get(k, False) else FACTOR_META[k]["normal_desc"],
                "tile_url": score_images[k].getMapId(_SCORE_VIS)["tile_fetcher"].url_format,
                "thumb_url": safe_thumb(score_images[k]),
                "download_url": safe_url(score_images[k], f"Habitat_{k}_score")
            } for k in FACTOR_ORDER
        },
        "classify": classify,
    }

    with _lock:
        _cache[cache_key] = result
    return result
