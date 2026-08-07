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


def fetch_overpass_points(amenities: list[str], bbox: list[float]) -> tuple[list[ee.Feature], list[dict]]:
    """Fetch OpenStreetMap POIs within a bounding box via Overpass API."""
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
            
        overpass_bbox = f"{miny:.6f},{minx:.6f},{maxy:.6f},{maxx:.6f}"
    
        query = f"""
        [out:json][timeout:90];
        (
          node["amenity"~"^{'$|^'.join(amenities)}$"]({overpass_bbox});
          way["amenity"~"^{'$|^'.join(amenities)}$"]({overpass_bbox});
          relation["amenity"~"^{'$|^'.join(amenities)}$"]({overpass_bbox});
        );
        out center;
        """
        
        endpoints = [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.openstreetmap.ru/api/interpreter",
            "https://lz4.overpass-api.de/api/interpreter",
            "https://z.overpass-api.de/api/interpreter",
            "https://overpass.osm.ch/api/interpreter",
        ]
        
        last_error = None
        for url in endpoints:
            try:
                headers = {
                    "User-Agent": "RwandaGeoPortal/1.0 (contact@example.com)"
                }
                response = requests.post(url, data=query.encode('utf-8'), headers=headers, timeout=100)
                response.raise_for_status()
                data = response.json()
                
                features = []
                raw_points = []
                for element in data.get('elements', []):
                    lon = element.get('lon') or element.get('center', {}).get('lon')
                    lat = element.get('lat') or element.get('center', {}).get('lat')
                    tags = element.get('tags', {})
                    name = tags.get('name', 'Unnamed')
                    amenity_type = tags.get('amenity', 'Facility')
                    if lon and lat:
                        features.append(ee.Feature(ee.Geometry.Point([lon, lat])))
                        raw_points.append({"lon": lon, "lat": lat, "name": name, "type": amenity_type})
                
                if 'remark' in data and not features:
                    # If there's a remark (e.g. timeout) and no features, treat as failure
                    raise ValueError(f"OpenStreetMap query failed: {data['remark']}")
                    
                if not features:
                    # Successfully queried, but genuinely 0 results. Don't try other endpoints.
                    logger.warning(f"Overpass returned no features for {amenities} in bbox {overpass_bbox}. Response: {str(data)[:200]}")
                    # We return [] to let the calling function handle it with a clean error
                    _cache_overpass[cache_key] = ([], [])
                    return [], []
                    
                _cache_overpass[cache_key] = (features, raw_points)
                return features, raw_points
                
            except requests.exceptions.RequestException as e:
                logger.warning(f"Overpass API error on {url}: {e}")
                last_error = e
                if e.response is not None and e.response.status_code == 429:
                    time.sleep(2) # Backoff before trying next endpoint
                continue
            except Exception as e:
                # We explicitly check if it's the remark ValueError we raised, and if so, continue
                if isinstance(e, ValueError) and "OpenStreetMap query failed" in str(e):
                    logger.warning(f"Overpass API remark on {url}: {e}")
                    last_error = e
                    continue
                logger.error(f"Unexpected error parsing Overpass data on {url}: {e}")
                last_error = e
                continue
    
        if last_error:
            if isinstance(last_error, requests.exceptions.RequestException) and last_error.response is not None:
                err = ValueError(f"Failed to fetch data from OpenStreetMap. API error: {last_error.response.status_code}")
            else:
                err = ValueError(f"Failed to fetch data from OpenStreetMap: {str(last_error)}")
            _cache_overpass[cache_key] = err
            raise err
        
        _cache_overpass[cache_key] = ([], [])
        return [], []


def _build_accessibility_images(aoi_config: dict, amenities: list[str]):
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    bounds = aoi.bounds().getInfo()["coordinates"][0]
    
    lons = [p[0] for p in bounds]
    lats = [p[1] for p in bounds]
    bbox = [min(lons), min(lats), max(lons), max(lats)]
    
    # 1. Fetch amenities
    points, raw_points = fetch_overpass_points(amenities, bbox)

    if not points:
        raise ValueError(f"No {' or '.join(amenities)} found in or near this study area. Try selecting a different area or different amenities.")
        
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

    raw_points = factors.get("raw_points", [])
    nearest, farthest = _get_nearest_farthest(aoi, raw_points)
    
    nearest_road_geojson = None
    farthest_road_geojson = None
    
    if nearest and roads:
        nearest_road_geojson = _get_closest_road_geojson(roads, nearest['lon'], nearest['lat'])
    if farthest and roads:
        farthest_road_geojson = _get_closest_road_geojson(roads, farthest['lon'], farthest['lat'])

    routes = []
    incidents = fetch_sample_population(bounds)
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

    result = {
        "travel_time_thumb_url": travel_time.getThumbURL({"min": 0, "max": 3600, "palette": ACCESSIBILITY_VIS["palette"], "region": aoi.bounds(), "dimensions": 800, "format": "png"}),
        "travel_time_download_url": travel_time.getDownloadURL({"region": aoi.bounds(), "scale": 100, "format": "GEO_TIFF", "crs": "EPSG:4326"}),
        "acc_class_thumb_url": acc_class.getThumbURL({**ACCESSIBILITY_VIS, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),
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
