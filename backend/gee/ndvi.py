from gee.persistent_cache import with_cache
import json
"""NDVI computation — no Streamlit dependency. Uses in-memory TTL cache."""
import ee
from gee.persistent_cache import PersistentCache
from typing import Optional
from threading import Lock
import concurrent.futures
from gee.classify_utils import quantile_classify

RWANDA_DISTRICTS = [
    "Bugesera", "Burera", "Gakenke", "Gasabo", "Gatsibo",
    "Gicumbi", "Gisagara", "Huye", "Kamonyi", "Karongi",
    "Kayonza", "Kicukiro", "Kirehe", "Muhanga", "Musanze",
    "Ngoma", "Ngororero", "Nyabihu", "Nyagatare", "Nyamagabe",
    "Nyamasheke", "Nyanza", "Nyarugenge", "Nyaruguru", "Rubavu",
    "Ruhango", "Rulindo", "Rusizi", "Rutsiro", "Rwamagana",
]

_cache = PersistentCache(ttl=3600)
_lock = Lock()


@with_cache
def compute_ndvi(
    aoi_config: dict,
    start_date: str,
    end_date: str,
    n_classes: int = 5,
    method: str = "natural_breaks",
    custom_labels: Optional[list] = None,
) -> dict:
    """
    Compute NDVI median composite for a given district and date range.

    Returns a dict with tile_url, stats, class_areas_km2, classify, center,
    district, start_date, end_date.  Results are cached for 1 hour per unique
    (district, start_date, end_date, n_classes, method, custom_labels) combination.
    """
    labels_tuple = tuple(custom_labels) if custom_labels else None
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_date, end_date, n_classes, method, labels_tuple)

    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry, get_bounds_and_center, safe_get_info, _safe_gee_call
    aoi = get_aoi_geometry(aoi_config)
    bounds, center = get_bounds_and_center(aoi, aoi_config)
    ee_bounds = ee.Geometry.Polygon([bounds], "EPSG:4326", False)
    
    # Calculate dynamic scale based on geometry size (sq km)
    from gee.aoi_utils import get_dynamic_scale
    dynamic_scale = get_dynamic_scale(aoi, aoi_config)

    from gee.aoi_utils import get_historical_ndvi
    year = int(start_date[:4])
    median = get_historical_ndvi(aoi, year, start_date, end_date, 20, aoi_config=aoi_config)

    vis_params = {
        "min": -0.2,
        "max": 0.8,
        "palette": ["#4575b4", "#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850"],
    }
    map_id = _safe_gee_call(median.getMapId, vis_params)

    # 1. Classification (computes thresholds, classified tile, and class areas)
    classify = quantile_classify(
        layers=[{"name": "NDVI", "image": median, "title": "NDVI Vegetation Index"}],
        aoi=aoi,
        scale=dynamic_scale,
        n_classes=n_classes,
        reverse_palette=True,
        method=method,
        custom_labels=custom_labels,
    )

    # 2. Regional summary statistics
    reduction = median.reduceRegion(
        reducer=ee.Reducer.mean()
        .combine(ee.Reducer.min(), sharedInputs=True)
        .combine(ee.Reducer.max(), sharedInputs=True)
        .combine(ee.Reducer.stdDev(), sharedInputs=True),
        geometry=ee_bounds,
        scale=dynamic_scale,
        maxPixels=1e13,
        tileScale=16,
        bestEffort=True,
    )
    stats = safe_get_info(reduction) or {}

    panel = classify.get("panels", [{}])[0] if classify and classify.get("panels") else {}
    panel_areas = panel.get("areas", {})
    class_areas = panel_areas if panel_areas else {}
    thumb_url = panel.get("thumb_url")
    download_url = panel.get("download_url")

    center_lat, center_lon = center[0], center[1]

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": thumb_url,
        "download_url": download_url,
        "stats": {
            "Mean NDVI": round(stats.get("NDVI_mean") or 0, 4),
            "Min NDVI": round(stats.get("NDVI_min") or 0, 4),
            "Max NDVI": round(stats.get("NDVI_max") or 0, 4),
            "Std Dev": round(stats.get("NDVI_stdDev") or 0, 4),
        },
        "class_areas_km2": class_areas,
        "classified_areas_km2": classify.get("panels", [{}])[0].get("areas", {}),
        "classify": classify,
        "method": method,
        "n_classes": n_classes,
        "center": [center_lat, center_lon],
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
        "bbox": bounds,
        "start_date": start_date,
        "end_date": end_date,
    }

    with _lock:
        _cache[cache_key] = result

    return result
