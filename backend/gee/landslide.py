import json
"""Landslide Susceptibility Index — refactored for decoupled API."""
import math
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
from threading import Lock, BoundedSemaphore
import concurrent.futures
from gee.classify_utils import quantile_classify, get_jenks_breaks

LITHOLOGY_ASSET = "projects/ee-petersonyang87/assets/litodoloy"

WEIGHTS = {
    "slope": 0.25, "rainfall": 0.20, "lithology": 0.12,
    "soiltype": 0.12, "ndvi": 0.09, "twi": 0.07, "dist_roads": 0.05, "dist_rivers": 0.10
}

gee_semaphore = BoundedSemaphore(5)

LSI_VIS = {"min": 1, "max": 5, "palette": ["#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027"]}
LSI_CLASS_NAMES = ["Very Low", "Low", "Moderate", "High", "Very High"]

_cache_map: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_stats: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_classify: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_export: TTLCache = TTLCache(maxsize=64, ttl=3600)
_cache_build: TTLCache = TTLCache(maxsize=64, ttl=3600)
_lock = Lock()

def _build_lsi_images(
    aoi_config: dict,
    start_year: int,
    end_year: int,
    reverse_slope: bool,
    reverse_rainfall: bool,
    reverse_litho: bool,
    reverse_soiltype: bool,
    reverse_landcover: bool,
    reverse_twi: bool,
    reverse_dist: bool,
    weights: dict = None,
):
    w = weights or WEIGHTS
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_year, end_year,
        reverse_slope, reverse_rainfall, reverse_litho, reverse_soiltype,
        reverse_landcover, reverse_twi, reverse_dist, json.dumps(w, sort_keys=True)
    )
    is_first = False
    with _lock:
        if cache_key in _cache_build:
            cached = _cache_build[cache_key]
        else:
            cached = concurrent.futures.Future()
            _cache_build[cache_key] = cached
            is_first = True

    if not is_first:
        return cached.result()

    try:
        from gee.aoi_utils import get_aoi_geometry
        aoi = get_aoi_geometry(aoi_config)

        lithology_img = ee.Image(LITHOLOGY_ASSET).clip(aoi)
        dem = ee.Image("USGS/SRTMGL1_003").select("elevation").clip(aoi)
        slope = ee.Terrain.slope(dem)
        flow_acc = ee.Image("WWF/HydroSHEDS/15ACC").clip(aoi)
        slope_rad = slope.multiply(math.pi / 180)
        twi = flow_acc.add(1).log().subtract(slope_rad.tan().add(0.001).log()).rename("TWI")

        n_years = max(1, end_year - start_year + 1)
        rainfall = (
            ee.ImageCollection("UCSB-CHG/CHIRPS/PENTAD")
            .filterDate(f"{start_year}-01-01", f"{end_year + 1}-01-01")
            .filterBounds(aoi).select("precipitation")
            .sum().divide(n_years).clip(aoi).rename("rainfall")
        )

        landcover = ee.Image("ESA/WorldCover/v200/2021").select("Map").clip(aoi)
        soiltype = ee.Image("ISDASOIL/Africa/v1/texture_class").select("texture_0_20").clip(aoi)

        roads = ee.FeatureCollection("projects/sat-io/open-datasets/GRIP4/Africa").filterBounds(aoi)
        dist_roads = roads.distance(searchRadius=20000, maxError=500).clip(aoi).rename("dist_roads")

        # NDVI (Dynamic Vegetation)
        if start_year >= 2016:
            s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterDate(f"{start_year}-01-01", f"{end_year + 1}-01-01").filterBounds(aoi).median()
            ndvi = s2.normalizedDifference(["B8", "B4"]).rename("ndvi")
        else:
            l8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2").filterDate(f"{start_year}-01-01", f"{end_year + 1}-01-01").filterBounds(aoi).median()
            ndvi = l8.normalizedDifference(["SR_B5", "SR_B4"]).rename("ndvi")
            
        # Rivers (HydroSHEDS Free Flowing Rivers)
        rivers = ee.FeatureCollection("WWF/HydroSHEDS/v1/FreeFlowingRivers").filterBounds(aoi)
        dist_rivers = rivers.distance(searchRadius=20000, maxError=500).clip(aoi).rename("dist_rivers")

        scale = get_dynamic_scale(aoi)
        continuous_bands = ee.Image.cat([
            slope.rename("slope"), 
            rainfall.rename("rainfall"), 
            twi.rename("twi"), 
            dist_roads.rename("dist_roads"),
            dist_rivers.rename("dist_rivers"),
            ndvi.rename("ndvi")
        ])
        
        scale_hist = scale * 2 if scale else 100
        hist_raw = continuous_bands.reduceRegion(
            reducer=ee.Reducer.autoHistogram(maxBuckets=50),
            geometry=aoi,
            scale=scale_hist,
            maxPixels=10000, bestEffort=True,
        ).getInfo()

        def apply_jenks(img, name, reverse_jenks=False, n=5):
            hist = hist_raw.get(name) or []
            bps = get_jenks_breaks(hist, n)
            while len(bps) < n - 1:
                bps.append(bps[-1] + 0.001 if bps else 1.0)
            bps = bps[:n-1]
            
            cls = ee.Image(1)
            for i, bp in enumerate(bps):
                cls = cls.where(img.gt(bp), i + 2)
                
            if reverse_jenks:
                cls = ee.Image(n + 1).subtract(cls)
                
            return cls.clip(aoi).rename(f"{name}_r")

        slope_r = apply_jenks(slope, "slope")
        rainfall_r = apply_jenks(rainfall, "rainfall")
        twi_r = apply_jenks(twi, "twi")
        dist_r = apply_jenks(dist_roads, "dist_roads", reverse_jenks=True)
        dist_riv_r = apply_jenks(dist_rivers, "dist_rivers", reverse_jenks=True)
        ndvi_r = apply_jenks(ndvi, "ndvi", reverse_jenks=True)  # Higher NDVI = lower risk

        landcover_r = (
            ee.Image(1).where(landcover.eq(10), 1).where(landcover.eq(80), 1)
            .where(landcover.eq(20), 2).where(landcover.eq(90), 2)
            .where(landcover.eq(30), 3).where(landcover.eq(50), 3)
            .where(landcover.eq(40), 4).where(landcover.eq(60), 5)
            .clip(aoi).rename("landcover_r")
        )
        litho_r = lithology_img.remap([1,2,3,4,5,6,7,8,9,10], [3,4,5,2,1,3,4,2,5,1], 1).clip(aoi).rename("litho_r")
        soiltype_r = soiltype.remap([1,2,3,4,5,6,7,8,9,10,11,12], [4,4,3,3,2,3,4,5,5,2,2,1], 1).clip(aoi).rename("soiltype_r")

        if reverse_slope: slope_r = ee.Image(6).subtract(slope_r).rename("slope_r")
        if reverse_rainfall: rainfall_r = ee.Image(6).subtract(rainfall_r).rename("rainfall_r")
        if reverse_litho: litho_r = ee.Image(6).subtract(litho_r).rename("litho_r")
        if reverse_soiltype: soiltype_r = ee.Image(6).subtract(soiltype_r).rename("soiltype_r")
        if reverse_landcover: landcover_r = ee.Image(6).subtract(landcover_r).rename("landcover_r")
        if reverse_twi: twi_r = ee.Image(6).subtract(twi_r).rename("twi_r")
        if reverse_dist: dist_r = ee.Image(6).subtract(dist_r).rename("dist_r")

        lsi = (
            litho_r.multiply(w.get("lithology", 0)).add(soiltype_r.multiply(w.get("soiltype", 0)))
            .add(slope_r.multiply(w.get("slope", 0))).add(rainfall_r.multiply(w.get("rainfall", 0)))
            .add(landcover_r.multiply(w.get("landcover", 0))).add(twi_r.multiply(w.get("twi", 0)))
            .add(dist_r.multiply(w.get("dist_roads", 0))).add(dist_riv_r.multiply(w.get("dist_rivers", 0)))
            .add(ndvi_r.multiply(w.get("ndvi", 0))).rename("LSI")
        )

        lsi_hist = lsi.reduceRegion(
            reducer=ee.Reducer.autoHistogram(maxBuckets=50),
            geometry=aoi,
            scale=scale_hist,
            maxPixels=10000, bestEffort=True,
        ).getInfo()

        lsi_hist_data = lsi_hist.get("LSI", [])
        bps_lsi = get_jenks_breaks(lsi_hist_data, 5)
        while len(bps_lsi) < 4:
            bps_lsi.append(bps_lsi[-1] + 0.001 if bps_lsi else 1.0)
        bps_lsi = bps_lsi[:4]
        
        lsi_class = ee.Image(1)
        for i, bp in enumerate(bps_lsi):
            lsi_class = lsi_class.where(lsi.gt(bp), i + 2)
        lsi_class = lsi_class.clip(aoi).rename("LSI_class")

        factors = {
            "slope": slope_r,
            "rainfall": rainfall_r,
            "lithology": litho_r,
            "soiltype": soiltype_r,
            "landcover": landcover_r,
            "ndvi": ndvi_r,
            "twi": twi_r,
            "dist_roads": dist_r,
            "dist_rivers": dist_riv_r,
        }

        raw_factors = {
            "slope": slope,
            "rainfall": rainfall,
            "ndvi": ndvi,
            "twi": twi,
            "dist_roads": dist_roads,
            "dist_rivers": dist_rivers,
            "lithology": lithology_img,
            "soiltype": soiltype,
            "landcover": landcover,
        }

        res = (aoi, lsi, lsi_class, factors, raw_factors)
        try:
            cached.set_result(res)
        except concurrent.futures.InvalidStateError:
            pass
        return res
    except Exception as e:
        with _lock:
            _cache_build.pop(cache_key, None)
        try:
            cached.set_exception(e)
        except concurrent.futures.InvalidStateError:
            pass
        raise e


