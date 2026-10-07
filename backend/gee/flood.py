from gee.aoi_utils import get_bounds_and_center
import json
import math
import ee
import concurrent.futures
from gee.persistent_cache import PersistentCache
from threading import Lock
from gee.classify_utils import quantile_classify
from gee.aoi_utils import get_aoi_geometry, get_historical_ndvi

_cache = PersistentCache(ttl=86400)
_lock = Lock()

from gee.aoi_utils import get_dynamic_scale

FLOOD_CLASS_NAMES = ["Very Low", "Low", "Moderate", "High", "Very High"]

DEFAULT_WEIGHTS = {
    "rainfall": 0.15,
    "twi": 0.12,
    "lulc": 0.12,
    "elevation": 0.10,
    "slope": 0.10,
    "river_dist": 0.09,
    "road_dist": 0.09,
    "soil_type": 0.08,
    "drainage_density": 0.08,
    "ndvi": 0.07,
}

FACTOR_ORDER = [
    "rainfall", "twi", "lulc", "elevation", "slope", 
    "river_dist", "road_dist", "soil_type", "drainage_density", "ndvi"
]

FACTOR_META = {
    "rainfall":         {"label": "Rainfall",             "weight_pct": 15},
    "twi":              {"label": "Topographic Wetness",  "weight_pct": 12},
    "lulc":             {"label": "Land Use/Land Cover",  "weight_pct": 12},
    "elevation":        {"label": "Elevation",            "weight_pct": 10},
    "slope":            {"label": "Slope",                "weight_pct": 10},
    "river_dist":       {"label": "Distance from Rivers", "weight_pct": 9},
    "road_dist":        {"label": "Distance from Roads",  "weight_pct": 9},
    "soil_type":        {"label": "Soil Type",            "weight_pct": 8},
    "drainage_density": {"label": "Drainage Density",     "weight_pct": 8},
    "ndvi":             {"label": "NDVI",                 "weight_pct": 7},
}

_SCORE_VIS = {"min": 1, "max": 5, "palette": ["#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027"]}

# AHP Random Index table
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
    if scale is None:
        scale = get_dynamic_scale(aoi)
    safe_scale = max(scale, 100)
    return (mask.fastDistanceTransform(256)
            .multiply(safe_scale)
            .divide(1000)
            .reproject(crs="EPSG:4326", scale=safe_scale)
            .clip(aoi))


def _apply_reverse(img: ee.Image, reverse: bool) -> ee.Image:
    if not reverse:
        return img
    # If 1->5, 2->4, 3->3, 4->2, 5->1
    return ee.Image(6).subtract(img)


