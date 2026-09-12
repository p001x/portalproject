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

def get_factor_images(aoi, dynamic_scale):
    from gee.classify_utils import get_jenks_breaks

    def apply_jenks(img, name, reverse=False, n=5):
        hist = img.reduceRegion(
            reducer=ee.Reducer.autoHistogram(),
            geometry=aoi,
            scale=dynamic_scale,
            maxPixels=1e9
        ).getInfo()
        
        band_name = list(hist.keys())[0] if hist else None
        if not hist or not band_name or not hist[band_name]:
            return ee.Image(3).toFloat()
            
        bps = get_jenks_breaks(hist[band_name], n)
        bps = list(sorted(set(bps)))
        
        if len(bps) < 2: return ee.Image(3).toFloat()
            
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
    dem = ee.ImageCollection("COPERNICUS/DEM/GLO30").select('DEM').mosaic().clip(aoi)
    slope = ee.Terrain.slope(dem)
    slope_score = apply_jenks(slope, 'slope', reverse=True)

    # 4. TWI
    flow_acc = ee.Image("WWF/HydroSHEDS/15ACC").select('b1').clip(aoi)
    slope_rad = slope.multiply(3.14159 / 180.0)
    tan_slope = slope_rad.tan().max(0.001)
    twi = flow_acc.add(1).divide(tan_slope).log().rename("twi")
    twi_score = apply_jenks(twi, 'twi')

    # 5. Drainage Density (Distance to streams)
    streams = flow_acc.gt(100)
    # fastDistanceTransform targets 0. We invert streams so 0 = stream. (463m is approx 15 arcsec)
    dist_to_stream = streams.Not().fastDistanceTransform(256).multiply(463).clip(aoi).rename("dist_stream")
    drainage_score = apply_jenks(dist_to_stream, 'dist_stream', reverse=True)

    # 6. Distance to Surface Water
    gsw = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select('occurrence')
    water_mask = gsw.gt(0).unmask(0).clip(aoi)
    # Invert water_mask so 0 = water
    dist_water = water_mask.Not().fastDistanceTransform(256).multiply(30).clip(aoi).rename("dist_water")
    dist_water_score = apply_jenks(dist_water, 'dist_water', reverse=True)

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
    # Calculate dynamic scale based on geometry size (sq km)
    area_sqkm = aoi.area().divide(1e6).getInfo()
    if area_sqkm > 10000:
        dynamic_scale = 500   # Entire Country (High memory footprint)
    elif area_sqkm > 2000:
        dynamic_scale = 250   # Province
    elif area_sqkm > 500:
        dynamic_scale = 100   # Large District
    else:
        dynamic_scale = 30    # Sector or small polygon


    weights = _normalize_weights(custom_weights)
    ahp_data = compute_ahp_data({k: v * 100 for k, v in weights.items()})

    score_images = get_factor_images(aoi, dynamic_scale)
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
    
    from gee.classify_utils import get_jenks_breaks
    hist = suitability_100.reduceRegion(
        reducer=ee.Reducer.autoHistogram(),
        geometry=aoi,
        scale=dynamic_scale,
        maxPixels=1e9
    ).getInfo()
    
    bands_img = ee.Image(3)
    labels = ["Class 1 (Very Low)", "Class 2 (Low)", "Class 3 (Moderate)", "Class 4 (High)", "Class 5 (Very High)"]
    
    if hist and "GWP" in hist and hist["GWP"]:
        bps = get_jenks_breaks(hist["GWP"], 5)
        bps = list(sorted(set(bps)))
        if len(bps) >= 2:
            values = [1, 2, 3, 4, 5]
            bands_img = ee.Image(values[-1])
            for i in range(len(bps) - 1, -1, -1):
                bands_img = bands_img.where(suitability_100.lt(bps[i]), values[min(i, 4)])
            
            # Form labels with breaks
            labels = []
            prev = 0
            for i, bp in enumerate(bps):
                labels.append(f"Class {i+1} ({prev:.1f}-{bp:.1f})")
                prev = bp
            labels.append(f"Class {len(bps)+1} ({prev:.1f}+)")
            while len(labels) < 5: labels.append("N/A")
            labels = labels[:5]

    bands_img = bands_img.updateMask(suitability_100.mask()).toFloat().rename("Band")

    area_img = ee.Image.cat(
        [bands_img.eq(i+1).multiply(ee.Image.pixelArea()).rename(f"c{i}") for i in range(5)]
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        f_stats = executor.submit(
            lambda: suitability_100.reduceRegion(
                reducer=ee.Reducer.mean().combine(ee.Reducer.min(), sharedInputs=True).combine(ee.Reducer.max(), sharedInputs=True),
                geometry=aoi,
                scale=dynamic_scale,
                maxPixels=1e10
            ).getInfo()
        )
        f_area = executor.submit(
            lambda: area_img.reduceRegion(
                reducer=ee.Reducer.sum(),
                geometry=aoi,
                scale=dynamic_scale,
                maxPixels=1e10
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

    map_id = bands_img.getMapId(_SCORE_VIS)
    thumb_url = bands_img.getThumbURL({
        **_SCORE_VIS,
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
    
    area_sqkm = aoi.area().divide(1e6).getInfo()
    if area_sqkm > 10000:
        dynamic_scale = 500
    elif area_sqkm > 2000:
        dynamic_scale = 250
    elif area_sqkm > 500:
        dynamic_scale = 100
    else:
        dynamic_scale = 30
        
    score_images = get_factor_images(aoi, dynamic_scale)
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

