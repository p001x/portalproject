import json
import logging
import requests
import ee
from cachetools import TTLCache
from threading import Lock
import time
import concurrent.futures
from gee.classify_utils import quantile_classify

logger = logging.getLogger(__name__)

# Colors matching the Python snippet: Very High -> Very Low accessibility (0 -> 3600 seconds)
ACCESSIBILITY_VIS = {"min": 1, "max": 4, "palette": ["#5C3A21", "#B98D4F", "#E8C285", "#F3E58C"]}
ACCESSIBILITY_CLASS_NAMES = ["Very High (0-15m)", "High (15-30m)", "Low (30-45m)", "Very Low (45-60m)"]

_cache_map: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_stats: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_classify: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_export: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_overpass: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_population: TTLCache = TTLCache(maxsize=64, ttl=3600)
_lock = Lock()

import math
def haversine(lon1, lat1, lon2, lat2):
    R = 6371.0 # km
    dlon = math.radians(lon2 - lon1)
    dlat = math.radians(lat2 - lat1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


import os
import geopandas as gpd

def fetch_local_points(amenities: list[str], bbox: list[float]) -> tuple[list[ee.Feature], list[dict]]:
    """Fetch POIs within a bounding box from local shapefiles."""
    if not amenities:
        return [], []
        
    minx, miny, maxx, maxy = bbox
    cache_key = (f"{miny:.6f},{minx:.6f},{maxy:.6f},{maxx:.6f}", "-".join(sorted(amenities)))
    with _lock:
        if cache_key in _cache_overpass:
            cached_result = _cache_overpass[cache_key]
            if isinstance(cached_result, Exception):
                raise cached_result
            return cached_result
            
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        dataset_dir = os.path.join(base_dir, "dataset vector")
        
        amenity_to_shp = {
            "primary_school": "Schools_primary.shp",
            "secondary_school": "Schools_secondary.shp",
            "superior_school": "Schools_superior.shp",
            "marketplace": "Markets.shp"
        }
        
        features = []
        raw_points = []
        
        for am in amenities:
            if am not in amenity_to_shp:
                continue
                
            shp_path = os.path.join(dataset_dir, amenity_to_shp[am])
            if not os.path.exists(shp_path):
                logger.error(f"Shapefile not found: {shp_path}")
                continue
                
            try:
                # Load all features (files are very small)
                gdf = gpd.read_file(shp_path)
                if gdf.empty:
                    continue
                
                # Reproject to WGS84 before bounding box filtering
                if gdf.crs and gdf.crs.to_epsg() != 4326:
                    try:
                        gdf = gdf.to_crs(epsg=4326)
                    except Exception as e:
                        logger.error(f"Failed to reproject {am} to 4326: {e}")
                        continue
                
                logger.info(f"Loaded {am}. Total features: {len(gdf)}. Bounding box: {minx}, {miny}, {maxx}, {maxy}")
                found_count = 0
                for _, row in gdf.iterrows():
                    geom = row.geometry
                    if geom is None or geom.is_empty:
                        continue
                        
                    if geom.geom_type != 'Point':
                        geom = geom.centroid
                        
                    lon, lat = geom.x, geom.y
                    
                    # Manual spatial filter
                    if not (minx <= lon <= maxx and miny <= lat <= maxy):
                        continue
                        
                    found_count += 1
                    
                    name = "Unnamed"
                    possible_cols = [
                        "NAME", "Name", "name", "Nom", "nom", "NOM", 
                        "SCHOOL_NAM", "Facility_N", "Market_Nam", "Description",
                        "school_nam", "School", "school", "facility"
                    ]
                    import pandas as pd
                    for col in possible_cols:
                        if col in row:
                            val = row[col]
                            if pd.notna(val) and str(val).strip() and str(val).strip().lower() != "nan":
                                name = str(val).strip()
                                break
                            
                    features.append(ee.Feature(ee.Geometry.Point([lon, lat])))
                    raw_points.append({"lon": lon, "lat": lat, "name": name, "type": am})
            except Exception as e:
                logger.error(f"Error reading shapefile {shp_path}: {e}")
                
        if not features:
            logger.warning(f"No local features found for {amenities} in bbox {bbox}.")
            return [], []
            
        _cache_overpass[cache_key] = (features, raw_points)
        return features, raw_points


def _build_accessibility_images(aoi_config: dict, amenities: list[str]):
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    bounds = aoi.bounds().getInfo()["coordinates"][0]
    
    lons = [p[0] for p in bounds]
    lats = [p[1] for p in bounds]
    bbox = [min(lons), min(lats), max(lons), max(lats)]
    
    # 1. Fetch amenities
    points, raw_points = fetch_local_points(amenities, bbox)

    if not points:
        debug_info = ""
        if raw_points and len(raw_points) > 0 and "debug" in raw_points[0]:
            debug_info = "\n\nDEBUG INFO:\n" + raw_points[0]["debug"]
            
        raise ValueError(f"No {' or '.join(amenities)} found in or near this study area. Try selecting a different area or different amenities.{debug_info}")
        
    # Cap to avoid GEE payload limits
    max_points = 1500
    if len(points) > max_points:
        logger.warning(f"Capping points from {len(points)} to {max_points}")
        points = points[:max_points]
        
    sources = ee.FeatureCollection(points)
    
    # 2. Friction surface (cost)
    # Walking speed: 5 km/h -> 1.38 m/s -> 0.724 seconds per meter
    base_cost = ee.Image(0.724).clip(aoi)
    
    # Roads GRIP4 Africa
    roads = ee.FeatureCollection("projects/sat-io/open-datasets/GRIP4/Africa").filterBounds(aoi)
    # Driving speed: 40 km/h -> 11.1 m/s -> 0.09 seconds per meter
    roads_raster = ee.Image(1).paint(roads, 0.09)
    
    # Combine (road speed where roads exist, else walking speed)
    cost = base_cost.where(roads_raster.neq(1), roads_raster).rename("cost")
    
    # 3. Compute cumulative cost (travel time in seconds)
    source_img = ee.Image(0).paint(sources, 0).clip(aoi)
    max_dist_meters = 3600 * (1 / 0.09) # max distance in meters to explore (40km)
    
    travel_time = cost.cumulativeCost(
        source=source_img,
        maxDistance=max_dist_meters
    ).clip(aoi).rename("travel_time")
    
    # Cap at 3600s (60 minutes) and mask invalid (unreachable)
    travel_time = travel_time.where(travel_time.gt(3600), 3600)
    travel_time = travel_time.unmask(3600)
    
    # 4. Classify (1: Very High, 2: High, 3: Low, 4: Very Low)
    # 0-900s (0-15m), 900-1800s (15-30m), 1800-2700s (30-45m), 2700-3600s (45-60m)
    acc_class = (
        ee.Image(0)
        .where(travel_time.lte(900), 1)
        .where(travel_time.gt(900).And(travel_time.lte(1800)), 2)
        .where(travel_time.gt(1800).And(travel_time.lte(2700)), 3)
        .where(travel_time.gt(2700), 4)
        .clip(aoi).rename("accessibility_class")
    )
    
    factors = {
        "cost_surface": cost,
        "travel_time": travel_time,
        "roads": roads,
        "raw_points": raw_points
    }
    
    return aoi, travel_time, acc_class, factors


def _get_nearest_farthest(aoi, raw_points):
    if not raw_points:
        return None, None
    centroid = aoi.centroid(maxError=100).coordinates().getInfo()
    c_lon, c_lat = centroid[0], centroid[1]

    for p in raw_points:
        p["distance_km"] = round(haversine(c_lon, c_lat, p["lon"], p["lat"]), 2)
        
    raw_points_sorted = sorted(raw_points, key=lambda x: x["distance_km"])
    return raw_points_sorted[0], raw_points_sorted[-1]

def _get_closest_road_geojson(roads_fc, pt_lon, pt_lat):
    try:
        pt = ee.Geometry.Point([pt_lon, pt_lat])
        subset = roads_fc.filterBounds(pt.buffer(5000))
        def add_dist(f):
            return f.set('dist', f.geometry().distance(pt, 10))
        sorted_roads = subset.map(add_dist).sort('dist').limit(1)
        info = sorted_roads.getInfo()
        if info and info.get('features') and len(info['features']) > 0:
            return info['features'][0]['geometry']
        return None
    except Exception as e:
        logger.warning(f"Could not find closest road: {e}")
        return None

def fetch_sample_population(bbox: list[float], limit=15) -> list[dict]:
    minx, miny, maxx, maxy = bbox
    cache_key = f"{miny:.6f},{minx:.6f},{maxy:.6f},{maxx:.6f}"
    with _lock:
        if cache_key in _cache_population:
            return _cache_population[cache_key]
            
    query = f"""
    [out:json][timeout:25];
    (
      node["place"~"village|town|hamlet"]({miny},{minx},{maxy},{maxx});
    );
    out body {limit};
    """
    try:
        response = requests.post("https://overpass-api.de/api/interpreter", data={"data": query}, timeout=30)
        res = response.json()
        incidents = []
        for node in res.get("elements", []):
            if "lat" in node and "lon" in node:
                incidents.append({
                    "lat": node["lat"],
                    "lon": node["lon"],
                    "name": node.get("tags", {}).get("name", "Unknown Village")
                })
        with _lock:
            _cache_population[cache_key] = incidents
        return incidents
    except Exception as e:
        logger.error(f"Failed to fetch population from OSM: {e}")
        return []

def fetch_osrm_route(start_lon, start_lat, end_lon, end_lat):
    url = f"http://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}?overview=full&geometries=geojson"
    try:
        response = requests.get(url, timeout=10)
        res = response.json()
        if res.get("code") == "Ok" and res.get("routes"):
            return res["routes"][0]["geometry"]
    except Exception as e:
        logger.warning(f"OSRM request failed: {e}")
    return None

def compute_accessibility_map(aoi_config: dict, amenities: list[str]) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), "-".join(sorted(amenities)))
    with _lock:
        if cache_key in _cache_map:
            return _cache_map[cache_key]

    aoi, travel_time, acc_class, factors = _build_accessibility_images(aoi_config, amenities)

    travel_time_vis = {"min": 0, "max": 3600, "palette": ACCESSIBILITY_VIS["palette"]}
    travel_time_map_id = travel_time.getMapId(travel_time_vis)
    
    acc_class_map_id = acc_class.getMapId(ACCESSIBILITY_VIS)
    
    roads = factors.get("roads")
    roads_map_id = ee.Image().byte().paint(roads, 1, 1).getMapId({"palette": ["#FF0000"]})

    centroid = aoi.centroid(maxError=100).coordinates().getInfo()
    bounds = aoi.bounds().getInfo()["coordinates"][0]
    lons = [p[0] for p in bounds]
    lats = [p[1] for p in bounds]
    bbox = [min(lons), min(lats), max(lons), max(lats)]

    raw_points = factors.get("raw_points", [])
    nearest, farthest = _get_nearest_farthest(aoi, raw_points)
    
    nearest_road_geojson = None
    farthest_road_geojson = None
    
    if nearest and roads:
        nearest_road_geojson = _get_closest_road_geojson(roads, nearest['lon'], nearest['lat'])
    if farthest and roads:
        farthest_road_geojson = _get_closest_road_geojson(roads, farthest['lon'], farthest['lat'])

    routes = []
    incidents = fetch_sample_population(bbox)
    if incidents and raw_points:
        for inc in incidents:
            nearest_fac = None
            min_dist = float('inf')
            for fac in raw_points:
                dist = haversine(inc["lon"], inc["lat"], fac["lon"], fac["lat"])
                if dist < min_dist:
                    min_dist = dist
                    nearest_fac = fac
            
            if nearest_fac:
                route_geom = fetch_osrm_route(inc["lon"], inc["lat"], nearest_fac["lon"], nearest_fac["lat"])
                if route_geom:
                    routes.append({
                        "geometry": route_geom,
                        "incident_name": inc["name"],
                        "facility_name": nearest_fac["name"],
                        "distance_km": round(min_dist, 2)
                    })

    result = {
        "travel_time_tile_url": travel_time_map_id["tile_fetcher"].url_format,
        "acc_class_tile_url": acc_class_map_id["tile_fetcher"].url_format,
        "roads_tile_url": roads_map_id["tile_fetcher"].url_format,
        "center": [centroid[1], centroid[0]],
        "bbox": bounds,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
        "facilities": raw_points,
        "nearest_road_geojson": nearest_road_geojson,
        "farthest_road_geojson": farthest_road_geojson,
        "incidents": incidents,
        "routes": routes
    }
    with _lock:
        _cache_map[cache_key] = result
    return result