def _build_flood_image(aoi_config: dict, start_year: int, end_year: int, weights: dict, reverse_flags: dict):
    aoi = get_aoi_geometry(aoi_config)
    
    is_global = False
    try:
        geom_str = str(aoi.serialize())
        if "-180" in geom_str and "180" in geom_str and "90" in geom_str and "-90" in geom_str:
            is_global = True
    except:
        pass
    
    district = aoi_config.get("district", "")
    is_rwanda = district != "" or "rwanda" in aoi_config.get("name", "").lower()
    
    # 1. Elevation & Slope
    dem = ee.Image("USGS/SRTMGL1_003").select("elevation").unmask(ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").mosaic(), False).clip(aoi)
    slope_deg = ee.Terrain.slope(dem)
    
    # Elevation: lower elevation = higher flood risk (5)
    elevation_score = (
        ee.Image(1)
        .where(dem.lt(1400), 5)
        .where(dem.gte(1400).And(dem.lt(1600)), 4)
        .where(dem.gte(1600).And(dem.lt(1800)), 3)
        .where(dem.gte(1800).And(dem.lt(2200)), 2)
        .where(dem.gte(2200), 1)
        .clip(aoi)
    )
    
    # Slope: lower slope = higher flood risk (5)
    slope_score = (
        ee.Image(1)
        .where(slope_deg.lt(5), 5)
        .where(slope_deg.gte(5).And(slope_deg.lt(10)), 4)
        .where(slope_deg.gte(10).And(slope_deg.lt(15)), 3)
        .where(slope_deg.gte(15).And(slope_deg.lt(25)), 2)
        .where(slope_deg.gte(25), 1)
        .clip(aoi)
    )

    # 2. TWI
    flow_acc = ee.Image("WWF/HydroSHEDS/15ACC").clip(aoi)
    slope_rad = slope_deg.multiply(math.pi / 180)
    twi = flow_acc.add(1).log().subtract(slope_rad.tan().add(0.001).log()).rename("TWI")
    # TWI: higher TWI = higher flood risk (5)
    twi_score = (
        ee.Image(1)
        .where(twi.lt(4), 1)
        .where(twi.gte(4).And(twi.lt(6)), 2)
        .where(twi.gte(6).And(twi.lt(8)), 3)
        .where(twi.gte(8).And(twi.lt(10)), 4)
        .where(twi.gte(10), 5)
        .clip(aoi)
    )

    try:
        bounds_coords = aoi.bounds(maxError=1000).coordinates().get(0).getInfo()
        lats = [pt[1] for pt in bounds_coords]
        use_era5_precip = max(lats) > 50 or min(lats) < -50
    except:
        use_era5_precip = True

    # 3. Rainfall
    n_years = max(1, end_year - start_year + 1)
    if use_era5_precip:
        rainfall = (
            ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR")
            .select("total_precipitation_sum")
            .filterDate(f"{start_year}-01-01", f"{end_year + 1}-01-01")
            .filterBounds(aoi)
            .sum().multiply(1000)
            .divide(n_years)
            .reproject(crs="EPSG:4326", scale=5000)
            .clip(aoi)
        )
    else:
        rainfall = (
            ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
            .filterDate(f"{start_year}-01-01", f"{end_year + 1}-01-01")
            .filterBounds(aoi).select("precipitation")
            .sum()
            .divide(n_years)
            .reproject(crs="EPSG:4326", scale=5000)
            .clip(aoi)
        )
    # Rainfall: higher rainfall = higher flood risk (5)
    rainfall_score = (
        ee.Image(1)
        .where(rainfall.lt(900), 1)
        .where(rainfall.gte(900).And(rainfall.lt(1100)), 2)
        .where(rainfall.gte(1100).And(rainfall.lt(1300)), 3)
        .where(rainfall.gte(1300).And(rainfall.lt(1500)), 4)
        .where(rainfall.gte(1500), 5)
        .clip(aoi)
    )

    # 4. Land Cover
    lc = ee.Image("ESA/WorldCover/v200/2021").select("Map").clip(aoi)
    lulc_score = (
        ee.Image(1)
        .where(lc.eq(10), 1)
        .where(lc.eq(20).Or(lc.eq(30)), 2)
        .where(lc.eq(40).Or(lc.eq(70)), 3)
        .where(lc.eq(60), 4)
        .where(lc.eq(50).Or(lc.eq(80)).Or(lc.eq(90)).Or(lc.eq(95)), 5)
        .clip(aoi)
    )

    # 5. Distances
    gsw = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence")
    water_mask = gsw.gte(50).unmask(0).Or(lc.eq(80)).Or(lc.eq(90))
    
    if not is_global:
        river_dist_km = _distance_km(water_mask, aoi)
    else:
        # Fallback to extremely coarse simplified distance for global to avoid memory limit
        river_dist_km = water_mask.fastDistanceTransform(256).multiply(5000).divide(1000).clip(aoi)
        
    river_dist_score = (
        ee.Image(1)
        .where(river_dist_km.lt(0.2), 5)
        .where(river_dist_km.gte(0.2).And(river_dist_km.lt(0.5)), 4)
        .where(river_dist_km.gte(0.5).And(river_dist_km.lt(1.0)), 3)
        .where(river_dist_km.gte(1.0).And(river_dist_km.lt(2.0)), 2)
        .where(river_dist_km.gte(2.0), 1)
        .clip(aoi)
    )

    if is_rwanda:
        roads = ee.FeatureCollection("projects/sat-io/open-datasets/GRIP4/Africa").filterBounds(aoi)
        soiltype = ee.Image("ISDASOIL/Africa/v1/texture_class").select("texture_0_20").clip(aoi)
    else:
        # Use Global equivalents
        roads = ee.FeatureCollection("projects/sat-io/open-datasets/GRIP4/GlobalRoads").filterBounds(aoi)
        soiltype = ee.Image("OpenLandMap/SOL/SOL_TEXTURE-CLASS_USDA-315_M/v02").select("b0").clip(aoi)

    if not is_global:
        road_mask = ee.Image(0).paint(roads, 1).eq(1)
        road_dist_km = _distance_km(road_mask, aoi)
    else:
        road_mask = ee.Image(0).paint(roads, 1).eq(1)
        road_dist_km = road_mask.fastDistanceTransform(256).multiply(5000).divide(1000).clip(aoi)

    road_dist_score = (
        ee.Image(1)
        .where(road_dist_km.lt(0.1), 5)
        .where(road_dist_km.gte(0.1).And(road_dist_km.lt(0.3)), 4)
        .where(road_dist_km.gte(0.3).And(road_dist_km.lt(0.6)), 3)
        .where(road_dist_km.gte(0.6).And(road_dist_km.lt(1.0)), 2)
        .where(road_dist_km.gte(1.0), 1)
        .clip(aoi)
    )

    # 6. Soil Type
    soil_type_score = (
        ee.Image(3)
        .where(soiltype.eq(1), 1)
        .where(soiltype.eq(2).Or(soiltype.eq(3)), 2)
        .where(soiltype.eq(4).Or(soiltype.eq(5)), 3)
        .where(soiltype.eq(6).Or(soiltype.eq(7)), 4)
        .where(soiltype.gte(8), 5)
        .clip(aoi)
    )

    # 7. Drainage Density
    safe_scale = max(get_dynamic_scale(aoi), 100)
    drainage_density = (water_mask
        .reduceNeighborhood(
            reducer=ee.Reducer.sum(),
            kernel=ee.Kernel.circle(radius=1000, units='meters')
        )
        .reproject(crs="EPSG:4326", scale=safe_scale)
        .clip(aoi))
    drainage_density_score = (
        ee.Image(1)
        .where(drainage_density.gte(2000), 5)
        .where(drainage_density.gte(1000).And(drainage_density.lt(2000)), 4)
        .where(drainage_density.gte(500).And(drainage_density.lt(1000)), 3)
        .where(drainage_density.gte(100).And(drainage_density.lt(500)), 2)
        .where(drainage_density.lt(100), 1)
        .clip(aoi)
    )

    # 8. NDVI
    year = int(start_year)
    ndvi = (get_historical_ndvi(aoi, year, f"{start_year}-01-01", f"{end_year}-12-31", 20)
            .reproject(crs="EPSG:4326", scale=safe_scale)
            .clip(aoi))
    ndvi_score = (
        ee.Image(1)
        .where(ndvi.lt(0.2), 5)
        .where(ndvi.gte(0.2).And(ndvi.lt(0.4)), 4)
        .where(ndvi.gte(0.4).And(ndvi.lt(0.6)), 3)
        .where(ndvi.gte(0.6).And(ndvi.lt(0.8)), 2)
        .where(ndvi.gte(0.8), 1)
        .clip(aoi)
    )

    raw_scores = {
        "rainfall": rainfall_score,
        "twi": twi_score,
        "lulc": lulc_score,
        "elevation": elevation_score,
        "slope": slope_score,
        "river_dist": river_dist_score,
        "road_dist": road_dist_score,
        "soil_type": soil_type_score,
        "drainage_density": drainage_density_score,
        "ndvi": ndvi_score,
    }

    raw_images = {
        "rainfall": rainfall,
        "twi": twi,
        "lulc": lc,
        "elevation": dem,
        "slope": slope_deg,
        "river_dist": river_dist_km,
        "road_dist": road_dist_km,
        "soil_type": soiltype,
        "drainage_density": drainage_density,
        "ndvi": ndvi,
    }

    score_images = {}
    for key, img in raw_scores.items():
        score_images[key] = _apply_reverse(img, reverse_flags.get(key, False)).rename(f"{key}_score")

    # Weighted Overlay
    suitability = ee.Image(0).rename("suitability")
    for key in FACTOR_ORDER:
        w = weights.get(key, DEFAULT_WEIGHTS[key])
        suitability = suitability.add(score_images[key].multiply(w))
    
    suitability = suitability.rename("suitability")
    
    return suitability, score_images, raw_images, aoi, is_global


def compute_flood_map(aoi_config: dict, start_year: int, end_year: int, weights: dict, reverse_flags: dict) -> dict:
    cache_key = ("flood_map", json.dumps(aoi_config, sort_keys=True), start_year, end_year, json.dumps(weights, sort_keys=True), json.dumps(reverse_flags, sort_keys=True))
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    suitability, score_images, raw_images, aoi, is_global = _build_flood_image(aoi_config, start_year, end_year, weights, reverse_flags)
    
    from threading import BoundedSemaphore
    gee_semaphore = BoundedSemaphore(5)

    with gee_semaphore:
        try:
            map_id = suitability.getMapId(_SCORE_VIS)
        except ee.EEException as e:
            if "Memory limit" in str(e) or "User memory limit" in str(e):
                raise ValueError("The selected region is too large or complex for real-time visualization. Please select a smaller area.") from e
            raise
    bounds, _ = get_bounds_and_center(aoi)
    
    x_coords = [p[0] for p in bounds]
    y_coords = [p[1] for p in bounds]
    center = [sum(y_coords)/len(y_coords), sum(x_coords)/len(x_coords)]

    # We also return factor map urls here for fast access in the frontend
    factor_maps = {}
    for key in FACTOR_ORDER:
        with gee_semaphore:
            try:
                calc_geom = ee.Geometry.Rectangle([-180, -89, 180, 89], "EPSG:4326", False) if is_global else aoi.bounds()
                img_id = score_images[key].getMapId(_SCORE_VIS)
                factor_maps[key] = {
                    "label": FACTOR_META[key]["label"],
                    "tile_url": img_id["tile_fetcher"].url_format,
                    "thumb_url": score_images[key].getThumbURL({**_SCORE_VIS, "region": calc_geom, "dimensions": 512, "crs": "EPSG:4326", "format": "png"}),
                    "reversed": reverse_flags.get(key, False),
                }
            except ee.EEException:
                pass

    ahp_data = compute_ahp_data(weights)

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": suitability.getThumbURL({**_SCORE_VIS, "region": calc_geom, "dimensions": 512, "crs": "EPSG:4326", "format": "png"}),
        "center": center,
        "bbox": bounds,
        "ahp": ahp_data,
        "factor_maps": factor_maps,
    }
    
    with _lock:
        _cache[cache_key] = result
    return result


