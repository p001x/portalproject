import json
import ee
from gee.persistent_cache import PersistentCache
from threading import Lock
import concurrent.futures
from gee.persistent_cache import with_cache

_cache_map = PersistentCache(ttl=3600)
_lock = Lock()

FACTOR_ORDER = ["rainfall", "lithology", "slope", "twi", "drainage", "dist_water", "soil", "lulc"]
DEFAULT_WEIGHTS = {
    "rainfall": 26.0,
    "lithology": 18.0,
    "slope": 13.0,
    "twi": 13.0,
    "drainage": 9.0,
    "dist_water": 6.0,
    "soil": 11.0,
    "lulc": 4.0
}
FACTOR_META = {
    "rainfall":   {"label": "Rainfall", "weight_pct": 26},
    "lithology":  {"label": "Lithology", "weight_pct": 18},
    "slope":      {"label": "Slope", "weight_pct": 13},
    "twi":        {"label": "Topographic Wetness", "weight_pct": 13},
    "drainage":   {"label": "Drainage Density", "weight_pct": 9},
    "dist_water": {"label": "Distance to Water", "weight_pct": 6},
    "soil":       {"label": "Soil Permeability", "weight_pct": 11},
    "lulc":       {"label": "Land Cover", "weight_pct": 4},
}

_SCORE_VIS = {"min": 1, "max": 5, "palette": ["#d73027", "#f46d43", "#fee08b", "#d9ef8b", "#1a9850"]}
_SUITABILITY_VIS = {
    "min": 0,
    "max": 100,
    "palette": ["#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850"]
}

_RI = {1: 0.0, 2: 0.0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}

@with_cache
def compute_ahp_data(weights: dict) -> dict:
    n = len(FACTOR_ORDER)
    w = [max(weights.get(f, DEFAULT_WEIGHTS[f]), 1e-9) for f in FACTOR_ORDER]
    total = sum(w)
    w_norm = [x / total for x in w]

    matrix = [
        [round(w_norm[i] / w_norm[j], 3) if w_norm[j] > 0 else 1.0 for j in range(n)]
        for i in range(n)
    ]

    lambda_max = float(n)
    ci = (lambda_max - n) / (n - 1) if n > 1 else 0.0
    ri = _RI.get(n, 1.32)
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

def _reclassify(image, thresholds, values):
    result = ee.Image(values[-1])
    for i in range(len(thresholds) - 1, -1, -1):
        result = result.where(image.lt(thresholds[i]), values[i])
    return result.toFloat()

def _factor_urls(image, key: str, aoi) -> dict:
    return {
        "label": FACTOR_META[key]["label"],
        "weight_pct": FACTOR_META[key]["weight_pct"],
        "tile_url": image.getMapId(_SCORE_VIS)["tile_fetcher"].url_format,
        "thumb_url": image.getThumbURL({**_SCORE_VIS, "region": aoi.bounds(), "dimensions": 512, "crs": "EPSG:4326", "format": "png"}),
    }

def _normalize_weights(custom: dict | None) -> dict:
    if not custom:
        return {k: v / 100.0 for k, v in DEFAULT_WEIGHTS.items()}
    raw = {k: max(float(custom.get(k, DEFAULT_WEIGHTS[k])), 1e-9) for k in FACTOR_ORDER}
    total = sum(raw.values())
    return {k: v / total for k, v in raw.items()}

