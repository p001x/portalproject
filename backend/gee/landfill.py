import json
"""Landfill site suitability (SMCE / Weighted Overlay) — FastAPI backend."""
import math
import ee

from gee.aoi_utils import get_dynamic_scale

from cachetools import TTLCache
from threading import Lock
import concurrent.futures
from gee.classify_utils import quantile_classify

_cache: TTLCache = TTLCache(maxsize=128, ttl=86400)
_lock = Lock()

DEFAULT_WEIGHTS = {"river": 0.30, "residential": 0.25, "slope": 0.20, "road": 0.15, "lulc": 0.10}
FACTOR_ORDER = ["river", "residential", "slope", "road", "lulc"]
FACTOR_META = {
    "river":       {"label": "River Distance",        "weight_pct": 30,
                    "normal_desc": "Farther from rivers = more suitable",
                    "reversed_desc": "Closer to rivers = more suitable (reversed)"},
    "residential": {"label": "Residential Distance",  "weight_pct": 25,
                    "normal_desc": "Farther from settlements = more suitable",
                    "reversed_desc": "Closer to settlements = more suitable (reversed)"},
    "slope":       {"label": "Slope",                 "weight_pct": 20,
                    "normal_desc": "Gentler slope = more suitable",
                    "reversed_desc": "Steeper slope = more suitable (reversed)"},
    "road":        {"label": "Road Accessibility",    "weight_pct": 15,
                    "normal_desc": "Closer to roads = more suitable",
                    "reversed_desc": "Farther from roads = more suitable (reversed)"},
    "lulc":        {"label": "Land Cover",            "weight_pct": 10,
                    "normal_desc": "Bare land / grassland = more suitable",
                    "reversed_desc": "Forest / water / built-up = more suitable (reversed)"},
}
_SCORE_VIS = {"min": 1, "max": 5, "palette": ["#d73027", "#f46d43", "#fee08b", "#d9ef8b", "#1a9850"]}

# AHP Random Index table (Saaty)
_RI = {1: 0.0, 2: 0.0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}


def compute_ahp_data(weights: dict) -> dict:
    """
    Given a weight dict {factor: value}, compute the implied AHP pairwise comparison
    matrix and the consistency ratio (CR).

    When weights are entered directly (slider mode) the implied pairwise matrix is
    perfectly consistent, so CR = 0.  The function still returns the full matrix so
    the UI can display it for transparency.
    """
    n = len(FACTOR_ORDER)
    w = [max(weights.get(f, DEFAULT_WEIGHTS[f]), 1e-9) for f in FACTOR_ORDER]
    total = sum(w)
    w_norm = [x / total for x in w]

    # Pairwise comparison matrix: A[i][j] = w_i / w_j
    matrix = [
        [round(w_norm[i] / w_norm[j], 3) if w_norm[j] > 0 else 1.0 for j in range(n)]
        for i in range(n)
    ]

    # For a weight-derived matrix, λ_max = n exactly (perfectly consistent)
    lambda_max = float(n)
    ci = (lambda_max - n) / (n - 1) if n > 1 else 0.0   # always 0 here
    ri = _RI.get(n, 1.12)
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
    
    bg_mask = mask.unmask(0).Not()
    dist_pixels = bg_mask.fastDistanceTransform(1024, "pixels", "squared_euclidean").sqrt()
    
    # fastDistanceTransform returns 0 if no target is found within the neighborhood (1024 pixels).
    # We must replace these 0s with 1024 so they are correctly treated as "far away", 
    # rather than being falsely treated as "0 distance" (which ruins the suitability score).
    dist_pixels = dist_pixels.where(bg_mask.And(dist_pixels.eq(0)), 1024)

    distance_m = (
        dist_pixels
        .reproject(crs="EPSG:3857", scale=scale)
        .multiply(scale).clip(aoi)
    )
    return distance_m.divide(1000).reproject(crs="EPSG:4326", scale=scale)


def _reclass_river_far_is_good(d):
    # Rwanda has many rivers. >1km is excellent.
    return (ee.Image(1).where(d.gte(0.1).And(d.lt(0.2)), 2).where(d.gte(0.2).And(d.lt(0.5)), 3)
            .where(d.gte(0.5).And(d.lt(1.0)), 4).where(d.gte(1.0), 5))