def compute_accessibility_stats(aoi_config: dict, amenities: list[str]) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), "-".join(sorted(amenities)))
    with _lock:
        if cache_key in _cache_stats:
            return _cache_stats[cache_key]

    aoi, travel_time, acc_class, factors = _build_accessibility_images(aoi_config, amenities)

    class_area_bands = ee.Image.cat(
        [acc_class.eq(i + 1).multiply(ee.Image.pixelArea()).rename(f"c{i}") for i in range(4)]
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_stats = executor.submit(
            lambda: travel_time.reduceRegion(
                reducer=ee.Reducer.mean().combine(ee.Reducer.min(), sharedInputs=True)
                .combine(ee.Reducer.max(), sharedInputs=True).combine(ee.Reducer.stdDev(), sharedInputs=True),
                geometry=aoi, scale=500, maxPixels=10000, bestEffort=True, tileScale=4,
            ).getInfo()
        )
        f_area = executor.submit(
            lambda: class_area_bands.reduceRegion(
                reducer=ee.Reducer.sum(), geometry=aoi, scale=500, maxPixels=10000, bestEffort=True, tileScale=4,
            ).getInfo()
        )
        stats_raw = f_stats.result()
        class_area_dict = f_area.result()

    class_areas = {
        lbl: round((class_area_dict.get(f"c{i}", 0) or 0) / 1e6, 2)
        for i, lbl in enumerate(ACCESSIBILITY_CLASS_NAMES)
    }
    
    raw_points = factors.get("raw_points", [])
    raw_points = factors.get("raw_points", [])
    nearest, farthest = _get_nearest_farthest(aoi, raw_points)

    # Convert seconds to minutes for readability in stats
    result = {
        "stats": {
            "Mean Time (min)": round((stats_raw.get("travel_time_mean") or 0) / 60, 2),
            "Min Time (min)": round((stats_raw.get("travel_time_min") or 0) / 60, 2),
            "Max Time (min)": round((stats_raw.get("travel_time_max") or 0) / 60, 2),
            "Std Dev (min)": round((stats_raw.get("travel_time_stdDev") or 0) / 60, 2),
        },
        "class_areas_km2": class_areas,
        "nearest_facility": nearest,
        "farthest_facility": farthest
    }
    with _lock:
        _cache_stats[cache_key] = result
    return result


def compute_accessibility_classify(aoi_config: dict, amenities: list[str], n_classes: int = 4) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), "-".join(sorted(amenities)), n_classes)
    with _lock:
        if cache_key in _cache_classify:
            return _cache_classify[cache_key]

    aoi, travel_time, acc_class, factors = _build_accessibility_images(aoi_config, amenities)

    classify = quantile_classify(
        layers=[
            {"name": "TravelTime", "image": travel_time, "title": "Travel Time (seconds)"},
        ],
        aoi=aoi, scale=500, n_classes=n_classes,
    )

    result = {
        "classify": classify,
    }
    with _lock:
        _cache_classify[cache_key] = result
    return result