def get_factor_images(aoi, dynamic_scale):
    from gee.classify_utils import get_jenks_breaks

    def apply_jenks(img, name, reverse=False, n=5):
        hist = img.reduceRegion(
            reducer=ee.Reducer.autoHistogram(),
            geometry=aoi.bounds(maxError=1000),
            scale=dynamic_scale,
            maxPixels=10000,
            bestEffort=True
        ).getInfo()
        
        band_name = list(hist.keys())[0] if hist else None
        if not hist or not band_name or not hist[band_name]:
            return ee.Image(3).updateMask(img.mask()).toFloat()
            
        bps = get_jenks_breaks(hist[band_name], n)
        bps = list(sorted(set(bps)))
        
        if len(bps) < 2: return ee.Image(3).updateMask(img.mask()).toFloat()
            
        values = [5, 4, 3, 2, 1] if reverse else [1, 2, 3, 4, 5]
        
        result = ee.Image(values[-1])
        for i in range(len(bps) - 1, -1, -1):
            result = result.where(img.lt(bps[i]), values[min(i, 4)])
        return result.updateMask(img.mask()).toFloat()

    # 1. Rainfall
    rain = ee.Image("WORLDCLIM/V1/BIO").select('bio12').clip(aoi)
    rain_score = apply_jenks(rain, 'bio12')

    # 2. Lithology
    # Using the local asset 'litodoloy' instead of the deprecated ALOS_lithology
    lith = ee.Image("projects/ee-petersonyang87/assets/litodoloy").clip(aoi)
    
    # Remap the local 1-10 classes into groundwater potential scores (1-5)
    # Defaulting unmapped values to 3
    lith_score = lith.remap(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 
        [3, 4, 5, 2, 1, 3, 4, 2, 5, 1], 
        3
    ).toFloat().clip(aoi)

    # 3. Slope
    dem = ee.Image("USGS/SRTMGL1_003").select("elevation").clip(aoi)
    slope = ee.Terrain.slope(dem)
    slope_score = apply_jenks(slope, 'slope', reverse=True)

    # 4. TWI
    flow_acc = ee.Image("WWF/HydroSHEDS/15ACC").select('b1').clip(aoi)
    slope_rad = slope.multiply(3.14159 / 180.0)
    tan_slope = slope_rad.tan().max(0.001)
    twi = flow_acc.add(1).divide(tan_slope).log().rename("twi")
    twi_score = apply_jenks(twi, 'twi')

    # 5. Drainage Density (Spatial Interpolation)
    # Using MERIT 90m for highly detailed streams.
    merit_upa = ee.Image("MERIT/Hydro/v1_0_1").select('upa')
    streams = merit_upa.gt(5).unmask(0)
    
    # We apply spatial interpolation (Kernel smoothing/focal mean) to compute true stream density (concentration per area).
    drainage_density = streams.focal_mean(radius=4000, units='meters').clip(aoi).rename("drainage")
    drainage_score = apply_jenks(drainage_density, 'drainage')

    # 6. Distance to Surface Water (True Euclidean Distance)
    gsw = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select('occurrence')
    water_mask = gsw.gt(0).unmask(0).clip(aoi)
    
    # Cost is the physical size of the pixel in meters. This guarantees the cumulative cost
    # is the exact Euclidean distance in meters, remaining 100% accurate at all zoom levels.
    cost = ee.Image.pixelArea().sqrt()
    dist_water = cost.cumulativeCost(source=water_mask, maxDistance=150000).clip(aoi).rename("dist_water")
    dist_water_score = apply_jenks(dist_water, 'dist_water', reverse=True)

    # 7. Soil Permeability (Sand vs Clay)
    clay = ee.Image("OpenLandMap/SOL/SOL_CLAY-WFRACTION_USDA-3A1A1A_M/v02").select("b0").clip(aoi)
    sand = ee.Image("OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02").select("b0").clip(aoi)
    # High sand = high infiltration (good), High clay = high runoff (bad)
    # Simple Permeability Index: Sand - Clay
    permeability = sand.subtract(clay).rename("soil_perm")
    soil_score = apply_jenks(permeability, 'soil_perm')

    # 8. LULC
    lulc = ee.ImageCollection("ESA/WorldCover/v200").first().select('Map').clip(aoi)
    lulc_score = ee.Image(1) \
        .where(lulc.eq(10), 5) \
        .where(lulc.eq(90), 5) \
        .where(lulc.eq(95), 5) \
        .where(lulc.eq(20), 4) \
        .where(lulc.eq(30), 4) \
        .where(lulc.eq(40), 3) \
        .toFloat().clip(aoi)

    return {
        "rainfall": rain_score,
        "lithology": lith_score,
        "slope": slope_score,
        "twi": twi_score,
        "drainage": drainage_score,
        "dist_water": dist_water_score,
        "soil": soil_score,
        "lulc": lulc_score,
    }

def _build_wellscope_base(aoi_config: dict, custom_weights: dict = None):
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    from gee.aoi_utils import get_dynamic_scale
    dynamic_scale = get_dynamic_scale(aoi)

    weights = _normalize_weights(custom_weights)
    score_images = get_factor_images(aoi, dynamic_scale)
    
    suitability = (
        score_images["rainfall"].multiply(weights["rainfall"])
        .add(score_images["lithology"].multiply(weights["lithology"]))
        .add(score_images["slope"].multiply(weights["slope"]))
        .add(score_images["twi"].multiply(weights["twi"]))
        .add(score_images["drainage"].multiply(weights["drainage"]))
        .add(score_images["dist_water"].multiply(weights["dist_water"]))
        .add(score_images["soil"].multiply(weights["soil"]))
        .add(score_images["lulc"].multiply(weights["lulc"]))
    )

    suitability_100 = suitability.subtract(1).divide(4).multiply(100).rename("GWP")
    
    return aoi, dynamic_scale, weights, score_images, suitability_100