def _reclass_residential_far_is_good(d):
    # Rwanda is densely populated. >2km is excellent.
    return (ee.Image(1).where(d.gte(0.2).And(d.lt(0.5)), 2).where(d.gte(0.5).And(d.lt(1.0)), 3)
            .where(d.gte(1.0).And(d.lt(2.0)), 4).where(d.gte(2.0), 5))

def _reclass_road_near_is_good(d):
    return (ee.Image(1).where(d.lt(5.0), 2).where(d.lt(2.5), 3).where(d.lt(1.0), 4).where(d.lt(0.5), 5))


def _apply_reverse(score_img, flag):
    return ee.Image(6).subtract(score_img) if flag else score_img


def _factor_urls(image, key: str, aoi) -> dict:
    return {
        "tile_url": image.getMapId(_SCORE_VIS)["tile_fetcher"].url_format,
        "thumb_url": image.getThumbURL({**_SCORE_VIS, "region": aoi.bounds(), "dimensions": 512, "crs": "EPSG:4326", "format": "png"}),
        "download_url": image.getDownloadURL({
            "name": f"Landfill_{key}_score", "scale": 100,
            "region": aoi.bounds(), "format": "GEO_TIFF", "filePerBand": False,
        }),
    }


def _normalize_weights(custom: dict | None) -> dict:
    """Return a normalized weight dict (values sum to 1.0)."""
    if not custom:
        return DEFAULT_WEIGHTS.copy()
    # Keep only known keys; fall back to default for missing ones
    raw = {k: max(float(custom.get(k, DEFAULT_WEIGHTS[k])), 1e-9) for k in FACTOR_ORDER}
    total = sum(raw.values())
    return {k: v / total for k, v in raw.items()}


