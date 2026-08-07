import json
"""Flood Susceptibility Index (SMCE / Weighted Overlay) — FastAPI backend."""
import math
import ee
from cachetools import TTLCache
from threading import Lock
import concurrent.futures
from gee.classify_utils import quantile_classify

_cache: TTLCache = TTLCache(maxsize=128, ttl=86400)
_lock = Lock()

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


def _distance_km(mask, aoi, scale=250):
    # Instead of fastDistanceTransform which is scale-dependent and slow,
    # we convert mask to vectors or just use distance on mask directly.
    # Actually mask is an image. distance() on an image computes distance to non-zero pixels.
    distance_m = mask.distance(searchRadius=20000, maxError=100).clip(aoi)
    return distance_m.divide(1000).reproject(crs="EPSG:4326", scale=scale)


def _apply_reverse(score_img, flag):
    return ee.Image(6).subtract(score_img) if flag else score_img


def _factor_urls(image, key: str, aoi) -> dict:
    return {
        "tile_url": image.getMapId(_SCORE_VIS)["tile_fetcher"].url_format,
        "thumb_url": image.getThumbURL({**_SCORE_VIS, "region": aoi.bounds(), "dimensions": 512, "format": "png"}),
    }

def compute_flood_susceptibility(
    aoi_config: dict,
    start_year: int = 2019,
    end_year: int = 2024,
    n_classes: int = 5,
    weights: dict = None,
    reverse_flags: dict = None,
) -> dict:
    weights = weights or DEFAULT_WEIGHTS
    reverse_flags = reverse_flags or {f: False for f in FACTOR_ORDER}

    cache_key = (json.dumps(aoi_config, sort_keys=True), start_year, end_year, n_classes,
        frozenset(weights.items()), frozenset(reverse_flags.items())
    )
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)

    # 1. Elevation & Slope
    dem = ee.Image("USGS/SRTMGL1_003").select("elevation").clip(aoi)
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

    # 3. Rainfall
    n_years = max(1, end_year - start_year + 1)
    rainfall = (
        ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
        .filterDate(f"{start_year}-01-01", f"{end_year + 1}-01-01")
        .filterBounds(aoi).select("precipitation")
        .sum().divide(n_years).clip(aoi)
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
    # Built-up (50), Water (80), Wetland (90) = high flood risk (5)
    # Bare (60), Agriculture (40) = moderate/high
    # Forest (10) = low (1)
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
    river_dist_km = _distance_km(water_mask, aoi)
    # Closer to river = higher flood risk (5)
    river_dist_score = (
        ee.Image(1)
        .where(river_dist_km.lt(0.2), 5)
        .where(river_dist_km.gte(0.2).And(river_dist_km.lt(0.5)), 4)
        .where(river_dist_km.gte(0.5).And(river_dist_km.lt(1.0)), 3)
        .where(river_dist_km.gte(1.0).And(river_dist_km.lt(2.0)), 2)
        .where(river_dist_km.gte(2.0), 1)
        .clip(aoi)
    )

    roads = ee.FeatureCollection("projects/sat-io/open-datasets/GRIP4/Africa").filterBounds(aoi)
    road_dist_km = roads.distance(searchRadius=20000, maxError=100).divide(1000).clip(aoi)
    # Closer to roads (impervious) = higher flood risk (5)
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
    soiltype = ee.Image("ISDASOIL/Africa/v1/texture_class").select("texture_0_20").clip(aoi)
    # Clay/Loam (poor drainage) = high (5), Sand (good drainage) = low (1)
    # Simplification: we map soiltype texture class values to flood risk
    soil_type_score = (
        ee.Image(3) # Default moderate
        .where(soiltype.eq(1), 1) # Sand
        .where(soiltype.eq(2).Or(soiltype.eq(3)), 2) # Loamy sand, sandy loam
        .where(soiltype.eq(4).Or(soiltype.eq(5)), 3) # Silt loam, silt
        .where(soiltype.eq(6).Or(soiltype.eq(7)), 4) # Loam, sandy clay loam
        .where(soiltype.gte(8), 5) # Clay loam, silty clay loam, clay
        .clip(aoi)
    )

    # 7. Drainage Density
    # Approximate using neighborhood sum of river mask
    drainage_density = water_mask.reduceNeighborhood(
        reducer=ee.Reducer.sum(),
        kernel=ee.Kernel.circle(radius=1000, units='meters')
    ).clip(aoi)
    # Higher density = higher flood risk (5)
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
    s2 = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterDate(f"{start_year}-01-01", f"{end_year}-12-31")
        .filterBounds(aoi)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .median()
        .clip(aoi)
    )
    ndvi = s2.normalizedDifference(["B8", "B4"]).rename("NDVI")
    # Lower NDVI (less vegetation, more runoff) = higher flood risk (5)
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

    score_images = {}
    for key, img in raw_scores.items():
        score_images[key] = _apply_reverse(img, reverse_flags.get(key, False)).rename(f"{key}_score")

    # Weighted Overlay
    suitability = ee.Image(0).rename("suitability")
    for key in FACTOR_ORDER:
        w = weights.get(key, DEFAULT_WEIGHTS[key])
        suitability = suitability.add(score_images[key].multiply(w))
    
    suitability = suitability.rename("suitability")

    map_id = suitability.getMapId(_SCORE_VIS)
    final_thumb_url = suitability.getThumbURL({**_SCORE_VIS, "region": aoi.bounds(), "dimensions": 512, "format": "png"})

    classes = {
        "Very Low (1-2)": suitability.lt(2),
        "Low (2-3)": suitability.gte(2).And(suitability.lt(3)),
        "Moderate (3-4)": suitability.gte(3).And(suitability.lt(4)),
        "High (4-4.5)": suitability.gte(4).And(suitability.lt(4.5)),
        "Very High (>4.5)": suitability.gte(4.5),
    }
    labels = list(classes.keys())
    area_img = ee.Image.cat([
        classes[lbl].multiply(ee.Image.pixelArea()).rename(f"c{i}")
        for i, lbl in enumerate(labels)
    ])

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        f_area = executor.submit(
            lambda: area_img.reduceRegion(
                reducer=ee.Reducer.sum(), geometry=aoi, scale=250, maxPixels=10000, bestEffort=True, tileScale=4
            ).getInfo()
        )

        layers_to_classify = [{"name": "suitability", "image": suitability, "title": "Flood Susceptibility Index"}]

        f_classify = executor.submit(
            lambda: quantile_classify(layers=layers_to_classify, aoi=aoi, scale=250, n_classes=n_classes)
        )

        f_bounds = executor.submit(lambda: aoi.bounds().getInfo()["coordinates"][0])

        area_dict = f_area.result()
        classify = f_classify.result()
        bounds = f_bounds.result()

    class_areas_km2 = {lbl: (area_dict.get(f"c{i}") or 0) / 1e6 for i, lbl in enumerate(labels)}

    class_score_map = {
        "Very Low (1-2)": 1.5,
        "Low (2-3)": 2.5,
        "Moderate (3-4)": 3.5,
        "High (4-4.5)": 4.25,
        "Very High (>4.5)": 4.75,
    }

    stats = {
        "mean_suitability": sum([v * class_score_map[k] for k, v in class_areas_km2.items()]) / sum(class_areas_km2.values()) if sum(class_areas_km2.values()) > 0 else 0,
        "max_risk_area_km2": class_areas_km2.get("Very High (>4.5)", 0),
    }

    factor_maps = {}
    for key in FACTOR_ORDER:
        urls = _factor_urls(score_images[key], key, aoi)
        class_urls = next((p for p in classify["panels"] if p["name"] == f"{key}_score"), None)
        factor_maps[key] = {
            "label": FACTOR_META[key]["label"],
            "tile_url": urls["tile_url"],
            "thumb_url": urls["thumb_url"],
            "download_url": urls["thumb_url"],
            "class_tile_url": class_urls["tile_url"] if class_urls else None,
            "class_thumb_url": class_urls["thumb_url"] if class_urls else None,
            "reversed": reverse_flags.get(key, False),
        }

    x_coords = [p[0] for p in bounds]
    y_coords = [p[1] for p in bounds]
    center = [sum(y_coords)/len(y_coords), sum(x_coords)/len(x_coords)]

    ahp_data = compute_ahp_data(weights)

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": final_thumb_url,
        "stats": stats,
        "class_areas_km2": class_areas_km2,
        "factor_maps": factor_maps,
        "reverse_flags": reverse_flags,
        "ahp": ahp_data,
        "classify": classify,
        "center": center,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
        "bbox": bounds,
        "start_year": start_year,
        "end_year": end_year,
    }

    with _lock:
        _cache[cache_key] = result

    return result