def compute_landslide_map(
    aoi_config: dict, start_year: int = 2019, end_year: int = 2024,
    reverse_slope: bool = False, reverse_rainfall: bool = False, reverse_litho: bool = False,
    reverse_soiltype: bool = False, reverse_landcover: bool = False, reverse_twi: bool = False,
    reverse_dist: bool = False, custom_palettes: dict = None, weights: dict = None
) -> dict:
    if custom_palettes is None: custom_palettes = {}
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_year, end_year,
        reverse_slope, reverse_rainfall, reverse_litho, reverse_soiltype,
        reverse_landcover, reverse_twi, reverse_dist, json.dumps(custom_palettes, sort_keys=True)
    )
    with _lock:
        if cache_key in _cache_map:
            return _cache_map[cache_key]

    aoi, lsi, lsi_class, factors, raw_factors = _build_lsi_images(
        aoi_config, start_year, end_year, reverse_slope, reverse_rainfall,
        reverse_litho, reverse_soiltype, reverse_landcover, reverse_twi, reverse_dist, weights=weights
    )

    with gee_semaphore:
        try:
            lsi_map_id = lsi.getMapId(LSI_VIS)
            lsi_class_map_id = lsi_class.getMapId({**LSI_VIS, "min": 1, "max": 5})
        except ee.EEException as e:
            if "Memory limit" in str(e) or "User memory limit" in str(e):
                raise ValueError("The selected region is too large or complex for real-time visualization. Please select a smaller area.") from e
            raise
    
    factor_maps = {}
    for key, img in factors.items():
        palette = custom_palettes.get(key, LSI_VIS["palette"])
        vis = {"min": 1, "max": 5, "palette": palette}
        with gee_semaphore:
            try:
                factor_maps[key] = {
                    "tile_url": img.getMapId(vis)["tile_fetcher"].url_format
                }
            except ee.EEException:
                pass

    centroid = aoi.centroid(maxError=100).coordinates().getInfo()
    bounds = aoi.bounds().getInfo()["coordinates"][0]

    result = {
        "lsi_tile_url": lsi_class_map_id["tile_fetcher"].url_format,
        "lsi_class_tile_url": lsi_class_map_id["tile_fetcher"].url_format,
        "factor_maps": factor_maps,
        "center": [centroid[1], centroid[0]],
        "bbox": bounds,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
        "start_year": start_year,
        "end_year": end_year,
    }
    with _lock:
        _cache_map[cache_key] = result
    return result