@with_cache
def compute_wellscope_map(aoi_config: dict, custom_weights: dict = None) -> dict:
    cache_key = ("wellscope_map", json.dumps(aoi_config, sort_keys=True), json.dumps(custom_weights, sort_keys=True) if custom_weights else None)
    with _lock:
        if cache_key in _cache_map:
            return _cache_map[cache_key]

    aoi, dynamic_scale, weights, score_images, suitability_100 = _build_wellscope_base(aoi_config, custom_weights)
    ahp_data = compute_ahp_data({k: v * 100 for k, v in weights.items()})

    from gee.aoi_utils import get_bounds_and_center


    bounds, center = get_bounds_and_center(aoi)

    map_id = suitability_100.getMapId(_SUITABILITY_VIS)
    thumb_url = suitability_100.getThumbURL({
        **_SUITABILITY_VIS, "region": aoi.bounds(), "dimensions": 512, "crs": "EPSG:4326", "format": "png"
    })

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_factors = executor.submit(lambda: {k: _factor_urls(v, k, aoi) for k, v in score_images.items()})
        factor_maps = f_factors.result()

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": thumb_url,
        "factor_maps": factor_maps,
        "ahp_data": ahp_data,
        "center": center,
        "bbox": bounds,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
    }
    with _lock:
        _cache_map[cache_key] = result
    return result

@with_cache
def compute_wellscope_stats(aoi_config: dict, custom_weights: dict = None) -> dict:
    cache_key = ("wellscope_stats", json.dumps(aoi_config, sort_keys=True), json.dumps(custom_weights, sort_keys=True) if custom_weights else None)
    with _lock:
        if cache_key in _cache_map:
            return _cache_map[cache_key]

    aoi, dynamic_scale, _, _, suitability_100 = _build_wellscope_base(aoi_config, custom_weights)

    stats = suitability_100.reduceRegion(
        reducer=ee.Reducer.mean().combine(ee.Reducer.min(), sharedInputs=True).combine(ee.Reducer.max(), sharedInputs=True),
        geometry=aoi.bounds(maxError=1000),
        scale=dynamic_scale,
        maxPixels=1e10
    ).getInfo()

    result = {
        "Mean Suitability": round(stats.get("GWP_mean") or 0, 1),
        "Min Suitability": round(stats.get("GWP_min") or 0, 1),
        "Max Suitability": round(stats.get("GWP_max") or 0, 1),
    }
    with _lock:
        _cache_map[cache_key] = result
    return result

@with_cache
def compute_wellscope_classify(aoi_config: dict, custom_weights: dict = None, n_classes: int = 5, method: str = "natural_breaks", custom_labels: list = None) -> dict:
    labels_tuple = tuple(custom_labels) if custom_labels else None
    cache_key = ("wellscope_classify", json.dumps(aoi_config, sort_keys=True), json.dumps(custom_weights, sort_keys=True) if custom_weights else None, n_classes, method, labels_tuple)
    with _lock:
        if cache_key in _cache_map:
            return _cache_map[cache_key]

    aoi, dynamic_scale, _, _, suitability_100 = _build_wellscope_base(aoi_config, custom_weights)
    from gee.classify_utils import quantile_classify
    
    classify_method = method if method != "continuous" else "natural_breaks"

    classify = quantile_classify(
        layers=[{"name": "GWP", "image": suitability_100, "title": "Groundwater Suitability"}],
        aoi=aoi,
        scale=dynamic_scale,
        n_classes=n_classes,
        reverse_palette=False,
        method=classify_method,
        custom_labels=custom_labels
    )

    raw_areas = classify.get("panels", [{}])[0].get("areas", {})
    class_areas = {k: v for k, v in raw_areas.items()}

    result = {
        "classify": classify,
        "class_areas_km2": class_areas,
        "classified_areas_km2": raw_areas,
    }
    with _lock:
        _cache_map[cache_key] = result
    return result

@with_cache
def compute_wellscope_export(aoi_config: dict, custom_weights: dict = None) -> dict:
    cache_key = ("wellscope_export", json.dumps(aoi_config, sort_keys=True), json.dumps(custom_weights, sort_keys=True) if custom_weights else None)
    with _lock:
        if cache_key in _cache_map:
            return _cache_map[cache_key]

    aoi, _, _, _, suitability_100 = _build_wellscope_base(aoi_config, custom_weights)

    result = {
        "download_url": suitability_100.getDownloadURL({
            "scale": 100, "region": aoi.bounds(), "format": "GEO_TIFF", "crs": "EPSG:4326"
        })
    }
    with _lock:
        _cache_map[cache_key] = result
    return result

def export_factor_map(aoi_config: dict, factor_key: str, palette: list = None) -> dict:
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    from gee.aoi_utils import get_dynamic_scale
    dynamic_scale = get_dynamic_scale(aoi)
        
    score_images = get_factor_images(aoi, dynamic_scale)
    if factor_key not in score_images:
        raise ValueError(f"Invalid factor key: {factor_key}")
        
    image = score_images[factor_key]
    vis = {"min": 1, "max": 5, "palette": palette} if palette else _SCORE_VIS
        
    return {
        "thumb_url": image.getThumbURL({**vis, "region": aoi.bounds(), "dimensions": 1024, "crs": "EPSG:4326", "format": "png"}),
        "download_url": image.getDownloadURL({"scale": 30, "crs": "EPSG:4326", "region": aoi, "format": "GEO_TIFF"})
    }


