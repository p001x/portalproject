import json
import ee
from cachetools import TTLCache
from threading import Lock
import concurrent.futures

_cache: TTLCache = TTLCache(maxsize=128, ttl=3600)
_lock = Lock()


def compute_change_detection(
    aoi_config: dict,
    before_start: str,
    before_end: str,
    after_start: str,
    after_end: str,
) -> dict:
    """
    Compute NDVI change detection for a given area between two periods.
    """
    cache_key = (json.dumps(aoi_config, sort_keys=True), before_start, before_end, after_start, after_end)

    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)

    def get_ndvi(start, end):
        s2 = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterDate(start, end)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
            .select(["B8", "B4"])
            .median()
        )
        return s2.normalizedDifference(["B8", "B4"]).rename("NDVI").clip(aoi)

    before_ndvi = get_ndvi(before_start, before_end)
    after_ndvi = get_ndvi(after_start, after_end)

    # Difference: positive means gain in vegetation, negative means loss
    diff = after_ndvi.subtract(before_ndvi).rename("NDVI_Change")

    # Visualization params for difference
    vis_params = {
        "min": -0.3,
        "max": 0.3,
        "palette": ["#d73027", "#f46d43", "#fee08b", "#d9ef8b", "#1a9850"], # Red (Loss) to Green (Gain)
    }
    map_id = diff.getMapId(vis_params)

    # Classes
    classes = {
        "Significant Loss (< -0.15)": diff.lt(-0.15),
        "Minor Loss (-0.15 to -0.05)": diff.gte(-0.15).And(diff.lt(-0.05)),
        "Stable (-0.05 to 0.05)": diff.gte(-0.05).And(diff.lt(0.05)),
        "Minor Gain (0.05 to 0.15)": diff.gte(0.05).And(diff.lt(0.15)),
        "Significant Gain (> 0.15)": diff.gte(0.15),
    }
    labels = list(classes.keys())
    area_img = ee.Image.cat(
        [classes[lbl].multiply(ee.Image.pixelArea()).rename(f"c{i}") for i, lbl in enumerate(labels)]
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        f_stats = executor.submit(
            lambda: diff.reduceRegion(
                reducer=ee.Reducer.mean()
                .combine(ee.Reducer.min(), sharedInputs=True)
                .combine(ee.Reducer.max(), sharedInputs=True)
                .combine(ee.Reducer.stdDev(), sharedInputs=True),
                geometry=aoi,
                scale=100,
                maxPixels=10000, bestEffort=True,
                tileScale=4,
            ).getInfo()
        )

        f_area = executor.submit(
            lambda: area_img.reduceRegion(
                reducer=ee.Reducer.sum(), geometry=aoi, scale=100, maxPixels=10000, bestEffort=True, tileScale=4
            ).getInfo()
        )

        f_bounds = executor.submit(
            lambda: aoi.bounds().getInfo()["coordinates"][0]
        )

        f_thumb = executor.submit(
            lambda: diff.getThumbURL({**vis_params, "region": aoi.bounds(), "dimensions": 512, "format": "png"})
        )

        f_download = executor.submit(
            lambda: diff.getDownloadURL({
                "name": "NDVI_Change",
                "region": aoi.bounds(),
                "scale": 30,
                "format": "GEO_TIFF",
                "maxPixels": 1e9
            })
        )

        stats = f_stats.result()
        area_dict = f_area.result()
        bounds = f_bounds.result()
        thumb_url = f_thumb.result()
        try:
            download_url = f_download.result()
        except Exception:
            download_url = None

    class_areas = {
        lbl: round((area_dict.get(f"c{i}", 0) or 0) / 1e6, 2)
        for i, lbl in enumerate(labels)
    }

    center_lon = (bounds[0][0] + bounds[2][0]) / 2
    center_lat = (bounds[0][1] + bounds[2][1]) / 2

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": thumb_url,
        "download_url": download_url,
        "stats": {
            "Mean Change": round(stats.get("NDVI_Change_mean") or 0, 4),
            "Max Loss": round(stats.get("NDVI_Change_min") or 0, 4),
            "Max Gain": round(stats.get("NDVI_Change_max") or 0, 4),
            "Std Dev": round(stats.get("NDVI_Change_stdDev") or 0, 4),
        },
        "class_areas_km2": class_areas,
        "center": [center_lat, center_lon],
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
        "bbox": bounds,
        "before_start": before_start,
        "before_end": before_end,
        "after_start": after_start,
        "after_end": after_end,
    }

    with _lock:
        _cache[cache_key] = result

    return result
