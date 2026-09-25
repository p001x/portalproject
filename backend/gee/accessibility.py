import json
import logging
import os
import ee
import geopandas as gpd
import pandas as pd
import requests

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

def _fetch_osm_names(bbox: list[float], amenities: list[str]) -> list[dict]:
    minx, miny, maxx, maxy = bbox
    # Expand by 0.2 degrees (~22km) for names to ensure we catch border items
    exp_minx, exp_miny = minx - 0.2, miny - 0.2
    exp_maxx, exp_maxy = maxx + 0.2, maxy + 0.2
    
    osm_types = []
    for am in amenities:
        if "school" in am: osm_types.append("school")
        elif "hospital" in am or "clinic" in am or "health" in am: osm_types.extend(["hospital", "clinic", "health_facility"])
        elif "market" in am: osm_types.append("marketplace")
    
    if not osm_types:
        return []
        
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"~"{'|'.join(set(osm_types))}"]({exp_miny},{exp_minx},{exp_maxy},{exp_maxx});
      way["amenity"~"{'|'.join(set(osm_types))}"]({exp_miny},{exp_minx},{exp_maxy},{exp_maxx});
    );
    out center;
    """
    try:
        headers = {"User-Agent": "RwandaGeoportal/1.0 (contact@example.com)"}
        response = requests.post("https://overpass-api.de/api/interpreter", data={"data": query}, headers=headers, timeout=15)
        response.raise_for_status()
        res = response.json()
        osm_points = []
        for el in res.get("elements", []):
            lat = el.get("lat") or el.get("center", {}).get("lat")
            lon = el.get("lon") or el.get("center", {}).get("lon")
            if lat and lon:
                name = el.get("tags", {}).get("name")
                if name:
                    osm_points.append({"lon": lon, "lat": lat, "name": name})
        return osm_points
    except Exception as e:
        logger.warning(f"Failed to fetch OSM names: {e}")
        return []

def fetch_local_points(amenities: list[str], bbox: list[float]) -> tuple[list[ee.Feature], list[dict]]:
    """Fetch POIs within a bounding box from local shapefiles or OSM Overpass."""
    if not amenities:
        return [], []
        
    minx, miny, maxx, maxy = bbox
    cache_key = (f"{miny:.6f},{minx:.6f},{maxy:.6f},{maxx:.6f}", "-".join(sorted(amenities)), "v10")
    
    with _lock:
        if cache_key in _cache_overpass:
            cached_result = _cache_overpass[cache_key]
            if isinstance(cached_result, Exception):
                raise cached_result
            return cached_result
            
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    dataset_dir = os.path.join(base_dir, "dataset vector")
    
    osm_names_cache = _fetch_osm_names(bbox, amenities)
    
    sector_gdf = None
    sector_path = os.path.join(dataset_dir, "sector.shp")
    if os.path.exists(sector_path):
        try:
            sector_gdf = gpd.read_file(sector_path)
            if sector_gdf.crs and sector_gdf.crs.to_epsg() != 4326:
                sector_gdf = sector_gdf.to_crs(epsg=4326)
        except Exception as e:
            logger.warning(f"Failed to load sector: {e}")
    
    amenity_to_shp = {
        "primary_school": "CROM_Vector.gdb|Schools|Primary",
        "secondary_school": "CROM_Vector.gdb|Schools|Secondary",
        "superior_school": "Schools_superior.shp",
        "marketplace": "CROM_Vector.gdb|Markets",
        "hospital": "CROM_Vector.gdb|Health_facilities",
        "clinic": "CROM_Vector.gdb|Health_facilities"
    }
    
    features = []
    raw_points = []
    
    for am in amenities:
        if am not in amenity_to_shp:
            continue
            
        shp_file = amenity_to_shp[am]
        
        if "|" in shp_file:
            parts = shp_file.split("|")
            gdb_name = parts[0]
            layer_name = parts[1]
            filter_val = parts[2] if len(parts) > 2 else None
            shp_path = os.path.join(dataset_dir, gdb_name)
            if not os.path.exists(shp_path):
                continue
            try:
                gdf = gpd.read_file(shp_path, layer=layer_name)
                if filter_val and 'Highest_Ed' in gdf.columns:
                    gdf = gdf[gdf['Highest_Ed'].str.contains(filter_val, na=False, case=False)]
                    
                name_col = None
                for col in ['NOMFORMATI', 'TRADENAME', 'Name', 'NAME']:
                    if col in gdf.columns:
                        name_col = col
                        break
            except Exception as e:
                logger.error(f"Failed to load {layer_name} from {gdb_name}: {e}")
                continue
        else:
            shp_path = os.path.join(dataset_dir, shp_file)
            if not os.path.exists(shp_path):
                continue
            try:
                gdf = gpd.read_file(shp_path)
                name_col = None
                for col in ['NOMFORMATI', 'TRADENAME', 'Name', 'NAME', 'DESCR1', 'DESCR2']:
                    if col in gdf.columns:
                        name_col = col
                        break
            except Exception as e:
                logger.error(f"Failed to load {shp_file}: {e}")
                continue
        # Make sure it's in WGS84
        if gdf.crs and gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs(epsg=4326)
            
        # Get bounds in the CRS of the file to filter efficiently
        bbox_geom = gpd.GeoSeries.from_wkt([f"POLYGON (({minx} {miny}, {maxx} {miny}, {maxx} {maxy}, {minx} {maxy}, {minx} {miny}))"], crs="EPSG:4326")
        
        if gdf.crs and gdf.crs.to_epsg() != 4326:
            bbox_geom = bbox_geom.to_crs(gdf.crs)
            
        bounds = bbox_geom.total_bounds
        
        # We can just filter on the WGS84 geometry though
        local_gdf = gdf.cx[minx:maxx, miny:maxy]
        
        if len(local_gdf) == 0:
            continue
            
        if sector_gdf is not None:
            # Spatial join to get sector names
            try:
                local_gdf = gpd.sjoin(local_gdf, sector_gdf, how="left", predicate="intersects")
            except Exception as e:
                logger.error(f"Sjoin failed: {e}")
        
        for idx, row in local_gdf.iterrows():
            geom = row.geometry
            if geom and geom.is_valid and not geom.is_empty:
                centroid = geom.centroid
                
                name = None
                if name_col and name_col in row and pd.notna(row[name_col]) and str(row[name_col]).strip() and str(row[name_col]).strip().lower() != 'nan':
                    name = str(row[name_col]).strip()
                
                # Try fallback names if empty
                if not name:
                    id_val = ""
                    for id_col in ["FID_", "FID", "NO", "CODE1", "id", "ID", "CODE_DE_PR", "OBJECTID"]:
                        if id_col in row and pd.notna(row[id_col]):
                            try:
                                id_val = f"#{int(row[id_col])}"
                            except ValueError:
                                id_val = f"#{row[id_col]}"
                            break
                            
                    if id_val:
                        name = f"{id_val}"
                    elif 'Sector' in row and pd.notna(row['Sector']) and str(row['Sector']).strip().lower() != 'nan':
                        name = f"in {row['Sector']} Sector"
                    elif 'Sector_Nam' in row and pd.notna(row['Sector_Nam']) and str(row['Sector_Nam']).strip().lower() != 'nan':
                        name = f"in {row['Sector_Nam']} Sector"
                    else:
                        name = f"Unnamed"
                    
                features.append(ee.Feature(ee.Geometry.Point([centroid.x, centroid.y])))
                raw_points.append({"lon": centroid.x, "lat": centroid.y, "name": name, "type": am})
        # Catch any errors in the processing loop but continue
        # (Removed orphaned try-except here since read_file is already handled above)
    if not features:
        logger.warning(f"No local features found for {amenities} in bbox {bbox}.")
        return [], []
        
    with _lock:
        _cache_overpass[cache_key] = (features, raw_points)
        
    return features, raw_points


def _build_accessibility_images(aoi_config: dict, amenities: list[str], dest_amenities: list[str] = None, n_classes: int = 4, service_threshold_mins: int = 30, proposed_facilities: list = None, transport_mode: str = "walking"):
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)

    bounds_info = aoi.bounds().getInfo()
    if not bounds_info or "coordinates" not in bounds_info:
        raise ValueError("Could not calculate bounds for the selected study area. The area might be empty or missing from the geographic dataset.")
    bounds = bounds_info["coordinates"][0]
    
    lons = [p[0] for p in bounds]
    lats = [p[1] for p in bounds]
    bbox = [min(lons), min(lats), max(lons), max(lats)]
    
    # 1. Fetch amenities
    # If dest_amenities are provided, we route TO them (they are the sources). The origins are `amenities`.
    target_amenities = dest_amenities if dest_amenities and len(dest_amenities) > 0 else amenities
    
    points, raw_points = fetch_local_points(target_amenities, bbox)

    if proposed_facilities:
        for pf in proposed_facilities:
            pt = ee.Geometry.Point([pf[0], pf[1]])
            points.append(ee.Feature(pt, {"name": "Proposed Facility"}))
            raw_points.append({"lon": pf[0], "lat": pf[1], "name": "Proposed Facility", "type": "proposed"})

    if not points:
        debug_info = ""
        if raw_points and len(raw_points) > 0 and "debug" in raw_points[0]:
            debug_info = "\n\nDEBUG INFO:\n" + raw_points[0]["debug"]
            
        raise ValueError(f"No {' or '.join(target_amenities)} found in or near this study area. Try selecting a different area or different amenities.{debug_info}")
        
    # Cap to avoid GEE payload limits
    max_points = 1500
    if len(points) > max_points:
        logger.warning(f"Capping points from {len(points)} to {max_points}")
        points = points[:max_points]
        
    sources = ee.FeatureCollection(points)
    
    # Also fetch origin amenities if dest_amenities is used
    origin_raw_points = []
    if dest_amenities and len(dest_amenities) > 0:
        _, origin_raw_points = fetch_local_points(amenities, bbox)
    
    # 2. Friction surface (cost)
    # Use SRTM DEM for slope to calculate Tobler's Hiking Function
    import math
    dem = ee.Image("CGIAR/SRTM90_V4").clip(aoi)
    slope_deg = ee.Terrain.slope(dem)
    # Convert slope degrees to rise/run (tan)
    slope_rad = slope_deg.multiply(math.pi / 180)
    S = slope_rad.tan()

    # Tobler's: v = 6 * exp(-3.5 * abs(S + 0.05)) (in km/h)
    abs_term = S.add(0.05).abs()
    v_kmh_walking = ee.Image(6).multiply(ee.Image(-3.5).multiply(abs_term).exp()).max(0.1)
    
    if transport_mode == "bicycle":
        # Bicycles are faster but highly sensitive to slope
        v_kmh = v_kmh_walking.multiply(2.0).max(0.1)
        road_speed_kmh = 15.0
        offroad_penalty = 2.0
    elif transport_mode == "driving":
        # Driving offroad is very slow/hard
        v_kmh = v_kmh_walking.multiply(0.5).max(0.1)
        road_speed_kmh = 40.0
        offroad_penalty = 5.0
    else: # walking
        v_kmh = v_kmh_walking
        road_speed_kmh = 5.0
        offroad_penalty = 1.0
    
    # pace (seconds per meter) = 3.6 / v
    base_cost = ee.Image(3.6).divide(v_kmh).rename("cost")
    
    # Land Cover adjustments (ESA WorldCover)
    lc = ee.ImageCollection("ESA/WorldCover/v100").first().clip(aoi)
    lc_multiplier = (
        ee.Image(1.0)
        .where(lc.eq(10), 1.5) # Trees
        .where(lc.eq(90), 5.0) # Wetlands
        .where(lc.eq(80), 20.0) # Water bodies (high friction)
    ).multiply(offroad_penalty)
    
    base_cost = base_cost.multiply(lc_multiplier)
    
    # Roads GRIP4 Africa
    roads = ee.FeatureCollection("projects/sat-io/open-datasets/GRIP4/Africa").filterBounds(aoi)
    # road pace (seconds per meter)
    road_pace = 3.6 / road_speed_kmh
    roads_raster = ee.Image(1).paint(roads, road_pace)
    
    # Combine (road speed where roads exist, else offroad speed)
    cost = base_cost.where(roads_raster.neq(1), roads_raster).rename("cost")
    
    # 3. Compute cumulative cost (travel time in seconds)
    source_img = ee.Image(0).paint(sources, 1).clip(aoi)
    max_dist_meters = 3600 * (1 / 0.09) # max distance in meters to explore (40km)
    
    travel_time = cost.cumulativeCost(
        source=source_img,
        maxDistance=max_dist_meters
    ).clip(aoi).rename("travel_time")
    
    # Cap at 3600s (60 minutes) and mask invalid (unreachable)
    travel_time = travel_time.where(travel_time.gt(3600), 3600)
    travel_time = travel_time.unmask(3600)
    
    # 4. Classify dynamically based on n_classes (equal intervals up to 3600s)
    acc_class = ee.Image(0).clip(aoi).rename("accessibility_class")
    interval = 3600 / n_classes
    for i in range(n_classes):
        lower = i * interval
        upper = (i + 1) * interval
        if i == 0:
            acc_class = acc_class.where(travel_time.lte(upper), 1)
        elif i == n_classes - 1:
            acc_class = acc_class.where(travel_time.gt(lower), i + 1)
        else:
            acc_class = acc_class.where(travel_time.gt(lower).And(travel_time.lte(upper)), i + 1)

    
    return aoi, travel_time, acc_class, {
        "cost_surface": cost,
        "roads": roads, 
        "raw_points": raw_points, 
        "origin_raw_points": origin_raw_points
    }


def _get_nearest_farthest(aoi, raw_points, origin_raw_points=None):
    if not raw_points:
        return None, None
        
    if origin_raw_points:
        all_pairs = []
        for o in origin_raw_points:
            for d in raw_points:
                dist = haversine(o["lon"], o["lat"], d["lon"], d["lat"])
                if dist > 0.001:  # Prevent routing to exact same point
                    all_pairs.append({
                        "origin": o,
                        "dest": d.copy(),
                        "distance_km": round(dist, 2)
                    })
        
        if not all_pairs:
            return None, None
            
        all_pairs_sorted = sorted(all_pairs, key=lambda x: x["distance_km"])
        
        nearest = all_pairs_sorted[0]["dest"]
        nearest["distance_km"] = all_pairs_sorted[0]["distance_km"]
        
        def _get_name(pt, default_type):
            n = pt.get("name", "Unnamed")
            if n.startswith("Unnamed"):
                id_part = n.replace("Unnamed", "")
                res = f"{pt.get('type', default_type)}{id_part}"
                if "Sector" not in res:
                    res += " Location"
                return res
            return n

        origin_name = _get_name(all_pairs_sorted[0]["origin"], "Origin")
        dest_name = _get_name(nearest, "Destination")
        nearest["name"] = f"{dest_name} (from {origin_name})"
        
        farthest = all_pairs_sorted[-1]["dest"]
        farthest["distance_km"] = all_pairs_sorted[-1]["distance_km"]
        origin_name_f = _get_name(all_pairs_sorted[-1]["origin"], "Origin")
        dest_name_f = _get_name(farthest, "Destination")
        farthest["name"] = f"{dest_name_f} (from {origin_name_f})"
        
        return nearest, farthest
    else:
        # Fallback to centroid safely
        try:
            centroid_info = aoi.centroid(maxError=100).coordinates().getInfo()
            if not centroid_info or len(centroid_info) < 2:
                # Ultimate fallback if GEE fails
                bounds = aoi.bounds().getInfo().get("coordinates", [[[0,0]]])[0]
                c_lon = sum(p[0] for p in bounds) / len(bounds)
                c_lat = sum(p[1] for p in bounds) / len(bounds)
            else:
                c_lon, c_lat = centroid_info[0], centroid_info[1]
        except Exception:
            c_lon, c_lat = 30.0, -2.0 # Fallback central Rwanda


        # Make a copy so we don't mutate the original list elements for other uses
        pts = [p.copy() for p in raw_points]
        for p in pts:
            p["distance_km"] = round(haversine(c_lon, c_lat, p["lon"], p["lat"]), 2)
            
        pts_sorted = sorted(pts, key=lambda x: x["distance_km"])
        
        nearest = pts_sorted[0]
        nearest["name"] = f"{nearest.get('name', 'Unnamed')} (from AOI Center)"
        
        farthest = pts_sorted[-1]
        farthest["name"] = f"{farthest.get('name', 'Unnamed')} (from AOI Center)"
        
        return nearest, farthest

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
        headers = {"User-Agent": "RwandaGeoportal/1.0 (contact@example.com)"}
        response = requests.get(url, headers=headers, timeout=10)
        time.sleep(0.3)  # Respect public API rate limits (1 req/sec max recommended)
        if response.status_code == 200:
            res = response.json()
            if res.get("code") == "Ok" and res.get("routes"):
                return res["routes"][0]
        else:
            logger.warning(f"OSRM request failed with status: {response.status_code}")
    except Exception as e:
        logger.warning(f"OSRM request failed, falling back to straight line: {e}")
        
    # Fallback to straight line (Euclidean) path if OSRM fails
    dist = haversine(start_lon, start_lat, end_lon, end_lat)
    return {
        "geometry": {
            "type": "LineString",
            "coordinates": [[start_lon, start_lat], [end_lon, end_lat]]
        },
        "distance": dist * 1000,
        "duration": dist / (40 / 3.6) # Approx duration at 40km/h
    }

def compute_accessibility_map(aoi_config: dict, amenities: list[str], dest_amenities: list[str] = None, n_classes: int = 4, service_threshold_mins: int = 30, method: str = "natural_breaks", proposed_facilities: list = None, transport_mode: str = "walking") -> dict:
    dest_am = dest_amenities or []
    cache_key = (json.dumps(aoi_config, sort_keys=True), "-".join(sorted(amenities)), "-".join(sorted(dest_am)), n_classes, service_threshold_mins, method, transport_mode, "v12")
    with _lock:
        if cache_key in _cache_map:
            return _cache_map[cache_key]

    aoi, travel_time, acc_class, factors = _build_accessibility_images(aoi_config, amenities, dest_amenities, n_classes, service_threshold_mins, proposed_facilities=proposed_facilities, transport_mode=transport_mode)
    
    roads = factors.get("roads")
    raw_points = factors.get("raw_points", [])
    
    from gee.classify_utils import quantile_classify
    
    # We use reverse_labels=True because low travel time = High accessibility, and the palette is already green to red.
    classify = quantile_classify(
        layers=[{"name": "TravelTime", "image": travel_time, "title": "Travel Time (seconds)"}],
        aoi=aoi, scale=get_dynamic_scale(aoi), n_classes=n_classes,
        method=method, reverse_labels=True
    )
    
    acc_class_tile_url = classify["panels"][0]["tile_url"]

    travel_time_vis = {"min": 0, "max": 3600, "palette": ["#ffffff", "#f5e6ce", "#d4b179", "#a16b38", "#572b0c"]}
    travel_time_map_id = travel_time.getMapId(travel_time_vis)
    
    roads_map_id = ee.Image().byte().paint(roads, 1, 1).getMapId({"palette": ["#FF0000"]}) if roads else {"tile_fetcher": type('obj', (object,), {'url_format': ''})}

    centroid_info = aoi.centroid(maxError=100).coordinates().getInfo()
    bounds_info = aoi.bounds().getInfo()
    if not bounds_info or "coordinates" not in bounds_info:
        raise ValueError("AOI geometry is invalid or empty.")
    bounds = bounds_info["coordinates"][0]
    lons = [p[0] for p in bounds]
    lats = [p[1] for p in bounds]
    bbox = [min(lons), min(lats), max(lons), max(lats)]

    if centroid_info and len(centroid_info) >= 2:
        centroid = centroid_info
    else:
        centroid = [sum(lons)/len(lons), sum(lats)/len(lats)]

    origin_raw_points = factors.get("origin_raw_points", [])
    nearest, farthest = _get_nearest_farthest(aoi, raw_points, origin_raw_points)
    
    nearest_road_geojson = None
    farthest_road_geojson = None
    
    if nearest and roads:
        nearest_road_geojson = _get_closest_road_geojson(roads, nearest['lon'], nearest['lat'])
    if farthest and roads:
        farthest_road_geojson = _get_closest_road_geojson(roads, farthest['lon'], farthest['lat'])

    routes = []
    # Use origin amenities if present, otherwise sample population
    incidents = origin_raw_points if len(origin_raw_points) > 0 else fetch_sample_population(bbox)
    
    if incidents and raw_points:
        # If there are many origins, cap the routes to 25 to prevent freezing
        if len(origin_raw_points) > 0:
             incidents = incidents[:25]
             
        for inc in incidents:
            pts_sorted = sorted(raw_points, key=lambda f: haversine(inc["lon"], inc["lat"], f["lon"], f["lat"]))
            candidates = pts_sorted[:3] # Route to the 3 nearest by straight line
            
            best_route = None
            best_duration = float('inf')
            best_fac = None
            
            for fac in candidates:
                route = fetch_osrm_route(inc["lon"], inc["lat"], fac["lon"], fac["lat"])
                if route and "duration" in route and route["duration"] < best_duration:
                    best_duration = route["duration"]
                    best_route = route
                    best_fac = fac
            
            if best_route and best_fac:
                def _get_name(pt, default_type):
                    n = pt.get("name", "Unnamed")
                    if n.startswith("Unnamed"):
                        id_part = n.replace("Unnamed", "")
                        res = f"{pt.get('type', default_type)}{id_part}"
                        if "Sector" not in res:
                            res += " Location"
                        return res
                    return n
                    
                routes.append({
                    "geometry": best_route.get("geometry", best_route),
                    "incident_name": _get_name(inc, "Origin"),
                    "facility_name": _get_name(best_fac, "Destination"),
                    "distance_km": round(best_route.get("distance", 0) / 1000, 2),
                    "duration_mins": round(best_route.get("duration", 0) / 60, 2)
                })

    result = {
        "travel_time_tile_url": travel_time_map_id["tile_fetcher"].url_format,
        "acc_class_tile_url": acc_class_tile_url,
        "roads_tile_url": roads_map_id["tile_fetcher"].url_format,
        "center": [centroid[1], centroid[0]],
        "bbox": bounds,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
        "facilities": raw_points,
        "origins": origin_raw_points,
        "nearest_road_geojson": nearest_road_geojson,
        "farthest_road_geojson": farthest_road_geojson,
        "incidents": incidents if not origin_raw_points else [],
        "routes": routes
    }
    with _lock:
        _cache_map[cache_key] = result
    return result


def compute_accessibility_stats(aoi_config: dict, amenities: list[str], dest_amenities: list[str] = None, n_classes: int = 4, service_threshold_mins: int = 30, proposed_facilities: list = None, transport_mode: str = "walking") -> dict:
    dest_am = dest_amenities or []
    cache_key = (json.dumps(aoi_config, sort_keys=True), "-".join(sorted(amenities)), "-".join(sorted(dest_am)), n_classes, service_threshold_mins, transport_mode, "v12")
    with _lock:
        if cache_key in _cache_stats:
            return _cache_stats[cache_key]

    aoi, travel_time, acc_class, factors = _build_accessibility_images(aoi_config, amenities, dest_amenities, n_classes, service_threshold_mins, proposed_facilities=proposed_facilities, transport_mode=transport_mode)
    
    baseline_futures = None
    if proposed_facilities:
        _, base_travel_time, base_acc_class, _ = _build_accessibility_images(aoi_config, amenities, dest_amenities, n_classes, service_threshold_mins, proposed_facilities=None, transport_mode=transport_mode)

    def _submit_jobs(executor, t_time, a_class, area_of_interest):
        c_bands = ee.Image.cat([a_class.eq(i + 1).multiply(ee.Image.pixelArea()).rename(f"c{i}") for i in range(n_classes)])
        s_mask = t_time.lte(service_threshold_mins * 60)
        pop_img = ee.ImageCollection("WorldPop/GP/100m/pop").filter(ee.Filter.inList('year', [2020])).first().clip(area_of_interest)
        sc = get_dynamic_scale(area_of_interest)
        
        return {
            'stats': executor.submit(lambda: t_time.reduceRegion(
                reducer=ee.Reducer.mean().combine(ee.Reducer.min(), sharedInputs=True).combine(ee.Reducer.max(), sharedInputs=True).combine(ee.Reducer.stdDev(), sharedInputs=True),
                geometry=area_of_interest, scale=sc, maxPixels=1e10).getInfo()),
            'area': executor.submit(lambda: c_bands.reduceRegion(reducer=ee.Reducer.sum(), geometry=area_of_interest, scale=sc, maxPixels=1e10).getInfo()),
            'served': executor.submit(lambda: ee.Image.pixelArea().updateMask(s_mask).reduceRegion(reducer=ee.Reducer.sum(), geometry=area_of_interest, scale=sc, maxPixels=1e10).getInfo()),
            'pop': executor.submit(lambda: pop_img.updateMask(s_mask).reduceRegion(reducer=ee.Reducer.sum(), geometry=area_of_interest, scale=sc, maxPixels=1e10).getInfo()),
            'total_pop': executor.submit(lambda: pop_img.reduceRegion(reducer=ee.Reducer.sum(), geometry=area_of_interest, scale=sc, maxPixels=1e10).getInfo())
        }
        
    def _resolve_jobs(futures):
        from gee.classify_utils import class_labels
        lbls = class_labels(n_classes)
        interval = 3600 / n_classes
        c_areas = {}
        c_dict = futures['area'].result()
        for i, lbl in enumerate(lbls):
            lower_min = int((i * interval) / 60)
            upper_min = int(((i + 1) * interval) / 60)
            label = f"{lbl} ({lower_min}-{upper_min}m)" if i < n_classes - 1 else f"{lbl} (>{lower_min}m)"
            c_areas[label] = round((c_dict.get(f"c{i}", 0) or 0) / 1e6, 2)
            
        s_raw = futures['stats'].result()
        s_area = round((list(futures['served'].result().values())[0] or 0) / 1e6, 2)
        s_pop = int(list(futures['pop'].result().values())[0] or 0)
        t_pop = int(list(futures['total_pop'].result().values())[0] or 0)
        
        return {
            "stats": {
                "Mean Time (min)": round((s_raw.get("travel_time_mean") or 0) / 60, 2),
                "Min Time (min)": round((s_raw.get("travel_time_min") or 0) / 60, 2),
                "Max Time (min)": round((s_raw.get("travel_time_max") or 0) / 60, 2),
                "Std Dev (min)": round((s_raw.get("travel_time_stdDev") or 0) / 60, 2),
            },
            "served": {
                "threshold_mins": service_threshold_mins,
                "area_km2": s_area,
                "population": s_pop,
                "total_population": t_pop,
                "pop_percent": round(s_pop / t_pop * 100, 1) if t_pop > 0 else 0
            },
            "class_areas_km2": c_areas
        }

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        active_futures = _submit_jobs(executor, travel_time, acc_class, aoi)
        if proposed_facilities:
            baseline_futures = _submit_jobs(executor, base_travel_time, base_acc_class, aoi)
            
        active_results = _resolve_jobs(active_futures)
        baseline_results = _resolve_jobs(baseline_futures) if baseline_futures else None

    raw_points = factors.get("raw_points", [])
    origin_raw_points = factors.get("origin_raw_points", [])
    nearest, farthest = _get_nearest_farthest(aoi, raw_points, origin_raw_points)

    result = {
        "stats": active_results["stats"],
        "served": active_results["served"],
        "class_areas_km2": active_results["class_areas_km2"],
        "nearest_facility": nearest,
        "farthest_facility": farthest
    }
    
    if baseline_results:
        result["delta_stats"] = {
            "population_served": active_results["served"]["population"] - baseline_results["served"]["population"],
            "area_km2_served": round(active_results["served"]["area_km2"] - baseline_results["served"]["area_km2"], 2),
            "mean_time_min": round(active_results["stats"]["Mean Time (min)"] - baseline_results["stats"]["Mean Time (min)"], 2),
        }
    with _lock:
        _cache_stats[cache_key] = result
    return result


def compute_accessibility_classify(aoi_config: dict, amenities: list[str], dest_amenities: list[str] = None, n_classes: int = 4, service_threshold_mins: int = 30, method: str = "natural_breaks", custom_labels: list[str] = None, proposed_facilities: list = None, transport_mode: str = "walking") -> dict:
    dest_am = dest_amenities or []
    cache_key = (json.dumps(aoi_config, sort_keys=True), "-".join(sorted(amenities)), "-".join(sorted(dest_am)), n_classes, service_threshold_mins, method, tuple(custom_labels) if custom_labels else None, transport_mode, "v12")
    with _lock:
        if cache_key in _cache_classify:
            return _cache_classify[cache_key]

    aoi, travel_time, acc_class, factors = _build_accessibility_images(aoi_config, amenities, dest_amenities, n_classes, service_threshold_mins, proposed_facilities=proposed_facilities, transport_mode=transport_mode)

    classify = quantile_classify(
        layers=[
            {"name": "TravelTime", "image": travel_time, "title": "Travel Time (seconds)"},
        ],
        aoi=aoi, scale=get_dynamic_scale(aoi), n_classes=n_classes,
        method=method, custom_labels=custom_labels, reverse_labels=True
    )

    result = {
        "classify": classify,
    }
    with _lock:
        _cache_classify[cache_key] = result
    return result


def compute_accessibility_export(aoi_config: dict, amenities: list[str], dest_amenities: list[str] = None, n_classes: int = 4, service_threshold_mins: int = 30, proposed_facilities: list = None, transport_mode: str = "walking") -> dict:
    dest_am = dest_amenities or []
    cache_key = (json.dumps(aoi_config, sort_keys=True), "-".join(sorted(amenities)), "-".join(sorted(dest_am)), n_classes, service_threshold_mins, transport_mode, "v12")
    with _lock:
        if cache_key in _cache_export:
            return _cache_export[cache_key]

    aoi, travel_time, acc_class, factors = _build_accessibility_images(aoi_config, amenities, dest_amenities, n_classes, service_threshold_mins, proposed_facilities=proposed_facilities, transport_mode=transport_mode)
    
    raw_points = factors.get("raw_points", [])
    if raw_points:
        points_fc = ee.FeatureCollection([ee.Feature(ee.Geometry.Point([p["lon"], p["lat"]])) for p in raw_points])
        buffered = points_fc.map(lambda f: f.buffer(100))
        points_mask = ee.Image(0).byte().paint(buffered, 1)
        points_rgb = ee.Image([0, 0, 0]).byte().updateMask(points_mask)
    else:
        points_rgb = ee.Image(0).mask(0)
        
    roads = factors.get("roads")
    if roads:
        roads_mask = ee.Image(0).byte().paint(roads, 1, 1)
        roads_rgb = ee.Image([255, 0, 0]).byte().updateMask(roads_mask)
    else:
        roads_rgb = ee.Image(0).mask(0)
        
    from gee.classify_utils import class_palette
    pal = class_palette(n_classes)
    ACCESSIBILITY_VIS = {
        "min": 1,
        "max": n_classes,
        "palette": pal
    }

    tt_rgb = travel_time.visualize(min=0, max=3600, palette=["#ffffff", "#f5e6ce", "#d4b179", "#a16b38", "#572b0c"])
    acc_rgb = acc_class.visualize(**ACCESSIBILITY_VIS)

    tt_final = tt_rgb.blend(roads_rgb).blend(points_rgb)
    acc_final = acc_rgb.blend(roads_rgb).blend(points_rgb)

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