def compute_landslide_stats(
    aoi_config: dict, start_year: int = 2019, end_year: int = 2024,
    reverse_slope: bool = False, reverse_rainfall: bool = False, reverse_litho: bool = False,
    reverse_soiltype: bool = False, reverse_landcover: bool = False, reverse_twi: bool = False,
    reverse_dist: bool = False, weights: dict = None
) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_year, end_year,
        reverse_slope, reverse_rainfall, reverse_litho, reverse_soiltype,
        reverse_landcover, reverse_twi, reverse_dist
    )
    with _lock:
        if cache_key in _cache_stats:
            return _cache_stats[cache_key]

    aoi, lsi, lsi_class, factors, raw_factors = _build_lsi_images(
        aoi_config, start_year, end_year, reverse_slope, reverse_rainfall,
        reverse_litho, reverse_soiltype, reverse_landcover, reverse_twi, reverse_dist, weights=weights
    )

    class_area_bands = ee.Image.cat(
        [lsi_class.eq(i + 1).multiply(ee.Image.pixelArea()).rename(f"c{i}") for i in range(5)]
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_stats = executor.submit(
            lambda: lsi.reduceRegion(
                reducer=ee.Reducer.mean().combine(ee.Reducer.min(), sharedInputs=True)
                .combine(ee.Reducer.max(), sharedInputs=True).combine(ee.Reducer.stdDev(), sharedInputs=True),
                geometry=aoi, scale=get_dynamic_scale(aoi), maxPixels=1e10,
            ).getInfo()
        )
        f_area = executor.submit(
            lambda: class_area_bands.reduceRegion(
                reducer=ee.Reducer.sum(), geometry=aoi, scale=get_dynamic_scale(aoi), maxPixels=1e10,
            ).getInfo()
        )
        stats_raw = f_stats.result()
        class_area_dict = f_area.result()

    class_areas = {
        lbl: round((class_area_dict.get(f"c{i}", 0) or 0) / 1e6, 2)
        for i, lbl in enumerate(LSI_CLASS_NAMES)
    }

    result = {
        "stats": {
            "Mean LSI": round(stats_raw.get("LSI_mean") or 0, 3),
            "Min LSI": round(stats_raw.get("LSI_min") or 0, 3),
            "Max LSI": round(stats_raw.get("LSI_max") or 0, 3),
            "Std Dev": round(stats_raw.get("LSI_stdDev") or 0, 3),
        },
        "class_areas_km2": class_areas,
    }
    with _lock:
        _cache_stats[cache_key] = result
    return result


def compute_landslide_classify(
    aoi_config: dict, start_year: int = 2019, end_year: int = 2024, n_classes: int = 5,
    reverse_slope: bool = False, reverse_rainfall: bool = False, reverse_litho: bool = False,
    reverse_soiltype: bool = False, reverse_landcover: bool = False, reverse_twi: bool = False,
    reverse_dist: bool = False, method: str = "natural_breaks", custom_labels: list = None,
    weights: dict = None
) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_year, end_year, n_classes,
        reverse_slope, reverse_rainfall, reverse_litho, reverse_soiltype,
        reverse_landcover, reverse_twi, reverse_dist, method, tuple(custom_labels) if custom_labels else None
    )
    with _lock:
        if cache_key in _cache_classify:
            return _cache_classify[cache_key]

    aoi, lsi, lsi_class, factors, raw_factors = _build_lsi_images(
        aoi_config, start_year, end_year, reverse_slope, reverse_rainfall,
        reverse_litho, reverse_soiltype, reverse_landcover, reverse_twi, reverse_dist, weights=weights
    )

    n_classes = 5
    layers = [
        {"name": "LSI", "image": lsi, "title": "Landslide Susceptibility Index"},
        {"name": "Slope", "image": raw_factors["slope"], "title": "Slope (Degrees)"},
        {"name": "Rainfall", "image": raw_factors["rainfall"], "title": "Rainfall (mm/day)"},
        {"name": "TWI", "image": raw_factors["twi"], "title": "Topographic Wetness Index"},
        {"name": "DistanceToRoads", "image": raw_factors["dist_roads"], "title": "Distance to Roads (m)"},
        {"name": "DistanceToRivers", "image": raw_factors["dist_rivers"], "title": "Distance to Rivers (m)"},
        {"name": "Lithology", "image": factors["lithology"], "title": "Lithology Risk Class"},
        {"name": "SoilType", "image": factors["soiltype"], "title": "Soil Type Risk Class"},
        {"name": "Landcover", "image": factors["landcover"], "title": "Land Cover Risk Class"},
        {"name": "NDVI", "image": raw_factors["ndvi"], "title": "NDVI"},
    ]
    classify = quantile_classify(
        layers=layers,
        aoi=aoi, scale=get_dynamic_scale(aoi), n_classes=n_classes,
        custom_labels=custom_labels or LSI_CLASS_NAMES,
        method=method
    )

    result = {
        "classify": classify,
    }
    with _lock:
        _cache_classify[cache_key] = result
    return result