def compute_flood_stats(aoi_config: dict, start_year: int, end_year: int, weights: dict, reverse_flags: dict) -> dict:
    cache_key = ("flood_stats", json.dumps(aoi_config, sort_keys=True), start_year, end_year, json.dumps(weights, sort_keys=True), json.dumps(reverse_flags, sort_keys=True))
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    suitability, _, _, aoi, is_global = _build_flood_image(aoi_config, start_year, end_year, weights, reverse_flags)

    # Simplified standard classification for baseline stats
    classes = {
        FLOOD_CLASS_NAMES[0]: suitability.lt(2),
        FLOOD_CLASS_NAMES[1]: suitability.gte(2).And(suitability.lt(3)),
        FLOOD_CLASS_NAMES[2]: suitability.gte(3).And(suitability.lt(4)),
        FLOOD_CLASS_NAMES[3]: suitability.gte(4).And(suitability.lt(4.5)),
        FLOOD_CLASS_NAMES[4]: suitability.gte(4.5),
    }
    labels = list(classes.keys())
    area_img = ee.Image.cat([
        classes[lbl].multiply(ee.Image.pixelArea()).rename(f"c{i}")
        for i, lbl in enumerate(labels)
    ])

    calc_geom = ee.Geometry.Rectangle([-180, -89, 180, 89], "EPSG:4326", False) if is_global else aoi.bounds(maxError=1000)
    area_dict = area_img.reduceRegion(
        reducer=ee.Reducer.sum(), geometry=calc_geom, scale=get_dynamic_scale(aoi), maxPixels=1e10
    ).getInfo()

    class_areas_km2 = {lbl: (area_dict.get(f"c{i}") or 0) / 1e6 for i, lbl in enumerate(labels)}

    class_score_map = {
        FLOOD_CLASS_NAMES[0]: 1.5,
        FLOOD_CLASS_NAMES[1]: 2.5,
        FLOOD_CLASS_NAMES[2]: 3.5,
        FLOOD_CLASS_NAMES[3]: 4.25,
        FLOOD_CLASS_NAMES[4]: 4.75,
    }

    stats = {
        "mean_suitability": sum([v * class_score_map[k] for k, v in class_areas_km2.items()]) / sum(class_areas_km2.values()) if sum(class_areas_km2.values()) > 0 else 0,
        "max_risk_area_km2": class_areas_km2.get("VERY HIGH", 0),
    }

    result = {
        "stats": stats,
        "class_areas_km2": class_areas_km2,
    }
    
    with _lock:
        _cache[cache_key] = result
    return result


