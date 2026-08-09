"""Irrigation Scheduling Advisor — FastAPI backend."""
import json
import ee
from cachetools import TTLCache
from threading import Lock

_cache_map: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_stats: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_export: TTLCache = TTLCache(maxsize=64, ttl=3600)
_lock = Lock()

# Crop Coefficient (Kc) Lookup Table
CROP_KC = {
    "Maize": 1.2,
    "Beans": 1.05,
    "Potatoes": 1.1,
    "Rice": 1.2,
    "Coffee": 0.95,
    "Tea": 0.95,
    "Generic": 1.0
}

_DEFICIT_VIS = {"min": -20, "max": 20, "palette": ["#0000ff", "#a3ccff", "#ffffff", "#ff9999", "#ff0000"]}
_ET_VIS = {"min": 0, "max": 30, "palette": ["#ffffcc", "#c2e699", "#78c679", "#31a354", "#006837"]}
_PRECIP_VIS = {"min": 0, "max": 50, "palette": ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"]}
_SM_VIS = {"min": 0, "max": 25, "palette": ["#fff5f0", "#fcbba1", "#fb6a4a", "#cb181d", "#67000d"]}

def _build_irrigation_images(aoi_config: dict, start_date: str, end_date: str, crop_type: str):
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    
    kc = CROP_KC.get(crop_type, 1.0)

    # 1. Potential Evapotranspiration (PET) from MODIS (8-day, 500m)
    # MOD16A2 PET is scaled by 0.1 to get mm/8days
    pet_col = ee.ImageCollection("MODIS/061/MOD16A2").filterDate(start_date, end_date).select("PET")
    pet_total = pet_col.sum().multiply(0.1).clip(aoi).rename("pet")
    
    # Calculate Crop ET (ETc) = PET * Kc
    etc = pet_total.multiply(kc).rename("etc")

    # 2. Precipitation from CHIRPS (Daily, 5km)
    precip_col = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate(start_date, end_date)
    precip_total = precip_col.sum().clip(aoi).rename("precip")

    # 3. Surface Soil Moisture (SSM) from NASA_USDA (3-day, 10km)
    sm_col = ee.ImageCollection("NASA_USDA/HSL/SMAP10KM_soil_moisture").filterDate(start_date, end_date).select("ssm")
    sm_mean = sm_col.mean().clip(aoi).rename("sm")

    # 4. Irrigation Deficit (mm)
    # Deficit = ETc - Precip
    # If Deficit > 0, field needs water. If < 0, surplus rainfall.
    deficit = etc.subtract(precip_total).rename("deficit")
    
    return aoi, deficit, etc, precip_total, sm_mean, kc


def compute_irrigation_map(
    aoi_config: dict, start_date: str, end_date: str, crop_type: str
) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_date, end_date, crop_type)
    
    with _lock:
        if cache_key in _cache_map:
            return _cache_map[cache_key]

    aoi, deficit, etc, precip, sm, kc = _build_irrigation_images(aoi_config, start_date, end_date, crop_type)
    
    map_id = deficit.getMapId(_DEFICIT_VIS)
    etc_id = etc.getMapId(_ET_VIS)
    precip_id = precip.getMapId(_PRECIP_VIS)
    sm_id = sm.getMapId(_SM_VIS)

    centroid = aoi.centroid(maxError=100).coordinates().getInfo()
    bounds = aoi.bounds().getInfo()["coordinates"][0]

    factor_maps = {
        "etc": {"tile_url": etc_id["tile_fetcher"].url_format},
        "precip": {"tile_url": precip_id["tile_fetcher"].url_format},
        "sm": {"tile_url": sm_id["tile_fetcher"].url_format},
    }

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "factor_maps": factor_maps,
        "center": [centroid[1], centroid[0]],
        "bbox": bounds,
    }

    with _lock:
        _cache_map[cache_key] = result
    return result


def compute_irrigation_stats(
    aoi_config: dict, start_date: str, end_date: str, crop_type: str
) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_date, end_date, crop_type)
    
    with _lock:
        if cache_key in _cache_stats:
            return _cache_stats[cache_key]

    aoi, deficit, etc, precip, sm, kc = _build_irrigation_images(aoi_config, start_date, end_date, crop_type)

    # Calculate regional means
    mean_reducer = ee.Reducer.mean()
    
    def get_mean(img):
        res = img.reduceRegion(reducer=mean_reducer, geometry=aoi, scale=1000, maxPixels=1e9).getInfo()
        if not res: return 0.0
        vals = list(res.values())
        return vals[0] if vals and vals[0] is not None else 0.0

    mean_deficit = get_mean(deficit)
    mean_etc = get_mean(etc)
    mean_precip = get_mean(precip)
    mean_sm = get_mean(sm)

    # Generate Recommendation
    if mean_deficit > 5:
        recommendation = f"Field needs ~{round(mean_deficit)}mm irrigation."
        status = "irrigate"
    elif mean_deficit > 0:
        recommendation = "Monitor field. Slight moisture deficit."
        status = "monitor"
    else:
        recommendation = "Skip irrigation, sufficient soil moisture/rainfall."
        status = "skip"

    result = {
        "mean_deficit_mm": round(mean_deficit, 2),
        "mean_etc_mm": round(mean_etc, 2),
        "mean_precip_mm": round(mean_precip, 2),
        "mean_sm_mm": round(mean_sm, 2),
        "recommendation": recommendation,
        "status": status,
        "kc_used": kc
    }

    with _lock:
        _cache_stats[cache_key] = result
    return result


def compute_irrigation_export(
    aoi_config: dict, start_date: str, end_date: str, crop_type: str
) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_date, end_date, crop_type)
    
    with _lock:
        if cache_key in _cache_export:
            return _cache_export[cache_key]

    aoi, deficit, etc, precip, sm, kc = _build_irrigation_images(aoi_config, start_date, end_date, crop_type)

    def safe_url(img, name):
        try:
            return img.getDownloadURL({"name": name, "scale": 1000, "region": aoi.bounds(), "format": "GEO_TIFF"})
        except Exception:
            return None

    def safe_thumb(img, vis):
        try:
            return img.getThumbURL({**vis, "region": aoi.bounds(), "dimensions": 512, "format": "png"})
        except Exception:
            return None

    result = {
        "download_url": safe_url(deficit, "Irrigation_Deficit"),
        "thumb_url": safe_thumb(deficit, _DEFICIT_VIS),
        "factors": {
            "etc": {
                "download_url": safe_url(etc, "ETc"),
                "thumb_url": safe_thumb(etc, _ET_VIS)
            },
            "precip": {
                "download_url": safe_url(precip, "Precipitation"),
                "thumb_url": safe_thumb(precip, _PRECIP_VIS)
            },
            "sm": {
                "download_url": safe_url(sm, "Soil_Moisture"),
                "thumb_url": safe_thumb(sm, _SM_VIS)
            }
        }
    }

    with _lock:
        _cache_export[cache_key] = result
    return result
