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
    # BUST CACHE TEMPORARILY
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_date, end_date, n_classes, method, labels_tuple, "bust_cache_6")

    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry, get_bounds_and_center
    aoi = get_aoi_geometry(aoi_config)
    bounds, center = get_bounds_and_center(aoi)
    ee_bounds = ee.Geometry.Polygon(bounds, "EPSG:4326", False)
    
    # Calculate dynamic scale based on geometry size (sq km)
    from gee.aoi_utils import get_dynamic_scale
    dynamic_scale = get_dynamic_scale(aoi)    # Sector or small polygon

    from gee.aoi_utils import get_historical_ndvi
    year = int(start_date[:4])
    median = get_historical_ndvi(aoi, year, start_date, end_date, 20)

    vis_params = {
        "min": -0.2,
        "max": 0.8,
        "palette": ["#4575b4", "#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850"],
    }
    map_id = median.getMapId(vis_params)

    # Execute GEE requests concurrently
    classes = {
        "Water (<0)": median.lt(0),
        "Bare Land (0–0.1)": median.gte(0).And(median.lt(0.1)),
        "Very Low (0.1–0.2)": median.gte(0.1).And(median.lt(0.2)),
        "Low (0.2–0.4)": median.gte(0.2).And(median.lt(0.4)),
        "Moderate (0.4–0.6)": median.gte(0.4).And(median.lt(0.6)),
        "High (>0.6)": median.gte(0.6),
    }
    labels = list(classes.keys())
    area_img = ee.Image.cat(
        [classes[lbl].multiply(ee.Image.pixelArea()).rename(f"c{i}")
         for i, lbl in enumerate(labels)]
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        f_stats = executor.submit(
            lambda: median.reduceRegion(
                reducer=ee.Reducer.mean()
                .combine(ee.Reducer.min(), sharedInputs=True)
                .combine(ee.Reducer.max(), sharedInputs=True)
                .combine(ee.Reducer.stdDev(), sharedInputs=True),
                geometry=aoi.bounds(maxError=1000),
                scale=dynamic_scale,
                maxPixels=1e10,
            ).getInfo()
        )

        f_area = executor.submit(
            lambda: area_img.reduceRegion(
                reducer=ee.Reducer.sum(), geometry=aoi.bounds(maxError=1000), scale=dynamic_scale, maxPixels=1e10
            ).getInfo()
        )

        f_classify = executor.submit(
            lambda: quantile_classify(
                layers=[{"name": "NDVI", "image": median, "title": "NDVI Vegetation Index"}],
                aoi=aoi,
                scale=dynamic_scale,
                n_classes=n_classes,
                reverse_palette=True,
                method=method,
                custom_labels=custom_labels,
            )
        )

        f_thumb = executor.submit(
            lambda: median.getThumbURL({**vis_params, "region": ee_bounds, "dimensions": 512, "crs": "EPSG:4326", "format": "png"})
        )

        f_download = executor.submit(
            lambda: median.getDownloadURL({
                "name": "NDVI", 
                "region": ee_bounds, 
                "scale": dynamic_scale, 
                "format": "GEO_TIFF", 
                "crs": "EPSG:4326"
            }) if area_sqkm < 50000 else None
        )

        stats = f_stats.result()
        area_dict = f_area.result()
        classify = f_classify.result()
        try:
            thumb_url = f_thumb.result()
        except Exception:
            thumb_url = None
        try:
            download_url = f_download.result()
        except Exception:
            download_url = None

    class_areas = {
        lbl: round((area_dict.get(f"c{i}", 0) or 0) / 1e6, 2)
        for i, lbl in enumerate(labels)
    }

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
