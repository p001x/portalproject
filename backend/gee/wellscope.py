import json
import ee
from cachetools import TTLCache
from threading import Lock
import concurrent.futures

_cache_map = TTLCache(maxsize=128, ttl=3600)
_lock = Lock()

FACTOR_ORDER = ["rainfall", "lithology", "slope", "twi", "drainage", "dist_water", "lulc"]
DEFAULT_WEIGHTS = {
    "rainfall": 30.0,
    "lithology": 21.0,
    "slope": 15.0,
    "twi": 15.0,
    "drainage": 9.0,
    "dist_water": 6.0,
    "lulc": 4.0
}
FACTOR_META = {
    "rainfall":   {"label": "Rainfall", "weight_pct": 30},
    "lithology":  {"label": "Lithology", "weight_pct": 21},
    "slope":      {"label": "Slope", "weight_pct": 15},
    "twi":        {"label": "Topographic Wetness", "weight_pct": 15},
    "drainage":   {"label": "Drainage Density", "weight_pct": 9},
    "dist_water": {"label": "Distance to Water", "weight_pct": 6},
    "lulc":       {"label": "Land Cover", "weight_pct": 4},
}

_SCORE_VIS = {"min": 1, "max": 5, "palette": ["#d73027", "#f46d43", "#fee08b", "#d9ef8b", "#1a9850"]}
_SUITABILITY_VIS = {
    "min": 0,
    "max": 100,
    "palette": ["#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850"]
}

_RI = {1: 0.0, 2: 0.0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}

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
        "thumb_url": image.getThumbURL({**_SCORE_VIS, "region": aoi.bounds(), "dimensions": 512, "format": "png"}),
    }

def _normalize_weights(custom: dict | None) -> dict:
    if not custom:
        return {k: v / 100.0 for k, v in DEFAULT_WEIGHTS.items()}
    raw = {k: max(float(custom.get(k, DEFAULT_WEIGHTS[k])), 1e-9) for k in FACTOR_ORDER}
    total = sum(raw.values())
    return {k: v / total for k, v in raw.items()}

def get_factor_images(aoi):
    # 1. Rainfall
    rain = ee.Image("WORLDCLIM/V1/BIO").select('bio12').clip(aoi)
    rain_score = _reclassify(rain, [900, 1000, 1100, 1200], [1, 2, 3, 4, 5])

    # 2. Lithology
    try:
        lith_score = ee.Image(3).toFloat().clip(aoi) 
    except Exception:
        lith_score = ee.Image(3).toFloat().clip(aoi)

    # 3. Slope
    dem = ee.ImageCollection("COPERNICUS/DEM/GLO30").select('DEM').mosaic().clip(aoi)
    slope = ee.Terrain.slope(dem)
    slope_score = _reclassify(slope, [5, 10, 15, 25], [5, 4, 3, 2, 1])

    # 4. TWI
    flow_acc = ee.Image("WWF/HydroSHEDS/15ACC").select('b1').clip(aoi)
    slope_rad = slope.multiply(3.14159 / 180.0)
    tan_slope = slope_rad.tan().max(0.001)
    twi = flow_acc.add(1).divide(tan_slope).log()
    twi_score = _reclassify(twi, [2, 4, 6, 8], [1, 2, 3, 4, 5])

    # 5. Drainage Density
    streams = flow_acc.gt(100)
    dist_to_stream = streams.fastDistanceTransform(256).multiply(30).clip(aoi)
    drainage_score = _reclassify(dist_to_stream, [100, 300, 600, 1000], [1, 2, 3, 4, 5])

    # 6. Distance to Surface Water
    gsw = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select('occurrence')
    water_mask = gsw.gt(0).unmask(0).clip(aoi)
    dist_water = water_mask.fastDistanceTransform(256).multiply(30).clip(aoi)
    dist_water_score = _reclassify(dist_water, [250, 500, 1000, 2000], [5, 4, 3, 2, 1])

    # 7. LULC
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
        "lulc": lulc_score,
    }