def _build_landfill_base(
    aoi_config: dict, reverse_river: bool, reverse_residential: bool,
    reverse_slope: bool, reverse_road: bool, reverse_lulc: bool, custom_weights: dict | None
):
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    weights = _normalize_weights(custom_weights)
    reverse_flags = {
        "river": reverse_river, "residential": reverse_residential,
        "slope": reverse_slope, "road": reverse_road, "lulc": reverse_lulc,
    }

    dem = ee.Image("USGS/SRTMGL1_003").select("elevation").unmask(ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").mosaic(), False)
    slope_pct = ee.Terrain.slope(dem).multiply(math.pi / 180).tan().multiply(100)
    slope_score = (
        ee.Image(1)
        .where(slope_pct.gte(0).And(slope_pct.lt(5)), 5)
        .where(slope_pct.gte(5).And(slope_pct.lt(10)), 4)
        .where(slope_pct.gte(10).And(slope_pct.lt(15)), 3)
        .where(slope_pct.gte(15).And(slope_pct.lt(20)), 2)
        .where(slope_pct.gte(20), 1)
        .clip(aoi)
    )
    slope_score = _apply_reverse(slope_score, reverse_flags["slope"]).rename("slope_score")

    lc = ee.Image("ESA/WorldCover/v200/2021").select("Map").clip(aoi)
    gsw = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence")
    water_mask = gsw.gte(50).unmask(0).Or(lc.eq(80)).Or(lc.eq(90))
    river_dist_km = _distance_km(water_mask, aoi)
    river_score = _apply_reverse(_reclass_river_far_is_good(river_dist_km), reverse_flags["river"]).rename("river_score")

    residential_mask = lc.eq(50)
    residential_dist_km = _distance_km(residential_mask, aoi)
    residential_score = _apply_reverse(_reclass_residential_far_is_good(residential_dist_km), reverse_flags["residential"]).rename("residential_score")
    
    roads = ee.FeatureCollection("projects/sat-io/open-datasets/GRIP4/Africa").filterBounds(aoi)
    # Use FeatureCollection.distance for true, exact Euclidean distance from vector lines
    road_dist_km = roads.distance(searchRadius=50000, maxError=50).unmask(50000).divide(1000).clip(aoi)
    road_score = _apply_reverse(_reclass_road_near_is_good(road_dist_km), reverse_flags["road"]).rename("road_score")

    lulc_score = (
        ee.Image(1)
        .where(lc.eq(60).Or(lc.eq(30)), 5)
        .where(lc.eq(40), 3)
        .where(lc.eq(20), 2)
        .where(lc.eq(10).Or(lc.eq(80)).Or(lc.eq(90)).Or(lc.eq(95)).Or(lc.eq(50)), 1)
        .clip(aoi)
    )
    lulc_score = _apply_reverse(lulc_score, reverse_flags["lulc"]).rename("lulc_score")

    score_images = {
        "river": river_score, "residential": residential_score,
        "slope": slope_score, "road": road_score, "lulc": lulc_score,
    }

    suitability = (
        river_score.multiply(weights["river"])
        .add(residential_score.multiply(weights["residential"]))
        .add(slope_score.multiply(weights["slope"]))
        .add(road_score.multiply(weights["road"]))
        .add(lulc_score.multiply(weights["lulc"]))
    ).rename("suitability")

    # STRICT EXCLUSION ZONES:
    # 1. Protected Areas (National Parks, Reserves)
    protected_areas = ee.FeatureCollection("WCMC/WDPA/current/polygons").filterBounds(aoi)
    protected_mask = ee.Image(0).paint(protected_areas, 1).unmask(0)
    
    # 2. Water Bodies (already defined as water_mask)
    # Combine into a single exclusion mask
    exclusion_mask = protected_mask.eq(1).Or(water_mask.eq(1))

    # Mask out the excluded areas so they are completely removed from the map and statistics
    suitability = suitability.updateMask(exclusion_mask.Not())

    raw_layers = {
        "river_dist_km": river_dist_km,
        "residential_dist_km": residential_dist_km,
        "road_dist_km": road_dist_km,
        "slope_pct": slope_pct,
        "lc": lc
    }

    return aoi, suitability, score_images, raw_layers, weights, reverse_flags

def compute_landfill_map(
    aoi_config: dict,
    reverse_river: bool = False, reverse_residential: bool = False,
    reverse_slope: bool = False, reverse_road: bool = False, reverse_lulc: bool = False,
    custom_weights: dict | None = None,
) -> dict:
    weights = _normalize_weights(custom_weights)
    weights_tuple = tuple(round(weights[k], 6) for k in FACTOR_ORDER)
    cache_key = ("landfill_map", json.dumps(aoi_config, sort_keys=True),
        reverse_river, reverse_residential, reverse_slope, reverse_road, reverse_lulc, weights_tuple)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, suitability, score_images, _, weights, reverse_flags = _build_landfill_base(
        aoi_config, reverse_river, reverse_residential, reverse_slope, reverse_road, reverse_lulc, custom_weights
    )
    
    map_id = suitability.getMapId(_SCORE_VIS)
    final_thumb_url = suitability.getThumbURL({
        **_SCORE_VIS, "region": aoi.bounds(), "dimensions": 512, "crs": "EPSG:4326", "format": "png",
    })

    from gee.aoi_utils import get_bounds_and_center


    bounds, center = get_bounds_and_center(aoi)

    factor_maps = {}
    for key in FACTOR_ORDER:
        meta = FACTOR_META[key]
        urls = _factor_urls(score_images[key], key, aoi)
        w_pct = round(weights[key] * 100, 1)
        factor_maps[key] = {
            "label": meta["label"],
            "weight_pct": w_pct,
            "reversed": reverse_flags[key],
            "description": meta["reversed_desc"] if reverse_flags[key] else meta["normal_desc"],
            **urls,
        }

    ahp_data = compute_ahp_data(weights)

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": final_thumb_url,
        "factor_maps": factor_maps,
        "reverse_flags": reverse_flags,
        "weights_used": {k: round(v, 4) for k, v in weights.items()},
        "ahp_data": ahp_data,
        "center": center,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
        "bbox": bounds,
    }
    with _lock:
        _cache[cache_key] = result
    return result