def compute_flood_classify(aoi_config: dict, start_year: int, end_year: int, weights: dict, reverse_flags: dict, n_classes: int, custom_labels: list, method: str) -> dict:
    cache_key = ("flood_classify", json.dumps(aoi_config, sort_keys=True), start_year, end_year, json.dumps(weights, sort_keys=True), json.dumps(reverse_flags, sort_keys=True), n_classes, json.dumps(custom_labels), method)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    suitability, score_images, raw_images, aoi, is_global = _build_flood_image(aoi_config, start_year, end_year, weights, reverse_flags)

    layers_to_classify = [{"name": "suitability", "image": suitability, "title": "Flood Susceptibility Index"}]
    for key in FACTOR_ORDER:
        # LULC and Soil Type are categorical, we keep them as score images so they can be parsed as risk,
        # otherwise use the raw continuous data.
        if key in ["lulc", "soil_type"]:
            layers_to_classify.append({"name": f"{key}_score", "image": score_images[key], "title": FACTOR_META[key]["label"] + " Risk Class"})
        else:
            layers_to_classify.append({"name": f"{key}_score", "image": raw_images[key], "title": FACTOR_META[key]["label"]})

    classify = quantile_classify(
        layers=layers_to_classify, 
        aoi=aoi, 
        scale=get_dynamic_scale(aoi), 
        n_classes=n_classes, 
        custom_labels=custom_labels or FLOOD_CLASS_NAMES, 
        method=method
    )

    result = {
        "classify": classify,
    }
    
    with _lock:
        _cache[cache_key] = result
    return result


def compute_flood_export(aoi_config: dict, start_year: int, end_year: int, weights: dict, reverse_flags: dict) -> dict:
    aoi = get_aoi_geometry(aoi_config)
    suitability, _, _ = _build_flood_image(aoi, start_year, end_year, weights, reverse_flags)
    
    from threading import BoundedSemaphore
    gee_semaphore = BoundedSemaphore(5)
    with gee_semaphore:
        is_global = False
        try:
            geom_str = str(aoi.serialize())
            if "-180" in geom_str and "180" in geom_str and "90" in geom_str and "-90" in geom_str:
                is_global = True
        except: pass
        calc_geom = ee.Geometry.Rectangle([-180, -89, 180, 89], "EPSG:4326", False) if is_global else aoi.bounds(maxError=1000)
        download_url = suitability.getDownloadURL({"scale": get_dynamic_scale(aoi), "region": calc_geom, "format": "GEO_TIFF"})
    return {"download_url": download_url}
