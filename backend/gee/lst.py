import json
"""Land Surface Temperature (LST) — no Streamlit dependency."""
import ee

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
import concurrent.futures
from gee.classify_utils import quantile_classify

_cache: TTLCache = TTLCache(maxsize=128, ttl=3600)
_lock = Lock()


def lst_image_and_aoi(aoi_config: dict, start_date: str, end_date: str):
    """Build the median LST image (°C, Landsat 9 mono-window) and the AOI geometry.
    Shared with uhi.py which needs the raw ee.Image for further composition.
    """
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)


    from gee.landsat_utils import get_harmonized_landsat_collection, gap_fill

    def apply_scale_factors(image):
        optical = image.select("SR_B.").multiply(0.0000275).add(-0.2)
        thermal = image.select("ST_B10").multiply(0.00341802).add(149.0)
        return image.addBands(optical, None, True).addBands(thermal, None, True)

    def compute_lst_image(image):
        ndvi = image.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI")
        ndwi = image.normalizedDifference(["SR_B3", "SR_B5"]).rename("NDWI")
        fvc = ndvi.subtract(0.2).divide(0.5 - 0.2).pow(2).rename("FVC")
        fvc = fvc.where(ndvi.lt(0.2), 0).where(ndvi.gt(0.5), 1)
        emissivity = fvc.multiply(0.004).add(0.986).rename("emissivity")
        thermal_k = image.select("ST_B10")
        lst_celsius = (
            thermal_k.divide(
                ee.Image(1).add(
                    ee.Image(10.895e-6)
                    .multiply(thermal_k)
                    .divide(14388)
                    .multiply(emissivity.log())
                )
            )
            .subtract(273.15)
            .rename("LST")
        )
        return lst_celsius.addBands(ndwi).copyProperties(image, ["system:time_start"])

    collection = get_harmonized_landsat_collection(start_date, end_date, aoi, max_cloud_cover=20) \
        .map(apply_scale_factors) \
        .map(compute_lst_image)
    
    if collection.size().getInfo() == 0:
        raise ValueError("No satellite imagery (Landsat 4-9) found for this area and date range with <20% cloud cover. Try expanding the date range or choosing a different area.")

    lst_median = gap_fill(collection.median()).clip(aoi)
    return lst_median, aoi


def compute_lst(aoi_config: dict, start_date: str, end_date: str, n_classes: int = 5) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_date, end_date, n_classes)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    lst_median, aoi = lst_image_and_aoi(aoi_config, start_date, end_date)

    water = lst_median.select("NDWI").gt(0)
    lst = lst_median.select("LST")

    lst_viz = lst.where(water, 10)
    vis_params = {
        "min": 10, "max": 40,
        "palette": ["#08306b", "#313695", "#74add1", "#fee090", "#f46d43", "#a50026"],
    }
    map_id = lst_viz.getMapId(vis_params)

    classes = {
        "Water (NDWI > 0)": water,
        "Cool (<20°C)": lst.lt(20).And(water.Not()),
        "Moderate (20–25°C)": lst.gte(20).And(lst.lt(25)).And(water.Not()),
        "Warm (25–30°C)": lst.gte(25).And(lst.lt(30)).And(water.Not()),
        "Hot (30–35°C)": lst.gte(30).And(lst.lt(35)).And(water.Not()),
        "Very Hot (>35°C)": lst.gte(35).And(water.Not()),
    }
    labels = list(classes.keys())
    area_img = ee.Image.cat(
        [classes[lbl].multiply(ee.Image.pixelArea()).rename(f"c{i}") for i, lbl in enumerate(labels)]
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        f_stats = executor.submit(
            lambda: lst_median.reduceRegion(
                reducer=ee.Reducer.mean()
                .combine(ee.Reducer.min(), sharedInputs=True)
                .combine(ee.Reducer.max(), sharedInputs=True)
                .combine(ee.Reducer.stdDev(), sharedInputs=True),
                geometry=aoi, scale=get_dynamic_scale(aoi), maxPixels=1e10,
            ).getInfo()
        )

        f_area = executor.submit(
            lambda: area_img.reduceRegion(
                reducer=ee.Reducer.sum(), geometry=aoi, scale=get_dynamic_scale(aoi), maxPixels=1e10
            ).getInfo()
        )

        f_classify = executor.submit(
            lambda: quantile_classify(
                layers=[{"name": "LST", "image": lst, "title": "Land Surface Temperature (°C)"}],
                aoi=aoi, scale=get_dynamic_scale(aoi), n_classes=n_classes,
            )
        )

        f_bounds = executor.submit(
            lambda: aoi.bounds().getInfo()["coordinates"][0]
        )

        f_download = executor.submit(
            lambda: lst_median.getDownloadURL({
                "name": "LST", 
                "region": aoi.bounds(), 
                "scale": 30, 
                "format": "GEO_TIFF", 
                "maxPixels": 1e9
            })
        )

        stats = f_stats.result()
        area_dict = f_area.result()
        classify = f_classify.result()
        bounds = f_bounds.result()
        try:
            download_url = f_download.result()
        except Exception:
            download_url = None

    class_areas = {lbl: round((area_dict.get(f"c{i}", 0) or 0) / 1e6, 2) for i, lbl in enumerate(labels)}

    center = [(bounds[0][1] + bounds[2][1]) / 2, (bounds[0][0] + bounds[2][0]) / 2]

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": lst_viz.getThumbURL({**vis_params, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),
        "download_url": download_url,
        "stats": {
            "Mean LST (°C)": round(stats.get("LST_mean") or 0, 2),
            "Min LST (°C)": round(stats.get("LST_min") or 0, 2),
            "Max LST (°C)": round(stats.get("LST_max") or 0, 2),
            "Std Dev": round(stats.get("LST_stdDev") or 0, 2),
        },
        "class_areas_km2": class_areas,
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
