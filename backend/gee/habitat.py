"""Grey Crowned Crane Habitat Suitability (AHP / Weighted Overlay) — FastAPI backend."""
import json
import math
import ee
import concurrent.futures
from threading import Lock
from cachetools import TTLCache

from gee.classify_utils import (
    quantile_classify,
    get_jenks_breaks,
    get_equal_interval_breaks,
    get_quantile_breaks,
    class_palette,
)

def get_dynamic_scale(geom):
    try:
        area_sqkm = geom.area().divide(1e6).getInfo()
        if area_sqkm > 10000: return 500
        elif area_sqkm > 2000: return 250
        elif area_sqkm > 500: return 100
        else: return 30
    except:
        return 250

_cache_unified: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_build: TTLCache = TTLCache(maxsize=64, ttl=3600)
_lock = Lock()

# Default AHP weights matching scientific crane conservation literature
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

DEFAULT_LANDCOVER_SCORES = {
    "10": 2, # Trees
    "20": 2, # Shrubland
    "30": 5, # Grassland
    "40": 4, # Cropland
    "50": 1, # Built-up
    "60": 1, # Bare / sparse vegetation
    "70": 2, # Snow and ice
    "80": 5, # Permanent water bodies
    "90": 5, # Herbaceous wetland
    "95": 5, # Mangroves
    "100": 1 # Moss and lichen
}

