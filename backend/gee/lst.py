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
_cache.clear()
_lock = Lock()


def lst_image_and_aoi(aoi_config: dict, start_date: str, end_date: str):
    """Build the high-resolution, seamless Land Surface Temperature image (°C).
    Uses NASA MODIS (MOD11A1 Daily + MOD11A2 8-Day) LST as the calibrated regional baseline,
    downscaled to 30-meter resolution using SRTM topographic lapse-rate correction
    (-6.5°C / 1,000m) and Sentinel-2 / JRC optical NDWI for clean lake boundaries.
    Eliminates all Landsat orbital path seams, gaps, and artificial boundary artifacts.
    Shared with uhi.py which needs the raw ee.Image for further composition.
    """
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)

    # 1. Continuous, seam-free NASA MODIS Land Surface Temperature (Daytime)
    modis_8day = (
        ee.ImageCollection("MODIS/061/MOD11A2")
        .filterDate(start_date, end_date)
        .filterBounds(aoi)
        .select("LST_Day_1km")
    )
    modis_daily = (
        ee.ImageCollection("MODIS/061/MOD11A1")
        .filterDate(start_date, end_date)
        .filterBounds(aoi)
        .select("LST_Day_1km")
    )
    modis_col = modis_8day.merge(modis_daily)

    # Multi-year baseline fallback in case user selects a very cloudy/short window
    modis_climatology = (
        ee.ImageCollection("MODIS/061/MOD11A2")
        .filterDate("2020-01-01", "2024-12-31")
        .filterBounds(aoi)
        .select("LST_Day_1km")
        .median()
        .multiply(0.02)
        .subtract(273.15)
    )

    modis_celsius = modis_col.median().multiply(0.02).subtract(273.15)
    modis_baseline = modis_celsius.unmask(modis_climatology).resample("bicubic")

    # 2. 30m Topographic Thermal Downscaling using SRTM Digital Elevation Model
    # Atmospheric lapse rate: -6.5°C per 1,000m of elevation difference
    srtm_30m = ee.Image("USGS/SRTMGL1_003").select("elevation")
    srtm_1km = srtm_30m.focalMean(radius=1000, kernelType="circle", units="meters")
    topo_diff = srtm_30m.subtract(srtm_1km)
    lapse_correction = topo_diff.multiply(-0.0065)

    # 3. 30m Vegetation Cooling Downscaling (Sentinel-2 NDVI)
    # Dense forest/vegetation transpires and cools by up to ~3.0°C relative to bare ground/urban
    s2_col = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterDate(start_date, end_date)
        .filterBounds(aoi)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30))
    )
    s2_median = s2_col.median()
    ndvi_30m = s2_median.normalizedDifference(["B8", "B4"]).rename("NDVI").clamp(-0.2, 0.9)
    ndvi_1km = ndvi_30m.focalMean(radius=1000, kernelType="circle", units="meters")
    ndvi_diff = ndvi_30m.subtract(ndvi_1km)
    veg_cooling = ndvi_diff.multiply(-3.0)

    # High-resolution, seamless 30m LST field without any satellite swath seams
    lst_30m = modis_baseline.add(lapse_correction).add(veg_cooling).rename("LST")

    # 4. Clean Surface Water Separation (JRC Water + S2 NDWI)
    jrc_water = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence").gt(50)
    s2_ndwi = s2_median.normalizedDifference(["B3", "B8"]).rename("NDWI")
    ndwi = s2_ndwi.unmask(jrc_water.multiply(0.5)).rename("NDWI")

    # Clip strictly to AOI
    lst_final = lst_30m.clip(aoi)
    ndwi_final = ndwi.clip(aoi)

    return lst_final.rename("LST").addBands(ndwi_final.rename("NDWI")), aoi


def compute_lst(aoi_config: dict, start_date: str, end_date: str, n_classes: int = 5, method: str = "natural_breaks", custom_labels: list = None) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_date, end_date, n_classes, method, tuple(custom_labels) if custom_labels else None)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    lst_median, aoi = lst_image_and_aoi(aoi_config, start_date, end_date)

    water = lst_median.select("NDWI").gt(0)
    lst = lst_median.select("LST")
    lst_land_only = lst.updateMask(water.Not())

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
            lambda: lst_land_only.reduceRegion(
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
                layers=[{"name": "LST", "image": lst_land_only, "title": "Land Surface Temperature (°C)"}],
                aoi=aoi, scale=get_dynamic_scale(aoi), n_classes=n_classes,
                method=method, custom_labels=custom_labels, water_mask=water
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

        try:
            stats = f_stats.result()
        except Exception:
            stats = {}
            
        try:
            area_dict = f_area.result()
        except Exception:
            area_dict = {}
            
        try:
            classify = f_classify.result()
        except Exception:
            classify = {}
            
        try:
            bounds = f_bounds.result()
        except Exception:
            bounds = [[0, 0], [0, 0], [0, 0], [0, 0]]
            
        try:
            download_url = f_download.result()
        except Exception:
            download_url = None

    class_areas = {lbl: round((area_dict.get(f"c{i}", 0) or 0) / 1e6, 2) for i, lbl in enumerate(labels)}

    try:
        center = [(bounds[0][1] + bounds[2][1]) / 2, (bounds[0][0] + bounds[2][0]) / 2]
    except Exception:
        center = [0, 0]

    # Dynamic Visualization Parameters based on land statistics
    mean_val = stats.get("LST_mean") or 25
    std_val = stats.get("LST_stdDev") or 5
    vmin = mean_val - (2 * std_val)
    vmax = mean_val + (2 * std_val)

    vis_params = {
        "min": vmin, 
        "max": vmax,
        "palette": ["#313695", "#74add1", "#fee090", "#f46d43", "#a50026"]
    }

    # Overlay: land visualization (colored) + water (solid dark blue)
    lst_rgb = lst_land_only.visualize(**vis_params)
    water_rgb = water.updateMask(water).visualize(palette=["#08306b"])
    final_viz = ee.ImageCollection([lst_rgb, water_rgb]).mosaic().clip(aoi)

    map_id = final_viz.getMapId()
    thumb_url = final_viz.getThumbURL({"region": aoi.bounds(), "dimensions": 800, "format": "png"})

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": thumb_url,
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
