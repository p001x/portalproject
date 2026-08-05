import json
"""Air Pollution (Sentinel-5P NO₂) — no Streamlit dependency."""
from datetime import date as _date
import ee
from cachetools import TTLCache
from threading import Lock
import concurrent.futures
from gee.classify_utils import quantile_classify

WHO_NO2_ANNUAL_THRESHOLD = 10.0

_cache: TTLCache = TTLCache(maxsize=128, ttl=3600)
_lock = Lock()


def _month_range(start_date: str, end_date: str):
    start = _date.fromisoformat(start_date)
    end = _date.fromisoformat(end_date)
    months = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        months.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months


def compute_no2(aoi_config: dict, start_date: str, end_date: str, n_classes: int = 5) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_date, end_date, n_classes)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)

    def _to_umol(img):
        return img.multiply(1e6).rename("NO2_umol_m2").copyProperties(
            img, ["system:time_start", "system:time_end"]
        )

    s5p = (
        ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2")
        .filterDate(start_date, end_date)
        .filterBounds(aoi)
        .select("tropospheric_NO2_column_number_density")
        .map(_to_umol)
    )

    collection_size = s5p.size().getInfo()
    district_name = aoi_config.get("district", aoi_config.get("name", "Custom AOI"))
    if collection_size == 0:
        raise ValueError(
            f"No Sentinel-5P NO2 imagery available for {district_name} between "
            f"{start_date} and {end_date}. Sentinel-5P data only exists from "
            f"~2018-07 onward — try a later date range."
        )

    composite = s5p.median().clip(aoi)

    vis_params = {"min": 0, "max": 200,
                  "palette": ["#000080", "#0000ff", "#00ffff", "#ffff00", "#ff0000"]}
    map_id = composite.getMapId(vis_params)

    months = _month_range(start_date, end_date)
    month_images = []
    for i, (y, m) in enumerate(months):
        band = f"m{i}"
        start_m = ee.Date.fromYMD(y, m, 1)
        end_m = start_m.advance(1, "month")
        month_collection = s5p.filterDate(start_m, end_m)
        img = ee.Image(
            ee.Algorithms.If(
                month_collection.size().gt(0),
                month_collection.mean().rename(band),
                ee.Image.constant(0).rename(band).updateMask(ee.Image.constant(0)),
            )
        )
        month_images.append(img)

    monthly_img = ee.Image.cat(month_images)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        f_stats = executor.submit(
            lambda: composite.reduceRegion(
                reducer=ee.Reducer.mean()
                .combine(ee.Reducer.max(), sharedInputs=True)
                .combine(ee.Reducer.percentile([90]), sharedInputs=True),
                geometry=aoi, scale=3500, maxPixels=1e6, bestEffort=True, tileScale=4,
            ).getInfo()
        )

        f_monthly = executor.submit(
            lambda: monthly_img.reduceRegion(
                reducer=ee.Reducer.mean(), geometry=aoi, scale=3500, maxPixels=1e6, bestEffort=True, tileScale=4
            ).getInfo()
        )

        f_classify = executor.submit(
            lambda: quantile_classify(
                layers=[{"name": "NO2_umol_m2", "image": composite, "title": "NO₂ Column (µmol/m²)"}],
                aoi=aoi, scale=3500, n_classes=n_classes,
            )
        )

        f_bounds = executor.submit(
            lambda: aoi.bounds().getInfo()["coordinates"][0]
        )

        stats = f_stats.result()
        monthly_dict = f_monthly.result()
        classify = f_classify.result()
        bounds = f_bounds.result()

    time_series = [
        {"month": m, "year": y, "NO2 (µmol/m²)": round(monthly_dict.get(f"m{i}") or 0, 2)}
        for i, (y, m) in enumerate(months)
    ]

    center = [(bounds[0][1] + bounds[2][1]) / 2, (bounds[0][0] + bounds[2][0]) / 2]
    mean_no2 = round(stats.get("NO2_umol_m2_mean") or 0, 2)

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": composite.getThumbURL({**vis_params, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),
        "stats": {
            "Mean NO2 (µmol/m²)": mean_no2,
            "Max NO2 (µmol/m²)": round(stats.get("NO2_umol_m2_max") or 0, 2),
            "P90 NO2 (µmol/m²)": round(stats.get("NO2_umol_m2_p90") or 0, 2),
            "WHO Threshold (µmol/m²)": WHO_NO2_ANNUAL_THRESHOLD,
        },
        "exceeds_who": mean_no2 > WHO_NO2_ANNUAL_THRESHOLD,
        "time_series": time_series,
        "classify": classify,
        "center": center,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
        "bbox": bounds,
        "start_date": start_date,
        "end_date": end_date,
    }
    with _lock:
        _cache[cache_key] = result
    return result
