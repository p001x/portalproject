import json
import ee
import time
import math
from cachetools import TTLCache
from threading import Lock, BoundedSemaphore
import concurrent.futures

gee_semaphore = BoundedSemaphore(5)

_cache_map = TTLCache(maxsize=64, ttl=3600)
_cache_stats = TTLCache(maxsize=64, ttl=3600)
_cache_classify = TTLCache(maxsize=64, ttl=3600)
_cache_export = TTLCache(maxsize=64, ttl=3600)
_cache_build = TTLCache(maxsize=64, ttl=3600)
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

def _normalize_weights(custom: dict | None) -> dict:
    if not custom:
        return {k: v / 100.0 for k, v in DEFAULT_WEIGHTS.items()}
    raw = {k: max(float(custom.get(k, DEFAULT_WEIGHTS[k])), 1e-9) for k in FACTOR_ORDER}
    total = sum(raw.values())
    return {k: v / total for k, v in raw.items()}

from gee.aoi_utils import get_dynamic_scale

def _build_wellscope_base(aoi_config: dict, custom_weights: dict = None):
    cache_key = (json.dumps(aoi_config, sort_keys=True), json.dumps(custom_weights, sort_keys=True) if custom_weights else None)
    is_first = False
    with _lock:
        if cache_key in _cache_build:
            cached = _cache_build[cache_key]
        else:
            cached = concurrent.futures.Future()
            _cache_build[cache_key] = cached
            is_first = True

    if not is_first:
        return cached.result()

    try:
        from gee.aoi_utils import get_aoi_geometry
        from gee.classify_utils import get_jenks_breaks
        aoi = get_aoi_geometry(aoi_config)
        dynamic_scale = get_dynamic_scale(aoi)

        weights = _normalize_weights(custom_weights)
        
        start_year = int(aoi_config.get("start_year", 1980))
        end_year = int(aoi_config.get("end_year", 2024))
        
        # Build raw continuous images
        try:
            bounds_coords = aoi.bounds(maxError=1000).coordinates().get(0).getInfo()
            lats = [pt[1] for pt in bounds_coords]
            use_era5_precip = max(lats) > 50 or min(lats) < -50
        except:
            use_era5_precip = True

        if use_era5_precip:
            era = ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR").select("total_precipitation_sum")
            rain = era.filterDate(f"{start_year}-01-01", f"{end_year}-12-31") \
                         .sum().multiply(1000) \
                         .divide(max(end_year - start_year + 1, 1)) \
                         .clip(aoi).rename("bio12")
        else:
            chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
            rain = chirps.filterDate(f"{start_year}-01-01", f"{end_year}-12-31") \
                         .select("precipitation") \
                         .sum() \
                         .divide(max(end_year - start_year + 1, 1)) \
                         .clip(aoi).rename("bio12")
        
        dem = ee.Image("USGS/SRTMGL1_003").select("elevation").unmask(ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").mosaic(), False).unmask(0).clip(aoi)
        slope = ee.Terrain.slope(dem).rename("slope")
        
        # Use MERIT UPA for global coverage (HydroSHEDS stops at 60N, breaking Russia)
        merit_upa = ee.Image("MERIT/Hydro/v1_0_1").select('upa')
        # UPA is in km2. We use it directly as flow accumulation for TWI (relative metric)
        flow_acc = merit_upa.unmask(1).clip(aoi)
        slope_rad = slope.multiply(math.pi / 180.0)
        tan_slope = slope_rad.tan().max(0.001)
        twi = flow_acc.add(1).divide(tan_slope).log().rename("twi")
        
        # Extract dense stream network (upstream area > 10 km2 for significant streams)
        streams = merit_upa.gt(10).unmask(0)
        
        # True Drainage Density via Kernel Density Estimation
        # Dynamic radius: must be at least 2 pixels wide to prevent convolution collapse at large scales
        drainage_radius = min(max(3000, (dynamic_scale * 2) if dynamic_scale else 3000), 10000)
        kernel = ee.Kernel.circle(radius=drainage_radius, units='meters')
        drainage_density = streams.convolve(kernel).clip(aoi).rename("drainage")

        # Use fastDistanceTransform on raster streams instead of FeatureCollection.distance to prevent GEE timeouts on massive AOIs
        # fastDistanceTransform computes distance to 0, so we use streams.Not() (where rivers are 1 -> 0, background 0 -> 1)
        # Max 256 pixels distance. Multiplied by pixel resolution to get meters.
        dist_water = streams.Not().fastDistanceTransform(256).multiply(ee.Image.pixelArea().sqrt()).clip(aoi).rename("dist_water")
        
        clay = ee.Image("OpenLandMap/SOL/SOL_CLAY-WFRACTION_USDA-3A1A1A_M/v02").select("b0").clip(aoi)
        sand = ee.Image("OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02").select("b0").clip(aoi)
        permeability = sand.subtract(clay).unmask(0).rename("soil_perm")

        # Combine for a single histogram pass and mask to land (rain.mask()) to prevent ocean pixels from skewing Jenks breaks globally
        continuous_bands = ee.Image.cat([rain, slope, twi, drainage_density, dist_water, permeability]).updateMask(rain.mask())
        
        # Fix histogram scale: cap at 5000m so rivers don't completely disappear from sampling
        scale_hist = min(dynamic_scale * 2 if dynamic_scale else 100, 5000)
        with gee_semaphore:
            hist_raw = continuous_bands.reduceRegion(
                reducer=ee.Reducer.autoHistogram(maxBuckets=50),
                geometry=aoi.bounds(maxError=1000),
                scale=scale_hist,
                maxPixels=1e13,
                tileScale=4,
                bestEffort=True
            ).getInfo()

        def apply_jenks(img, name, reverse=False, n=5):
            hist = hist_raw.get(name) or []
            bps = get_jenks_breaks(hist, n)
            while len(bps) < n - 1:
                bps.append(bps[-1] + 0.001 if bps else 1.0)
            bps = bps[:n-1]
            
            values = [5, 4, 3, 2, 1] if reverse else [1, 2, 3, 4, 5]
            result = ee.Image(values[-1])
            for i in range(len(bps) - 1, -1, -1):
                result = result.where(img.lt(bps[i]), values[min(i, 4)])
            return result.updateMask(img.mask()).toFloat()

        rain_score = apply_jenks(rain, 'bio12')
        slope_score = apply_jenks(slope, 'slope', reverse=True).updateMask(rain.mask())
        twi_score = apply_jenks(twi, 'twi').updateMask(rain.mask())
        drainage_score = apply_jenks(drainage_density, 'drainage').updateMask(rain.mask())
        dist_water_score = apply_jenks(dist_water, 'dist_water', reverse=True).updateMask(rain.mask())
        soil_score = apply_jenks(permeability, 'soil_perm').updateMask(rain.mask())

        # Use a constant fallback for lithology since the private asset 'litodoloy' causes 403 errors globally
        lith_score = ee.Image(3).toFloat().updateMask(rain.mask()).clip(aoi)
        
        lulc = ee.ImageCollection("ESA/WorldCover/v200").first().select('Map').unmask(0).clip(aoi)
        lulc_score = ee.Image(1) \
            .where(lulc.eq(10), 5).where(lulc.eq(90), 5).where(lulc.eq(95), 5) \
            .where(lulc.eq(20), 4).where(lulc.eq(30), 4).where(lulc.eq(40), 3) \
            .toFloat().updateMask(rain.mask()).clip(aoi)

        score_images = {
            "rainfall": rain_score, "lithology": lith_score, "slope": slope_score,
            "twi": twi_score, "drainage": drainage_score, "dist_water": dist_water_score,
            "soil": soil_score, "lulc": lulc_score,
        }

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

        res = (aoi, dynamic_scale, weights, score_images, suitability_100)
        try:
            cached.set_result(res)
        except concurrent.futures.InvalidStateError:
            pass
        return res
    except Exception as e:
        with _lock:
            _cache_build.pop(cache_key, None)
        try:
            cached.set_exception(e)
        except concurrent.futures.InvalidStateError:
            pass
        raise e

def compute_wellscope_map(aoi_config: dict, custom_weights: dict = None) -> dict:
    cache_key = ("wellscope_map", json.dumps(aoi_config, sort_keys=True), json.dumps(custom_weights, sort_keys=True) if custom_weights else None)
    with _lock:
        if cache_key in _cache_map:
            return _cache_map[cache_key]

    aoi, dynamic_scale, weights, score_images, suitability_100 = _build_wellscope_base(aoi_config, custom_weights)
    ahp_data = compute_ahp_data({k: v * 100 for k, v in weights.items()})

    from gee.aoi_utils import get_bounds_and_center


    bounds, center = get_bounds_and_center(aoi)

    with gee_semaphore:
        map_id = suitability_100.getMapId(_SUITABILITY_VIS)
        try:
            if dynamic_scale and dynamic_scale > 10000:
                print(f"[WellScope] ThumbURL skipped for massive scale: {dynamic_scale}"); thumb_url = None
            else:
                t_thumb = time.time(); print("[WellScope] Getting ThumbURL..."); thumb_url = suitability_100.getThumbURL({**_SUITABILITY_VIS, "region": aoi.bounds(), "dimensions": 512, "crs": "EPSG:4326", "format": "png"})
        except ee.EEException:
            print(f"[WellScope] ThumbURL failed: {time.time()-t_thumb:.2f}s"); thumb_url = None

    factor_maps = {}
    for key, img in score_images.items():
        with gee_semaphore:
            try:
                factor_maps[key] = {
                    "label": FACTOR_META[key]["label"],
                    "weight_pct": FACTOR_META[key]["weight_pct"],
                    "tile_url": img.getMapId(_SCORE_VIS)["tile_fetcher"].url_format,
                    "thumb_url": img.getThumbURL({**_SCORE_VIS, "region": aoi.bounds(), "dimensions": 512, "crs": "EPSG:4326", "format": "png"}) if (not dynamic_scale or dynamic_scale <= 10000) else None
                }
            except ee.EEException:
                pass

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

def compute_wellscope_stats(aoi_config: dict, custom_weights: dict = None) -> dict:
    cache_key = ("wellscope_stats", json.dumps(aoi_config, sort_keys=True), json.dumps(custom_weights, sort_keys=True) if custom_weights else None)
    with _lock:
        if cache_key in _cache_stats:
            return _cache_stats[cache_key]

    aoi, dynamic_scale, _, _, suitability_100 = _build_wellscope_base(aoi_config, custom_weights)

    with gee_semaphore:
        stats = suitability_100.reduceRegion(
            reducer=ee.Reducer.mean().combine(ee.Reducer.min(), sharedInputs=True).combine(ee.Reducer.max(), sharedInputs=True),
            geometry=aoi.bounds(maxError=1000),
            scale=dynamic_scale,
            maxPixels=1e13,
            tileScale=4,
            bestEffort=True
        ).getInfo()

    result = {
        "Mean Suitability": round(stats.get("GWP_mean") or 0, 1),
        "Min Suitability": round(stats.get("GWP_min") or 0, 1),
        "Max Suitability": round(stats.get("GWP_max") or 0, 1),
    }
    with _lock:
        _cache_stats[cache_key] = result
    return result

def compute_wellscope_classify(aoi_config: dict, custom_weights: dict = None, n_classes: int = 5, method: str = "natural_breaks", custom_labels: list = None) -> dict:
    labels_tuple = tuple(custom_labels) if custom_labels else None
    cache_key = ("wellscope_classify", json.dumps(aoi_config, sort_keys=True), json.dumps(custom_weights, sort_keys=True) if custom_weights else None, n_classes, method, labels_tuple)
    with _lock:
        if cache_key in _cache_classify:
            return _cache_classify[cache_key]

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
        _cache_classify[cache_key] = result
    return result

def compute_wellscope_export(aoi_config: dict, custom_weights: dict = None) -> dict:
    cache_key = ("wellscope_export", json.dumps(aoi_config, sort_keys=True), json.dumps(custom_weights, sort_keys=True) if custom_weights else None)
    with _lock:
        if cache_key in _cache_export:
            return _cache_export[cache_key]

    aoi, _, _, _, suitability_100 = _build_wellscope_base(aoi_config, custom_weights)

    with gee_semaphore:
        try:
            dl_url = suitability_100.getDownloadURL({"scale": 100, "region": aoi.bounds(), "format": "GEO_TIFF", "crs": "EPSG:4326"})
        except Exception:
            dl_url = None

    result = {
        "download_url": dl_url
    }
    with _lock:
        _cache_export[cache_key] = result
    return result

def export_factor_map(aoi_config: dict, factor_key: str, palette: list = None) -> dict:
    aoi, _, _, score_images, _ = _build_wellscope_base(aoi_config)
    
    if factor_key not in score_images:
        raise ValueError(f"Invalid factor key: {factor_key}")
        
    image = score_images[factor_key]
    vis = {"min": 1, "max": 5, "palette": palette} if palette else _SCORE_VIS
        
    with gee_semaphore:
        try:
            thumb_url = image.getThumbURL({**vis, "region": aoi.bounds(), "dimensions": 1024, "crs": "EPSG:4326", "format": "png"})
        except Exception:
            print(f"[WellScope] ThumbURL failed: {time.time()-t_thumb:.2f}s"); thumb_url = None
            
        try:
            download_url = image.getDownloadURL({"scale": 30, "crs": "EPSG:4326", "region": aoi, "format": "GEO_TIFF"})
        except Exception:
            download_url = None
            
    return {
        "thumb_url": thumb_url,
        "download_url": download_url
    }