def compute_landslide_export(
    aoi_config: dict, start_year: int = 2019, end_year: int = 2024,
    reverse_slope: bool = False, reverse_rainfall: bool = False, reverse_litho: bool = False,
    reverse_soiltype: bool = False, reverse_landcover: bool = False, reverse_twi: bool = False,
    reverse_dist: bool = False, custom_palettes: dict = None, weights: dict = None
) -> dict:
    if custom_palettes is None: custom_palettes = {}
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_year, end_year,
        reverse_slope, reverse_rainfall, reverse_litho, reverse_soiltype,
        reverse_landcover, reverse_twi, reverse_dist, json.dumps(custom_palettes, sort_keys=True)
    )
    with _lock:
        if cache_key in _cache_export:
            return _cache_export[cache_key]

    aoi, lsi, lsi_class, factors, raw_factors = _build_lsi_images(
        aoi_config, start_year, end_year, reverse_slope, reverse_rainfall,
        reverse_litho, reverse_soiltype, reverse_landcover, reverse_twi, reverse_dist, weights=weights
    )

    factor_maps = {}
    import concurrent.futures

    def fetch_urls(key, img):
        palette = custom_palettes.get(key, LSI_VIS["palette"])
        vis = {"min": 1, "max": 5, "palette": palette, "region": aoi.bounds(), "dimensions": 800, "format": "png"}
        with gee_semaphore:
            try:
                thumb = img.getThumbURL(vis)
            except Exception as e:
                thumb = None
                print(f"[{key}] Thumb error: {e}")
            try:
                dl = img.getDownloadURL({"region": aoi.bounds(), "scale": 100, "format": "GEO_TIFF", "crs": "EPSG:4326"})
            except Exception as e:
                dl = None
                print(f"[{key}] DL error: {e}")
            return key, {"thumb_url": thumb, "download_url": dl}

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures_factors = [executor.submit(fetch_urls, k, img) for k, img in factors.items()]
        
        def safe_thumb(img, vis):
            with gee_semaphore:
                return img.getThumbURL(vis)
        
        def safe_dl(img, params):
            with gee_semaphore:
                return img.getDownloadURL(params)

        f_lsi_thumb = executor.submit(lambda: safe_thumb(lsi_class, {**LSI_VIS, "region": aoi.bounds(), "dimensions": 800, "format": "png"}))
        f_lsi_dl = executor.submit(lambda: safe_dl(lsi_class, {"region": aoi.bounds(), "scale": 100, "format": "GEO_TIFF", "crs": "EPSG:4326"}))
        f_lsi_class_thumb = executor.submit(lambda: safe_thumb(lsi_class, {**LSI_VIS, "min":1, "max":5, "region": aoi.bounds(), "dimensions": 800, "format": "png"}))

        for f in concurrent.futures.as_completed(futures_factors):
            k, urls = f.result()
            factor_maps[k] = urls

    try:
        lsi_thumb_url = f_lsi_thumb.result()
    except Exception:
        lsi_thumb_url = None
        
    try:
        lsi_download_url = f_lsi_dl.result()
    except Exception:
        lsi_download_url = None
        
    try:
        lsi_class_thumb_url = f_lsi_class_thumb.result()
    except Exception:
        lsi_class_thumb_url = None

    result = {
        "lsi_thumb_url": lsi_thumb_url,
        "lsi_download_url": lsi_download_url,
        "lsi_class_thumb_url": lsi_class_thumb_url,
        "factor_maps": factor_maps,
    }
    with _lock:
        _cache_export[cache_key] = result
    return result


