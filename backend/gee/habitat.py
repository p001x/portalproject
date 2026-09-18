"""Grey Crowned Crane Habitat Suitability (AHP / Weighted Overlay) — FastAPI backend."""
import json
import math
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

from cachetools import TTLCache
from threading import Lock
import concurrent.futures
from gee.classify_utils import quantile_classify

_cache_map: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_stats: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_classify: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_export: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_build: TTLCache = TTLCache(maxsize=64, ttl=3600)
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


def _distance_km(mask, aoi, scale=None):
    if scale is None: scale = get_dynamic_scale(aoi)
    # fastDistanceTransform computes distance to zero pixels. 
    # Target feature should be 0, background should be 1.
    target = mask.unmask(0).Not()
    distance_m = (
        target.fastDistanceTransform(256, "pixels", "squared_euclidean")
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

from gee.classify_utils import get_jenks_breaks, get_equal_interval_breaks, get_quantile_breaks

def _classify_all_raw_images(raw_dict: dict, aoi: ee.Geometry, scale: int, n_classes: int = 5, method: str = "natural_breaks") -> tuple[dict, dict]:
    if not raw_dict: return {}
    names = list(raw_dict.keys())
    images = list(raw_dict.values())
    
    # Combine into a single image to compute all histograms in one GEE request
    all_bands = ee.Image.cat([img.rename(nm) for nm, img in zip(names, images)])
    hist_raw = all_bands.reduceRegion(
        reducer=ee.Reducer.autoHistogram(maxBuckets=100),
        geometry=aoi, scale=scale, maxPixels=10000, bestEffort=True
    ).getInfo()
    
    if not hist_raw:
        return {nm: ee.Image(1).clip(aoi) for nm in names}
        
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
        breaks_dict[nm] = bps
        
        cls = ee.Image(1)
        for i, bp in enumerate(bps):
            cls = cls.where(img.gt(bp), i + 2)
        classified[nm] = cls.clip(aoi)
        
    return classified, breaks_dict


def _build_habitat_images(aoi_config: dict, reverse_flags: dict, custom_weights: dict | None = None):
    weights = _normalize_weights(custom_weights)
    weights_tuple = tuple(round(weights[k], 6) for k in FACTOR_ORDER)
    rev_tuple = tuple(reverse_flags.get(k, False) for k in FACTOR_ORDER)
    cache_key = (json.dumps(aoi_config, sort_keys=True), rev_tuple, weights_tuple)
    
    with _lock:
        if cache_key in _cache_build:
            return _cache_build[cache_key]
            
        from gee.aoi_utils import get_aoi_geometry
        aoi = get_aoi_geometry(aoi_config)
    
        # Calculate raw images first
        lc = ee.Image("ESA/WorldCover/v200/2021").select("Map").clip(aoi)
        wetlands_mask = lc.eq(90).Or(lc.eq(95))
        wetlands_dist = _distance_km(wetlands_mask, aoi)
        water_mask = lc.eq(80)
        water_dist = _distance_km(water_mask, aoi)
        buildings_mask = lc.eq(50)
        buildings_dist = _distance_km(buildings_mask, aoi)
        irrigated_mask = lc.eq(40)
        irrigated_dist = _distance_km(irrigated_mask, aoi)
        
        roads = ee.FeatureCollection("projects/sat-io/open-datasets/GRIP4/Africa").filterBounds(aoi)
        roads_mask = ee.Image(0).paint(roads, 1).clip(aoi)
        roads_dist_km = _distance_km(roads_mask, aoi)
        
        dem = ee.Image("USGS/SRTMGL1_003").select("elevation").clip(aoi)
        slope_pct = ee.Terrain.slope(dem).multiply(math.pi / 180).tan().multiply(100)
        
        rainfall = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate("2020-01-01", "2023-12-31").sum().divide(4).clip(aoi)
        lst = ee.ImageCollection("MODIS/061/MOD11A1").filterDate("2020-01-01", "2020-12-31").select("LST_Day_1km").mean().multiply(0.02).subtract(273.15).clip(aoi)
    
        raw_images = {
            "wetlands": wetlands_dist, "water": water_dist, "landcover": lc,
            "rainfall": rainfall, "buildings": buildings_dist, "irrigated": irrigated_dist,
            "slope": slope_pct, "roads": roads_dist_km, "elevation": dem, "temperature": lst
        }


        # Land Cover is categorical, so we classify it manually
        landcover_score = (
            ee.Image(1) # Urban (50), Bare (60)
            .where(lc.eq(10).Or(lc.eq(20)).Or(lc.eq(70)), 2) # Trees/Shrubs
            .where(lc.eq(40), 4) # Cropland
            .where(lc.eq(30).Or(lc.eq(90)).Or(lc.eq(80)), 5) # Grassland/Wetland/Water
            .clip(aoi)
        )
        landcover_score = _apply_reverse(landcover_score, reverse_flags.get("landcover", False)).rename("landcover_score")
    
        # Classify all continuous factors dynamically using Natural Breaks
        continuous_keys = [k for k in FACTOR_ORDER if k != "landcover"]
        continuous_raw = {k: raw_images[k] for k in continuous_keys}
        
        # We default to Natural Breaks for AHP scores unless the user explicitly requested something else
        classified_continuous, _ = _classify_all_raw_images(continuous_raw, aoi, get_dynamic_scale(aoi), 5, "natural_breaks")
    
        # Define polarities: True means we must invert the Natural Breaks result (6 - cls)
        polarity_invert = {
            "wetlands": True,   # near is good (low dist = high score)
            "water": True,      # near is good
            "rainfall": False,  # high rainfall is good (high val = high score)
            "buildings": False, # far is good (high dist = high score)
            "irrigated": True,  # near is good
            "slope": True,      # low slope is good
            "roads": False,     # far is good
            "elevation": True,  # low elevation is good
            "temperature": True # cooler is good (low temp = high score)
        }
    
        score_images = {"landcover": landcover_score}
        for k in continuous_keys:
            cls = classified_continuous[k]
            if polarity_invert[k]:
                cls = ee.Image(6).subtract(cls)
            # Apply user UI reverse override
            score_images[k] = _apply_reverse(cls, reverse_flags.get(k, False)).rename(f"{k}_score")

        # Weighted Overlay
        suitability = ee.Image(0).rename("suitability")
        for factor in FACTOR_ORDER:
            suitability = suitability.add(score_images[factor].multiply(weights[factor]))
    
        result = (aoi, suitability, score_images, raw_images, weights)
        _cache_build[cache_key] = result
        return result


_cache_unified = TTLCache(maxsize=64, ttl=3600)

def compute_habitat(
    aoi_config: dict, reverse_flags: dict, n_classes: int = 5, custom_weights: dict | None = None, method: str = "natural_breaks", custom_labels: list = None
) -> dict:
    weights = _normalize_weights(custom_weights)
    weights_tuple = tuple(round(weights[k], 6) for k in FACTOR_ORDER)
    rev_tuple = tuple(reverse_flags.get(k, False) for k in FACTOR_ORDER)
    cache_key = (json.dumps(aoi_config, sort_keys=True), rev_tuple, n_classes, weights_tuple, method, tuple(custom_labels) if custom_labels else None)
    
    with _lock:
        if cache_key in _cache_unified:
            return _cache_unified[cache_key]

    aoi, suitability, score_images, raw_images, _ = _build_habitat_images(aoi_config, reverse_flags, custom_weights)
    scale = get_dynamic_scale(aoi)

    # 1. Map Data
    map_id = suitability.getMapId(_SCORE_VIS)
    factor_maps = {}
    for key, img in score_images.items():
        factor_maps[key] = {
            "tile_url": img.getMapId(_SCORE_VIS)["tile_fetcher"].url_format
        }
    centroid = aoi.centroid(maxError=100).coordinates().getInfo()
    bounds = aoi.bounds().getInfo()["coordinates"][0]

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
    ).getInfo()
    class_areas = {lbl: round((area_dict.get(f"c{i}") or 0) / 1e6, 2) for i, lbl in enumerate(stat_labels)}

    # 3. Classify Data
    classify = quantile_classify(
        layers=[{"name": "suitability", "image": suitability, "title": "Habitat Suitability"}] + 
               [{"name": f"{k}_score", "image": v, "title": FACTOR_META[k]["label"]} for k,v in score_images.items()],
        aoi=aoi, scale=scale, n_classes=n_classes, method=method, custom_labels=custom_labels
    )

    # 4. Export Data
    def safe_url(img, name):
        try:
            return img.getDownloadURL({"scale": 100, "region": aoi.bounds(), "format": "GEO_TIFF"})
        except Exception:
            return None

    def safe_thumb(img, palette=None, classes=5):
        if palette is None:
            palette = _SCORE_VIS["palette"]
        try:
            return img.getThumbURL({"min": 1, "max": classes, "palette": palette, "region": aoi.bounds(), "dimensions": 512, "format": "png"})
        except Exception:
            return None

    final_thumb_url = safe_thumb(suitability, _SCORE_VIS["palette"], n_classes)
    download_url = safe_url(suitability, "Habitat_Suitability")

    from gee.classify_utils import class_palette
    
    continuous_keys = [k for k in FACTOR_ORDER if k != "landcover"]
    continuous_raw = {k: raw_images[k] for k in continuous_keys}
    classified_continuous_export, export_breaks = _classify_all_raw_images(continuous_raw, aoi, scale, n_classes, method)

    polarity_invert = {
        "wetlands": True, "water": True, "rainfall": False, "buildings": False,
        "irrigated": True, "slope": True, "roads": False, "elevation": True, "temperature": True
    }

    factors = {}
    for k in FACTOR_ORDER:
        is_reversed = bool(reverse_flags.get(k, False))
        if k == "landcover":
            img_to_export = score_images[k]
            k_n_classes = 5
            lbls = ["Built-up/Bare", "Trees/Shrubs", "Mixed/Other", "Cropland", "Water/Wetlands"]
            if is_reversed:
                lbls.reverse()
        else:
            cls = classified_continuous_export[k]
            bps = export_breaks[k]
            should_invert = polarity_invert[k]
            if is_reversed:
                should_invert = not should_invert
                
            if should_invert:
                img_to_export = ee.Image(n_classes + 1).subtract(cls)
            else:
                img_to_export = cls
                
            k_n_classes = n_classes
            
            unit = ""
            if k in ["wetlands", "water", "buildings", "irrigated", "roads"]: unit = " km"
            elif k == "rainfall": unit = " mm"
            elif k == "temperature": unit = " °C"
            elif k == "elevation": unit = " m"
            elif k == "slope": unit = "°"
            
            lbls = []
            for i in range(n_classes):
                if i == 0:
                    lbls.append(f"< {bps[0]:.1f}{unit}")
                elif i == n_classes - 1:
                    lbls.append(f"> {bps[-1]:.1f}{unit}")
                else:
                    lbls.append(f"{bps[i-1]:.1f} - {bps[i]:.1f}{unit}")
                    
            if should_invert:
                lbls.reverse()
                
        factors[k] = {
            "label": FACTOR_META[k]["label"],
            "weight_pct": weights[k] * 100,
            "reversed": is_reversed,
            "description": FACTOR_META[k]["reversed_desc"] if is_reversed else FACTOR_META[k]["normal_desc"],
            "thumb_url": safe_thumb(img_to_export, class_palette(k_n_classes), k_n_classes),
            "download_url": safe_url(raw_images[k], f"Habitat_{k}_Raw"),
            "labels": lbls
        }

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "factor_maps": factor_maps,
        "center": [centroid[1], centroid[0]],
        "bbox": bounds,
        "class_areas_km2": class_areas,
        "classify": classify,
        "thumb_url": final_thumb_url,
        "download_url": download_url,
        "factors": factors,
    }

    with _lock:
        _cache_unified[cache_key] = result
    return result
