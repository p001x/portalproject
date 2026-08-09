"""Water Harvesting Calculator — FastAPI backend."""
import json
import ee
from cachetools import TTLCache
from threading import Lock

_cache_map = TTLCache(maxsize=64, ttl=3600)
_cache_stats = TTLCache(maxsize=64, ttl=3600)
_cache_export = TTLCache(maxsize=64, ttl=3600)
_lock = Lock()

_PRECIP_VIS = {"min": 0, "max": 200, "palette": ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"]}

def _build_water_harvesting_images(aoi_config: dict, year: int):
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    
    start_date = f"{year}-01-01"
    end_date = f"{year}-12-31"

    # Precipitation from CHIRPS (Daily, 5km)
    precip_col = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate(start_date, end_date)
    annual_precip = precip_col.sum().clip(aoi).rename("annual_precip")
    monthly_precip = annual_precip.divide(12).rename("monthly_precip")
    
    return aoi, annual_precip, monthly_precip


def compute_water_harvesting_map(aoi_config: dict, year: int) -> dict:
    cache_key = json.dumps({"aoi": aoi_config, "year": year}, sort_keys=True)
    with _lock:
        if cache_key in _cache_map:
            return _cache_map[cache_key]

    aoi, annual_precip, monthly_precip = _build_water_harvesting_images(aoi_config, year)

    # We visualize the monthly average precipitation
    map_id = monthly_precip.getMapId(_PRECIP_VIS)
    
    centroid = aoi.centroid(maxError=100).coordinates().getInfo()
    bounds = aoi.bounds().getInfo()["coordinates"][0]
    
    thumb_url = monthly_precip.getThumbURL({
        **_PRECIP_VIS,
        "region": aoi.bounds(),
        "dimensions": 512,
        "format": "png"
    })
    
    res = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": thumb_url,
        "center": [centroid[1], centroid[0]],
        "bbox": bounds
    }
    
    with _lock:
        _cache_map[cache_key] = res
    return res


def recommend_tank(volume_liters: float) -> int:
    sizes = [250, 500, 1000, 2000, 2500, 3000, 5000, 10000]
    for size in sizes:
        if size >= volume_liters:
            return size
    return (int(volume_liters) // 5000 + 1) * 5000


def compute_water_harvesting_stats(aoi_config: dict, year: int, runoff_coefficient: float, manual_area_m2: float = None, use_building_footprint: bool = False) -> dict:
    cache_key = json.dumps({
        "aoi": aoi_config, "year": year, 
        "rc": runoff_coefficient, "ma": manual_area_m2, "ubf": use_building_footprint
    }, sort_keys=True)
    with _lock:
        if cache_key in _cache_stats:
            return _cache_stats[cache_key]

    aoi, annual_precip, monthly_precip = _build_water_harvesting_images(aoi_config, year)
    
    # Calculate Area
    if manual_area_m2 and manual_area_m2 > 0:
        area_m2 = manual_area_m2
    elif use_building_footprint:
        try:
            buildings = ee.FeatureCollection("GOOGLE/Research/open-buildings/v3/polygons").filterBounds(aoi)
            
            def get_intersection_area(f):
                intersection = f.geometry().intersection(aoi, 1)
                return f.set("intersect_area", intersection.area(1))
            
            buildings_intersected = buildings.map(get_intersection_area)
            area_dict = buildings_intersected.reduceColumns(ee.Reducer.sum(), ["intersect_area"]).getInfo()
            area_m2 = area_dict.get("sum", 0.0)
            if area_m2 is None:
                area_m2 = 0.0
        except Exception:
            area_m2 = aoi.area(1).getInfo()
    else:
        # Calculate area of polygon in square meters
        area_m2 = aoi.area(1).getInfo()
        
    # Average monthly precipitation
    mean_reducer = ee.Reducer.mean()
    res = monthly_precip.reduceRegion(reducer=mean_reducer, geometry=aoi, scale=1000, maxPixels=1e9).getInfo()
    
    avg_monthly_precip = float(res.get("monthly_precip", 0) or 0)
    
    # Volume (Liters) = Area (m2) * Monthly Rainfall (mm) * Runoff Coefficient
    volume_liters = area_m2 * avg_monthly_precip * runoff_coefficient
    
    recommended_tank = recommend_tank(volume_liters)

    out = {
        "area_m2": round(area_m2, 2),
        "avg_monthly_precip_mm": round(avg_monthly_precip, 2),
        "monthly_volume_liters": round(volume_liters, 2),
        "recommended_tank_liters": recommended_tank,
        "runoff_coefficient": runoff_coefficient
    }
    
    with _lock:
        _cache_stats[cache_key] = out
    return out


def compute_water_harvesting_export(aoi_config: dict, year: int) -> dict:
    cache_key = json.dumps({"aoi": aoi_config, "year": year}, sort_keys=True)
    with _lock:
        if cache_key in _cache_export:
            return _cache_export[cache_key]

    aoi, annual_precip, monthly_precip = _build_water_harvesting_images(aoi_config, year)

    url = monthly_precip.getDownloadURL({
        "name": f"water_harvesting_{year}",
        "scale": 1000,
        "region": aoi,
        "format": "GEO_TIFF"
    })
    
    res = {"download_url": url}
    with _lock:
        _cache_export[cache_key] = res
    return res