def compute_landslide_susceptibility(
    district_or_aoi, start_year: int = 2019, end_year: int = 2024, n_classes: int = 5,
    reverse_slope: bool = False, reverse_rainfall: bool = False, reverse_litho: bool = False,
    reverse_soiltype: bool = False, reverse_landcover: bool = False, reverse_twi: bool = False,
    reverse_dist: bool = False, custom_palettes: dict = None,
    method: str = "natural_breaks", custom_labels: list = None, weights: dict = None
) -> dict:
    if isinstance(district_or_aoi, str):
        aoi_config = {"type": "gaul2", "country": "Rwanda", "name": district_or_aoi, "level2": district_or_aoi}
    else:
        aoi_config = district_or_aoi

    map_res = compute_landslide_map(
        aoi_config, start_year, end_year,
        reverse_slope, reverse_rainfall, reverse_litho, reverse_soiltype,
        reverse_landcover, reverse_twi, reverse_dist, custom_palettes, weights=weights
    )
    stats_res = compute_landslide_stats(
        aoi_config, start_year, end_year,
        reverse_slope, reverse_rainfall, reverse_litho, reverse_soiltype,
        reverse_landcover, reverse_twi, reverse_dist, weights=weights
    )
    classify_res = compute_landslide_classify(
        aoi_config, start_year, end_year, n_classes,
        reverse_slope, reverse_rainfall, reverse_litho, reverse_soiltype,
        reverse_landcover, reverse_twi, reverse_dist,
        method=method, custom_labels=custom_labels, weights=weights
    )
    export_res = compute_landslide_export(
        aoi_config, start_year, end_year,
        reverse_slope, reverse_rainfall, reverse_litho, reverse_soiltype,
        reverse_landcover, reverse_twi, reverse_dist, custom_palettes, weights=weights
    )

    return {
        **map_res,
        **stats_res,
        **classify_res,
        **export_res,
    }