def compute_wellscope(aoi_config: dict, custom_weights: dict = None) -> dict:
    cache_key = json.dumps({"aoi": aoi_config, "weights": custom_weights, "module": "wellscope"}, sort_keys=True)
    with _lock:
        if cache_key in _cache_map:
            return _cache_map[cache_key]

    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)

    weights = _normalize_weights(custom_weights)
    ahp_data = compute_ahp_data({k: v * 100 for k, v in weights.items()})

    score_images = get_factor_images(aoi)
    rain_score = score_images["rainfall"]
    lith_score = score_images["lithology"]
    slope_score = score_images["slope"]
    twi_score = score_images["twi"]
    drainage_score = score_images["drainage"]
    dist_water_score = score_images["dist_water"]
    lulc_score = score_images["lulc"]

    # Weighted Sum
    suitability = (
        rain_score.multiply(weights["rainfall"])
        .add(lith_score.multiply(weights["lithology"]))
        .add(slope_score.multiply(weights["slope"]))
        .add(twi_score.multiply(weights["twi"]))
        .add(drainage_score.multiply(weights["drainage"]))
        .add(dist_water_score.multiply(weights["dist_water"]))
        .add(lulc_score.multiply(weights["lulc"]))
    )

    suitability_100 = suitability.subtract(1).divide(4).multiply(100).rename("GWP")
    
    bands_img = ee.Image(1) \
        .where(suitability_100.gte(20).multiply(suitability_100.lt(40)), 2) \
        .where(suitability_100.gte(40).multiply(suitability_100.lt(60)), 3) \
        .where(suitability_100.gte(60).multiply(suitability_100.lt(80)), 4) \
        .where(suitability_100.gte(80), 5) \
        .rename("Band")

    labels = ["Very Low (0-19)", "Low (20-39)", "Moderate (40-59)", "High (60-79)", "Very High (80-100)"]
    area_img = ee.Image.cat(
        [bands_img.eq(i+1).multiply(ee.Image.pixelArea()).rename(f"c{i}") for i in range(5)]
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        f_stats = executor.submit(
            lambda: suitability_100.reduceRegion(
                reducer=ee.Reducer.mean().combine(ee.Reducer.min(), sharedInputs=True).combine(ee.Reducer.max(), sharedInputs=True),
                geometry=aoi,
                scale=100,
                maxPixels=1e7,
                bestEffort=True
            ).getInfo()
        )
        f_area = executor.submit(
            lambda: area_img.reduceRegion(
                reducer=ee.Reducer.sum(),
                geometry=aoi,
                scale=100,
                maxPixels=1e7,
                bestEffort=True
            ).getInfo()
        )
        f_bounds = executor.submit(
            lambda: aoi.bounds().getInfo()["coordinates"][0]
        )
        f_factors = executor.submit(
            lambda: {k: _factor_urls(v, k, aoi) for k, v in score_images.items()}
        )

        stats = f_stats.result()
        area_dict = f_area.result()
        bounds = f_bounds.result()
        factor_maps = f_factors.result()

    class_areas = {
        labels[i]: round((area_dict.get(f"c{i}", 0) or 0) / 1e6, 2)
        for i in range(5)
    }

    map_id = suitability_100.getMapId(_SUITABILITY_VIS)
    thumb_url = suitability_100.getThumbURL({
        **_SUITABILITY_VIS,
        "region": aoi.bounds(),
        "dimensions": 512,
        "format": "png"
    })

    center_lon = (bounds[0][0] + bounds[2][0]) / 2
    center_lat = (bounds[0][1] + bounds[2][1]) / 2

    res = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": thumb_url,
        "factor_maps": factor_maps,
        "ahp_data": ahp_data,
        "center": [center_lat, center_lon],
        "bbox": bounds,
        "stats": {
            "Mean Suitability": round(stats.get("GWP_mean") or 0, 1),
            "Min Suitability": round(stats.get("GWP_min") or 0, 1),
            "Max Suitability": round(stats.get("GWP_max") or 0, 1),
        },
        "class_areas_km2": class_areas,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
    }
    
    with _lock:
        _cache_map[cache_key] = res
    return res

def export_factor_map(aoi_config: dict, factor_key: str, palette: list = None) -> dict:
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    
    score_images = get_factor_images(aoi)
    if factor_key not in score_images:
        raise ValueError(f"Invalid factor key: {factor_key}")
        
    image = score_images[factor_key]
    
    if palette:
        vis = {"min": 1, "max": 5, "palette": palette}
    else:
        vis = _SCORE_VIS
        
    thumb_url = image.getThumbURL({
        **vis,
        "region": aoi.bounds(),
        "dimensions": 1024,
        "format": "png"
    })
    
    download_url = image.getDownloadURL({
        "scale": 30,
        "crs": "EPSG:4326",
        "region": aoi,
        "format": "GEO_TIFF"
    })
    
    return {
        "thumb_url": thumb_url,
        "download_url": download_url
    }

