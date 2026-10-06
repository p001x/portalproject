import json
import calendar
import ee
import hashlib
from gee.aoi_utils import get_dynamic_scale, safe_get_info, get_aoi_geometry
from gee.classify_utils import quantile_classify
import threading
import time
import random
from gee.auth import get_gee_status, rotate_credentials
from cachetools import TTLCache

gee_semaphore = threading.BoundedSemaphore(5)
_cache = TTLCache(maxsize=128, ttl=3600)
_cache_locks = {}
_cache_lock_lock = threading.Lock()

def _get_key_lock(key):
    with _cache_lock_lock:
        if key not in _cache_locks:
            _cache_locks[key] = threading.Lock()
        return _cache_locks[key]

def _safe_gee_call(func, *args, **kwargs):
    retries = 5
    for i in range(retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "Too Many Requests" in err_str or "concurrency" in err_str.lower() or "quota" in err_str.lower():
                rotate_credentials()
                if i < retries - 1:
                    time.sleep((2 ** i) + random.uniform(0, 1))
                    continue
            raise

SEASONS_INFO = {
    "season_b": {"start_month": 3, "end_month": 6, "cross_year": False, "name": "Season B"},
    "season_a": {"start_month": 9, "end_month": 2, "cross_year": True, "name": "Season A"},
    "season_c": {"start_month": 7, "end_month": 8, "cross_year": False, "name": "Season C"},
    "annual": {"start_month": 1, "end_month": 12, "cross_year": False, "name": "Annual"},
}

def resolve_season_dates(start_year, end_year, season="season_b", start_month=None, end_month=None, start_date=None, end_date=None):
    if start_date and end_date:
        s_parts = [int(p) for p in start_date.split("-")]
        e_parts = [int(p) for p in end_date.split("-")]
        s_m, e_m = s_parts[1], e_parts[1]
        return start_date, end_date, s_m, e_m, f"Custom ({start_date} to {end_date})"

    season_key = (season or "season_b").lower().strip()
    if season_key in SEASONS_INFO:
        cfg = SEASONS_INFO[season_key]
        s_m, e_m, cross = cfg["start_month"], cfg["end_month"], cfg["cross_year"]
        
        if cross:
            s_yr, e_yr = start_year - 1, end_year
        else:
            s_yr, e_yr = start_year, end_year
            
        last_day = calendar.monthrange(e_yr, e_m)[1]
        return f"{s_yr}-{s_m:02d}-01", f"{e_yr}-{e_m:02d}-{last_day:02d}", s_m, e_m, cfg["name"]

    if start_month and end_month:
        s_m, e_m = int(start_month), int(end_month)
        cross = s_m > e_m
        s_yr, e_yr = (start_year - 1, end_year) if cross else (start_year, end_year)
        last_day = calendar.monthrange(e_yr, e_m)[1]
        month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        return f"{s_yr}-{s_m:02d}-01", f"{e_yr}-{e_m:02d}-{last_day:02d}", s_m, e_m, f"Custom ({month_names[s_m-1]} - {month_names[e_m-1]})"

    return f"{start_year}-03-01", f"{end_year}-06-30", 3, 6, "Season B"


def _build_vhi_image(aoi_config, start_year, end_year, season="season_b", start_month=None, end_month=None, start_date=None, end_date=None):
    aoi = get_aoi_geometry(aoi_config)
    geometry = aoi
    is_global = False
    try:
        geom_str = str(geometry.serialize())
        if "-180" in geom_str and "180" in geom_str and "90" in geom_str and "-90" in geom_str:
            is_global = True
    except: pass

    if not is_global:
        try: geometry = geometry.simplify(maxError=100)
        except: pass

    season_start, season_end, s_month, e_month, season_label = resolve_season_dates(start_year, end_year, season, start_month, end_month, start_date, end_date)
    
    # Check cache
    project_id = get_gee_status()["project_id"]
    is_cacheable = aoi_config.get("type") in ["admin", "district", "province", "world"]
    asset_id = None
    config_hash = None
    
    if is_cacheable:
        config_dict = {
            "aoi": aoi_config, "sy": start_year, "ey": end_year,
            "sz": season, "sm": start_month, "em": end_month,
            "sd": start_date, "ed": end_date
        }
        config_hash = hashlib.md5(json.dumps(config_dict, sort_keys=True).encode()).hexdigest()[:10]
        asset_id = f"projects/{project_id}/assets/AutoCache_AgriDrought_{start_year}_{end_year}_{config_hash}"
        
        try:
            ee.data.getAsset(asset_id)
            print(f"[+] CACHE HIT: Loading {asset_id} from GEE Assets!")
            cached_img = ee.Image(asset_id)
            vhi = cached_img.select("VHI")
            vci = cached_img.select("VCI")
            tci = cached_img.select("TCI")
            water_mask = cached_img.select("water_mask")
            return vhi, vci, tci, water_mask, geometry, is_global, season_label
        except Exception:
            pass

    # No Cache - Compute VHI!
    # 1. Vegetation (MOD13Q1)
    modis_ndvi = ee.ImageCollection("MODIS/061/MOD13Q1").select("NDVI")
    
    def filter_season(col, sm, em):
        if sm <= em:
            return col.filter(ee.Filter.calendarRange(sm, em, 'month'))
        else:
            return col.filter(ee.Filter.Or(
                ee.Filter.calendarRange(sm, 12, 'month'),
                ee.Filter.calendarRange(1, em, 'month')
            ))
            
    historical_ndvi = filter_season(modis_ndvi, s_month, e_month)
    ndvi_min = historical_ndvi.min().multiply(0.0001)
    ndvi_max = historical_ndvi.max().multiply(0.0001)
    
    current_ndvi = modis_ndvi.filterDate(season_start, season_end).mean().multiply(0.0001)
    
    # Vegetation Condition Index (VCI)
    vci = current_ndvi.subtract(ndvi_min).divide(ndvi_max.subtract(ndvi_min)).multiply(100).clamp(0, 100).rename("VCI")
    
    # 2. Temperature (MOD11A2)
    modis_lst = ee.ImageCollection("MODIS/061/MOD11A2").select("LST_Day_1km")
    historical_lst = filter_season(modis_lst, s_month, e_month)
    lst_min = historical_lst.min().multiply(0.02).subtract(273.15)
    lst_max = historical_lst.max().multiply(0.02).subtract(273.15)
    
    current_lst = modis_lst.filterDate(season_start, season_end).mean().multiply(0.02).subtract(273.15)
    
    # Temperature Condition Index (TCI)
    tci = lst_max.subtract(current_lst).divide(lst_max.subtract(lst_min)).multiply(100).clamp(0, 100).rename("TCI")
    
    # 3. Vegetation Health Index (VHI)
    vhi = vci.multiply(0.5).add(tci.multiply(0.5)).rename("VHI")
    
    # Exclude Water
    gsw = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence")
    if is_global:
        water_mask = gsw.gte(50).unmask(0)
    else:
        lc = ee.ImageCollection("ESA/WorldCover/v200").first()
        water_mask = gsw.gte(50).unmask(0).Or(lc.eq(80)).Or(lc.eq(90))
        
    vhi = vhi.updateMask(water_mask.Not()).unmask(50).clamp(0, 100).rename("VHI").updateMask(water_mask.Not())
    
    if not is_global:
        vhi = vhi.clip(geometry)
        vci = vci.clip(geometry)
        tci = tci.clip(geometry)
        
    # Save cache
    if is_cacheable and asset_id:
        try:
            print(f"[*] CACHE MISS: Triggering background export for {asset_id}")
            export_img = ee.Image.cat([vhi, vci, tci, water_mask.rename("water_mask")])
            scale = 10000 if is_global else (get_dynamic_scale(geometry) or 1000)
            task = ee.batch.Export.image.toAsset(
                image=export_img.toFloat(),
                description=f"AutoCache_AgriDrought_{start_year}_{end_year}_{config_hash}",
                assetId=asset_id,
                region=geometry.bounds(),
                scale=scale,
                maxPixels=1e13
            )
            task.start()
        except Exception as e:
            print(f"[!] Background caching failed: {e}")

    return vhi, vci, tci, water_mask, geometry, is_global, season_label

# VHI palette: Low VHI (0-40) means Severe Drought (Red), High VHI (>40) means No Drought (Green)
VHI_PALETTE = ["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"]
VHI_VIS = {"min": 0, "max": 100, "palette": VHI_PALETTE}

def compute_drought_map(aoi_config, start_year, end_year, season="season_b", start_month=None, end_month=None, start_date=None, end_date=None):
    cache_key = ("map", json.dumps(aoi_config, sort_keys=True), start_year, end_year, season, start_month, end_month, start_date, end_date)
    with _get_key_lock(cache_key):
        if cache_key in _cache: return _cache[cache_key]

        vhi, vci, tci, water_mask, geometry, is_global, season_label = _build_vhi_image(aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date)
        
        smoothed = vhi.focal_mean(150, 'circle', 'meters').updateMask(water_mask.Not())
        if not is_global: smoothed = smoothed.clip(geometry)
            
        with gee_semaphore:
            map_id = _safe_gee_call(lambda: smoothed.getMapId(VHI_VIS))
            
        res = {
            "tile_url": map_id["tile_fetcher"].url_format,
            "season_label": season_label
        }
        _cache[cache_key] = res
        return res

def compute_drought_stats(aoi_config, start_year, end_year, season="season_b", start_month=None, end_month=None, start_date=None, end_date=None):
    cache_key = ("stats", json.dumps(aoi_config, sort_keys=True), start_year, end_year, season, start_month, end_month, start_date, end_date)
    with _get_key_lock(cache_key):
        if cache_key in _cache: return _cache[cache_key]

        vhi, vci, tci, water_mask, geometry, is_global, season_label = _build_vhi_image(aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date)
        
        calc_geom = ee.Geometry.Rectangle([-180, -89, 180, 89], "EPSG:4326", False) if is_global else geometry.bounds(maxError=1000)
        scale = get_dynamic_scale(geometry)
        
        with gee_semaphore:
            stats = _safe_gee_call(lambda: safe_get_info(vhi.reduceRegion(
                reducer=ee.Reducer.mean().combine(ee.Reducer.min(), sharedInputs=True).combine(ee.Reducer.max(), sharedInputs=True),
                geometry=calc_geom, scale=scale, maxPixels=1e10
            )))
        
        res = {
            "Mean VHI": round(stats.get("VHI_mean", 0) or 0, 1),
            "Min VHI": round(stats.get("VHI_min", 0) or 0, 1),
            "Max VHI": round(stats.get("VHI_max", 0) or 0, 1),
        }
        _cache[cache_key] = res
        return res

def compute_drought_classify(aoi_config, start_year, end_year, season="season_b", start_month=None, end_month=None, start_date=None, end_date=None, n_classes=5, method="natural_breaks", custom_labels=None):
    cache_key = ("classify", json.dumps(aoi_config, sort_keys=True), start_year, end_year, season, start_month, end_month, start_date, end_date, n_classes, method, tuple(custom_labels) if custom_labels else None)
    with _get_key_lock(cache_key):
        if cache_key in _cache: return _cache[cache_key]

        vhi, vci, tci, water_mask, geometry, is_global, season_label = _build_vhi_image(aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date)
        
        default_labels = ["Extreme Drought", "Severe Drought", "Moderate Drought", "Mild Drought", "No Drought"]
        labels = custom_labels if custom_labels and len(custom_labels) == n_classes else default_labels[:n_classes]
        
        with gee_semaphore:
            res = _safe_gee_call(lambda: quantile_classify(
                layers=[
                    {"name": "VHI", "image": vhi, "title": f"Vegetation Health Index ({season_label})"},
                    {"name": "VCI", "image": vci, "title": "Vegetation Condition Index (VCI)"},
                    {"name": "TCI", "image": tci, "title": "Temperature Condition Index (TCI)"},
                ],
                aoi=geometry, scale=get_dynamic_scale(geometry), n_classes=n_classes,
                method=method, custom_labels=labels,
                water_mask=water_mask, custom_palette=VHI_PALETTE
            ))
        _cache[cache_key] = res
        return res