def compute_landfill_stats(
    aoi_config: dict,
    reverse_river: bool = False, reverse_residential: bool = False,
    reverse_slope: bool = False, reverse_road: bool = False, reverse_lulc: bool = False,
    custom_weights: dict | None = None,
) -> dict:
    weights = _normalize_weights(custom_weights)
    weights_tuple = tuple(round(weights[k], 6) for k in FACTOR_ORDER)
    cache_key = ("landfill_stats", json.dumps(aoi_config, sort_keys=True),
        reverse_river, reverse_residential, reverse_slope, reverse_road, reverse_lulc, weights_tuple)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, suitability, _, _, _, _ = _build_landfill_base(
        aoi_config, reverse_river, reverse_residential, reverse_slope, reverse_road, reverse_lulc, custom_weights
    )

    classes = {
        "Very Unsuitable (< 1.8)": suitability.lt(1.8),
        "Unsuitable (1.8–2.6)": suitability.gte(1.8).And(suitability.lt(2.6)),
        "Marginally Suitable (2.6–3.4)": suitability.gte(2.6).And(suitability.lt(3.4)),
        "Moderately Suitable (3.4–4.2)": suitability.gte(3.4).And(suitability.lt(4.2)),
        "Highly Suitable (> 4.2)": suitability.gte(4.2),
    }
    labels = list(classes.keys())
    area_img = ee.Image.cat([
        classes[lbl].multiply(ee.Image.pixelArea()).rename(f"c{i}")
        for i, lbl in enumerate(labels)
    ])

    area_dict = area_img.reduceRegion(
        reducer=ee.Reducer.sum(), geometry=aoi.bounds(maxError=1000), scale=get_dynamic_scale(aoi), maxPixels=1e10
    ).getInfo()

    class_areas = {
        lbl: round((area_dict.get(f"c{i}", 0) or 0) / 1e6, 2)
        for i, lbl in enumerate(labels)
    }

    result = {
        "stats": {
            "Total Area (km²)": round(sum(class_areas.values()), 2),
            "Highly Suitable (km²)": class_areas.get("Highly Suitable (> 4.2)", 0),
            "Unsuitable (km²)": class_areas.get("Very Unsuitable (< 1.8)", 0) + class_areas.get("Unsuitable (1.8–2.6)", 0),
        },
        "class_areas_km2": class_areas,
    }
    with _lock:
        _cache[cache_key] = result
    return result

def compute_landfill_classify(
    aoi_config: dict,
    reverse_river: bool = False, reverse_residential: bool = False,
    reverse_slope: bool = False, reverse_road: bool = False, reverse_lulc: bool = False,
    n_classes: int = 5, method: str = "natural_breaks", custom_labels: list = None,
    custom_weights: dict | None = None,
) -> dict:
    weights = _normalize_weights(custom_weights)
    weights_tuple = tuple(round(weights[k], 6) for k in FACTOR_ORDER)
    cache_key = ("landfill_classify", json.dumps(aoi_config, sort_keys=True),
        reverse_river, reverse_residential, reverse_slope, reverse_road, reverse_lulc,
        n_classes, method, tuple(custom_labels) if custom_labels else None, weights_tuple)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, suitability, _, raw_layers, _, _ = _build_landfill_base(
        aoi_config, reverse_river, reverse_residential, reverse_slope, reverse_road, reverse_lulc, custom_weights
    )

    classify = quantile_classify(
        layers=[
            {"name": "suitability",    "image": suitability,               "title": "Suitability Index"},
            {"name": "river_score",    "image": raw_layers["river_dist_km"],      "title": "River Distance (km)"},
            {"name": "resid_score",    "image": raw_layers["residential_dist_km"],"title": "Residential Distance (km)"},
            {"name": "slope_score",    "image": raw_layers["slope_pct"],      "title": "Slope (%)"},
            {"name": "road_score",     "image": raw_layers["road_dist_km"],       "title": "Road Accessibility (km)"},
            {"name": "lulc_score",     "image": raw_layers["lc"],       "title": "Land Cover (Categorical)"},
        ],
        aoi=aoi, scale=get_dynamic_scale(aoi), n_classes=n_classes,
        method=method, custom_labels=custom_labels
    )
    with _lock:
        _cache[cache_key] = result = classify
    return result

def compute_landfill_export(
    aoi_config: dict,
    reverse_river: bool = False, reverse_residential: bool = False,
    reverse_slope: bool = False, reverse_road: bool = False, reverse_lulc: bool = False,
    custom_weights: dict | None = None,
) -> dict:
    weights = _normalize_weights(custom_weights)
    weights_tuple = tuple(round(weights[k], 6) for k in FACTOR_ORDER)
    cache_key = ("landfill_export", json.dumps(aoi_config, sort_keys=True),
        reverse_river, reverse_residential, reverse_slope, reverse_road, reverse_lulc, weights_tuple)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, suitability, _, _, _, _ = _build_landfill_base(
        aoi_config, reverse_river, reverse_residential, reverse_slope, reverse_road, reverse_lulc, custom_weights
    )

    result = {
        "download_url": suitability.getDownloadURL({
            "scale": 100, "region": aoi.bounds(), "format": "GEO_TIFF"
        })
    }
    with _lock:
        _cache[cache_key] = result
    return result