def compute_accessibility_export(aoi_config: dict, amenities: list[str]) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), "-".join(sorted(amenities)))
    with _lock:
        if cache_key in _cache_export:
            return _cache_export[cache_key]

    aoi, travel_time, acc_class, factors = _build_accessibility_images(aoi_config, amenities)
    
    raw_points = factors.get("raw_points", [])
    if raw_points:
        points_fc = ee.FeatureCollection([ee.Feature(ee.Geometry.Point([p["lon"], p["lat"]])) for p in raw_points])
        buffered = points_fc.map(lambda f: f.buffer(100))
        points_mask = ee.Image(0).byte().paint(buffered, 1)
        points_rgb = ee.Image([0, 0, 0]).byte().updateMask(points_mask)
    else:
        points_rgb = ee.Image(0).mask(0)

    tt_rgb = travel_time.visualize(min=0, max=3600, palette=ACCESSIBILITY_VIS["palette"])
    acc_rgb = acc_class.visualize(**ACCESSIBILITY_VIS)

    tt_final = tt_rgb.blend(points_rgb)
    acc_final = acc_rgb.blend(points_rgb)

    result = {
        "travel_time_thumb_url": tt_final.getThumbURL({"region": aoi.bounds(), "dimensions": 800, "format": "png"}),
        "travel_time_download_url": travel_time.getDownloadURL({"region": aoi.bounds(), "scale": 100, "format": "GEO_TIFF", "crs": "EPSG:4326"}),
        "acc_class_thumb_url": acc_final.getThumbURL({"region": aoi.bounds(), "dimensions": 800, "format": "png"}),
        "factor_maps": {},
    }
    with _lock:
        _cache_export[cache_key] = result
    return result


def compute_accessibility_analysis(
    district_or_aoi, amenities: list[str], n_classes: int = 4
) -> dict:
    if isinstance(district_or_aoi, str):
        aoi_config = {"type": "gaul2", "country": "Rwanda", "name": district_or_aoi, "level2": district_or_aoi}
    else:
        aoi_config = district_or_aoi

    map_res = compute_accessibility_map(aoi_config, amenities)
    stats_res = compute_accessibility_stats(aoi_config, amenities)
    classify_res = compute_accessibility_classify(aoi_config, amenities, n_classes)
    export_res = compute_accessibility_export(aoi_config, amenities)

    return {
        **map_res,
        **stats_res,
        **classify_res,
        **export_res,
    }