def get_habitat_config():
    return {
        "factors": FACTOR_ORDER,
        "factor_meta": FACTOR_META,
        "default_weights": DEFAULT_WEIGHTS,
        "default_landcover_scores": DEFAULT_LANDCOVER_SCORES,
        "available_years": [2020, 2021, 2022, 2023]
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


def _true_vector_euclidean_distance(mask, aoi, scale=None):
    if scale is None: scale = get_dynamic_scale(aoi)
    # fastDistanceTransform calculates distance to the nearest non-zero pixel.
    # mask has 1 on target features and 0 on background.
    # Therefore target is mask.unmask(0) directly without inversion.
    target = mask.unmask(0)
    distance_m = (
        target.fastDistanceTransform(512, "pixels", "squared_euclidean")
        .sqrt().multiply(ee.Image.pixelArea().sqrt()).clip(aoi)
    )
    return distance_m.divide(1000)


def _apply_reverse(score_img, flag):
    return ee.Image(6).subtract(score_img) if flag else score_img


def _normalize_weights(custom: dict | None) -> dict:
    if not custom:
        return DEFAULT_WEIGHTS.copy()
    raw = {k: max(float(custom.get(k, DEFAULT_WEIGHTS[k])), 1e-9) for k in FACTOR_ORDER}
    total = sum(raw.values())
    return {k: v / total for k, v in raw.items()}


def _classify_all_raw_images(raw_dict: dict, aoi: ee.Geometry, scale: int, n_classes: int = 5, method: str = "natural_breaks") -> tuple[dict, dict]:
    if not raw_dict: return {}, {}
    names = list(raw_dict.keys())
    images = list(raw_dict.values())
    
    # Combine into a single image to compute all histograms in one GEE request
    all_bands = ee.Image.cat([img.rename(nm) for nm, img in zip(names, images)])
    hist_raw = all_bands.reduceRegion(
        reducer=ee.Reducer.autoHistogram(maxBuckets=100),
        geometry=aoi, scale=scale, maxPixels=20000, bestEffort=True
    ).getInfo()
    
    if not hist_raw:
        hist_raw = {}
        
    classified = {}
    breaks_dict = {}
    for nm, img in zip(names, images):
        band_hist = hist_raw.get(nm) or []
        if method == "equal_interval":
            bps = get_equal_interval_breaks(band_hist, n_classes)
        elif method == "quantiles":
            bps = get_quantile_breaks(band_hist, n_classes)
        else:
            bps = get_jenks_breaks(band_hist, n_classes)
            
        while len(bps) < n_classes - 1:
            bps.append(bps[-1] + 0.001 if bps else 1.0)
        bps = bps[:n_classes-1]
        
        # Ensure breaks are strictly monotonically increasing
        for i in range(1, len(bps)):
            if bps[i] <= bps[i-1]:
                bps[i] = bps[i-1] + 0.001
                
        breaks_dict[nm] = bps
        
        cls = ee.Image(1)
        for i, bp in enumerate(bps):
            cls = cls.where(img.gt(bp), i + 2)
        classified[nm] = cls.clip(aoi)
        
    return classified, breaks_dict


def _build_habitat_images(
    aoi_config: dict,
    reverse_flags: dict,
    custom_weights: dict | None = None,
    year: int = 2021,
    landcover_scores: dict | None = None,
    method: str = "natural_breaks"
):
    weights = _normalize_weights(custom_weights)
    weights_tuple = tuple(round(weights[k], 6) for k in FACTOR_ORDER)
    rev_tuple = tuple(reverse_flags.get(k, False) for k in FACTOR_ORDER)
    
    lc_scores = landcover_scores or DEFAULT_LANDCOVER_SCORES
    lc_scores_tuple = tuple((k, lc_scores[k]) for k in sorted(lc_scores.keys()))
    
    cache_key = (json.dumps(aoi_config, sort_keys=True), rev_tuple, weights_tuple, year, lc_scores_tuple, method)
    
    with _lock:
        if cache_key in _cache_build:
            return _cache_build[cache_key]
            
        from gee.aoi_utils import get_aoi_geometry
        aoi = get_aoi_geometry(aoi_config)
        scale = get_dynamic_scale(aoi)
        
        # 20 km buffer to prevent boundary edge distortion in distance calculations
        aoi_buffer = aoi.buffer(20000)
    
        # Calculate raw images
        # Map year to WorldCover version (2020 v100, 2021 v200)
        wc_asset = "ESA/WorldCover/v100/2020" if year <= 2020 else "ESA/WorldCover/v200/2021"
        lc_buffered = ee.Image(wc_asset).select("Map").clip(aoi_buffer)
        lc = lc_buffered.clip(aoi)
        
        wetlands_mask = lc_buffered.eq(90).Or(lc_buffered.eq(95))
        wetlands_dist = _true_vector_euclidean_distance(wetlands_mask, aoi, scale)
        water_mask = lc_buffered.eq(80)
        water_dist = _true_vector_euclidean_distance(water_mask, aoi, scale)
        buildings_mask = lc_buffered.eq(50)
        buildings_dist = _true_vector_euclidean_distance(buildings_mask, aoi, scale)
        irrigated_mask = lc_buffered.eq(40)
        irrigated_dist = _true_vector_euclidean_distance(irrigated_mask, aoi, scale)
        
        # True Euclidean distance for vector features (roads) with fallback unmask
        roads = ee.FeatureCollection("projects/sat-io/open-datasets/GRIP4/Africa").filterBounds(aoi_buffer)
        roads_dist_km = roads.distance(searchRadius=50000, maxError=50).unmask(50000).divide(1000).clip(aoi)
        
        dem = ee.Image("USGS/SRTMGL1_003").select("elevation").clip(aoi)
        slope_deg = ee.Terrain.slope(dem).clip(aoi)
        
        rainfall = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate(f"{year}-01-01", f"{year+1}-01-01").sum().clip(aoi)
        lst_coll = ee.ImageCollection("MODIS/061/MOD11A1").filterDate(f"{year}-01-01", f"{year+1}-01-01").select("LST_Day_1km")
        lst = lst_coll.mean().multiply(0.02).subtract(273.15).unmask(22.0).clip(aoi)
    
        raw_images = {
            "wetlands": wetlands_dist, "water": water_dist, "landcover": lc,
            "rainfall": rainfall, "buildings": buildings_dist, "irrigated": irrigated_dist,
            "slope": slope_deg, "roads": roads_dist_km, "elevation": dem, "temperature": lst
        }

        # Land Cover is categorical, so we classify it dynamically based on landcover_scores
        landcover_score = ee.Image(1).clip(aoi)
        for lc_class, score in lc_scores.items():
            landcover_score = landcover_score.where(lc.eq(int(lc_class)), score)
            
        landcover_score = _apply_reverse(landcover_score, reverse_flags.get("landcover", False)).rename("landcover_score")
    
        # Classify all continuous factors into 5 standardized AHP suitability scores (1-5)
        continuous_keys = [k for k in FACTOR_ORDER if k != "landcover"]
        continuous_raw = {k: raw_images[k] for k in continuous_keys}
        
        # AHP standard scale is always 5 classes (1: Very Low to 5: Very High)
        classified_continuous, actual_breaks = _classify_all_raw_images(continuous_raw, aoi, scale, n_classes=5, method=method)
    
        # Polarities: True means closer/lower is more suitable (invert raw break order 6 - cls)
        polarity_invert = {
            "wetlands": True,   # closer to wetlands = more suitable (low dist = high score)
            "water": True,      # closer to water = more suitable
            "rainfall": False,  # higher rainfall = more suitable (high val = high score)
            "buildings": False, # farther from buildings = more suitable (high dist = high score)
            "irrigated": True,  # closer to irrigated land = more suitable
            "slope": True,      # gentler slope = more suitable (low deg = high score)
            "roads": False,     # farther from roads = more suitable (high dist = high score)
            "elevation": True,  # lower elevation = more suitable
            "temperature": True # cooler/moderate temps = more suitable
        }
    
        score_images = {"landcover": landcover_score}
        for k in continuous_keys:
            cls = classified_continuous[k]
            if polarity_invert[k]:
                cls = ee.Image(6).subtract(cls)
            # Apply user UI reverse override
            score_images[k] = _apply_reverse(cls, reverse_flags.get(k, False)).rename(f"{k}_score")

        # Weighted Overlay (Sum of weights = 1.0, scores = 1 to 5 -> Suitability = 1.0 to 5.0)
        suitability = ee.Image(0).rename("suitability")
        for factor in FACTOR_ORDER:
            suitability = suitability.add(score_images[factor].multiply(weights[factor]))
    
        result = (aoi, suitability, score_images, raw_images, weights, actual_breaks, scale)
        _cache_build[cache_key] = result
        return result


def compute_habitat(
    aoi_config: dict,
    reverse_flags: dict,
    n_classes: int = 5,
    custom_weights: dict | None = None,
    method: str = "natural_breaks",
    custom_labels: list = None,
    year: int = 2021,
    landcover_scores: dict | None = None
) -> dict:
    weights = _normalize_weights(custom_weights)
    weights_tuple = tuple(round(weights[k], 6) for k in FACTOR_ORDER)
    rev_tuple = tuple(reverse_flags.get(k, False) for k in FACTOR_ORDER)
    
    lc_scores = landcover_scores or DEFAULT_LANDCOVER_SCORES
    lc_scores_tuple = tuple((k, lc_scores[k]) for k in sorted(lc_scores.keys()))
    
    cache_key = (json.dumps(aoi_config, sort_keys=True), rev_tuple, n_classes, weights_tuple, method, tuple(custom_labels) if custom_labels else None, year, lc_scores_tuple)
    
    with _lock:
        if cache_key in _cache_unified:
            return _cache_unified[cache_key]

    aoi, suitability, score_images, raw_images, _, export_breaks, scale = _build_habitat_images(
        aoi_config, reverse_flags, custom_weights, year, landcover_scores, method
    )

    # 1. Map Data (Parallelized factor tile fetch)
    map_id = suitability.getMapId(_SCORE_VIS)
    
    def get_factor_map(k, img):
        return k, {"tile_url": img.getMapId(_SCORE_VIS)["tile_fetcher"].url_format}

    factor_maps = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        f_map_futures = [executor.submit(get_factor_map, k, img) for k, img in score_images.items()]
        for f in concurrent.futures.as_completed(f_map_futures):
            k, map_dict = f.result()
            factor_maps[k] = map_dict
        
    geom_info = ee.Dictionary({
        "centroid": aoi.centroid(maxError=100).coordinates(),
        "bounds": aoi.bounds().coordinates().get(0)
    }).getInfo()
    centroid = geom_info.get("centroid", [30.0, -1.9])
    bounds = geom_info.get("bounds", [])

    # 2. Stats Data
    classes = {
        "Very Low Suitability": suitability.lt(2),
        "Low Suitability": suitability.gte(2).And(suitability.lt(3)),
        "Moderate Suitability": suitability.gte(3).And(suitability.lt(4)),
        "High Suitability": suitability.gte(4).And(suitability.lt(4.5)),
        "Very High Suitability": suitability.gte(4.5)
    }
    stat_labels = list(classes.keys())
    area_img = ee.Image.cat([classes[lbl].multiply(ee.Image.pixelArea()).rename(f"c{i}") for i, lbl in enumerate(stat_labels)])
    area_dict = area_img.reduceRegion(
        reducer=ee.Reducer.sum(), geometry=aoi, scale=scale, maxPixels=1e10
    ).getInfo() or {}
    class_areas = {lbl: round((area_dict.get(f"c{i}") or 0) / 1e6, 2) for i, lbl in enumerate(stat_labels)}

    # 3 & 4. Classify and Export Data (Parallelized with ThreadPoolExecutor for rapid response)
    def safe_url(img, name):
        try:
            return img.getDownloadURL({"scale": max(scale, 100), "region": aoi.bounds(), "format": "GEO_TIFF", "name": name})
        except Exception:
            return None

    def safe_thumb(img, palette=None, classes=5):
        if palette is None:
            palette = _SCORE_VIS["palette"]
        try:
            return img.getThumbURL({"min": 1, "max": classes, "palette": palette, "region": aoi.bounds(), "dimensions": 512, "format": "png"})
        except Exception:
            return None

    def run_classify():
        try:
            return quantile_classify(
                layers=[{"name": "suitability", "image": suitability, "title": "Habitat Suitability"}],
                aoi=aoi, scale=max(scale, 100), n_classes=n_classes, method=method, custom_labels=custom_labels
            )
        except Exception:
            return None

    polarity_invert = {
        "wetlands": True, "water": True, "rainfall": False, "buildings": False,
        "irrigated": True, "slope": True, "roads": False, "elevation": True, "temperature": True
    }

    factors = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=14) as executor:
        f_classify = executor.submit(run_classify)
        f_main_thumb = executor.submit(safe_thumb, suitability, _SCORE_VIS["palette"], 5)
        f_main_download = executor.submit(safe_url, suitability, "Habitat_Suitability")
        
        factor_futures = {}
        for k in FACTOR_ORDER:
            is_reversed = bool(reverse_flags.get(k, False))
            img_to_export = score_images[k]
            
            if k == "landcover":
                lbls = ["Built-up/Bare", "Trees/Shrubs", "Mixed/Other", "Cropland", "Water/Wetlands"]
                if is_reversed:
                    lbls.reverse()
            else:
                bps = export_breaks.get(k, [])
                should_invert = polarity_invert[k]
                if is_reversed:
                    should_invert = not should_invert
                    
                unit = ""
                if k in ["wetlands", "water", "buildings", "irrigated", "roads"]: unit = " km"
                elif k == "rainfall": unit = " mm"
                elif k == "temperature": unit = " °C"
                elif k == "elevation": unit = " m"
                elif k == "slope": unit = "°"
                
                if bps and len(bps) == 4:
                    lbls = [
                        f"< {bps[0]:.1f}{unit}",
                        f"{bps[0]:.1f} - {bps[1]:.1f}{unit}",
                        f"{bps[1]:.1f} - {bps[2]:.1f}{unit}",
                        f"{bps[2]:.1f} - {bps[3]:.1f}{unit}",
                        f"> {bps[3]:.1f}{unit}"
                    ]
                else:
                    lbls = [f"Class {i+1}" for i in range(5)]
                    
                if should_invert:
                    lbls.reverse()
                    
            f_thumb = executor.submit(safe_thumb, img_to_export, _SCORE_VIS["palette"], 5)
            f_dl = executor.submit(safe_url, raw_images[k], f"Habitat_{k}_Raw")
            factor_futures[k] = (is_reversed, lbls, f_thumb, f_dl)
            
        final_thumb_url = f_main_thumb.result()
        download_url = f_main_download.result()
        classify_res = f_classify.result()
        
        for k, (is_reversed, lbls, f_thumb, f_dl) in factor_futures.items():
            factors[k] = {
                "label": FACTOR_META[k]["label"],
                "weight_pct": round(weights[k] * 100, 2),
                "reversed": is_reversed,
                "description": FACTOR_META[k]["reversed_desc"] if is_reversed else FACTOR_META[k]["normal_desc"],
                "thumb_url": f_thumb.result(),
                "download_url": f_dl.result(),
                "labels": lbls
            }

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "factor_maps": factor_maps,
        "center": [centroid[1], centroid[0]],
        "bbox": bounds,
        "class_areas_km2": class_areas,
        "classify": classify_res,
        "thumb_url": final_thumb_url,
        "download_url": download_url,
        "factors": factors,
    }

    with _lock:
        _cache_unified[cache_key] = result
    return result
