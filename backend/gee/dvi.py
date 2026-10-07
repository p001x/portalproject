import json
"""DVI computation — AHP-Weighted Drought Vulnerability Map"""
import ee

from gee.aoi_utils import get_dynamic_scale

from gee.persistent_cache import PersistentCache
from threading import Lock
from gee.classify_utils import quantile_classify
from datetime import datetime
from dateutil.relativedelta import relativedelta
import threading
import time
import random

gee_semaphore = threading.BoundedSemaphore(5)

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

def _safe_gee_call(func, *args, **kwargs):
    from gee.auth import rotate_credentials
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

def maskL8sr(image):
    qa = image.select('QA_PIXEL')
    cloudFree = qa.bitwiseAnd(1 << 1).eq(0) \
        .And(qa.bitwiseAnd(1 << 3).eq(0)) \
        .And(qa.bitwiseAnd(1 << 4).eq(0)) \
        .And(qa.bitwiseAnd(1 << 5).eq(0))
    opt = image.select('SR_B.').multiply(0.0000275).add(-0.2)
    thermal = image.select('ST_B.*').multiply(0.00341802).add(149.0)
    return image.addBands(opt, None, True).addBands(thermal, None, True).updateMask(cloudFree)

def normInvert(img, lo, hi, name):
    return img.subtract(lo).divide(ee.Number(hi).subtract(lo)).clamp(0, 1).rename(name)

def normPositive(img, lo, hi, name):
    return ee.Image(1).subtract(img.subtract(lo).divide(ee.Number(hi).subtract(lo)).clamp(0, 1)).rename(name)

def compute_dvi(
    aoi_config: dict,
    start_date: str,
    end_date: str,
    n_classes: int = 5,
    weights: dict = None
) -> dict:
    cache_key = json.dumps([aoi_config, start_date, end_date, n_classes, weights], sort_keys=True)

def build_dvi_image(aoi_config, start_date, end_date, weights=None, corridor=None, area_sqkm=None):
    """Build the DVI image.
    
    Args:
        corridor: 'rwanda', 'global', or 'custom' — if provided, skips internal detection
        area_sqkm: pre-computed area — if provided, skips internal area calculation
    """
    from gee.aoi_utils import get_aoi_geometry
    geometry = get_aoi_geometry(aoi_config)

    # Date ranges
    seasonStart = start_date
    seasonEnd = end_date
    
    start_dt = datetime.strptime(start_date, '%Y-%m-%d')
    end_dt = datetime.strptime(end_date, '%Y-%m-%d')
    start_month = start_dt.month
    end_month = end_dt.month

    # Shorter baseline window to reduce memory pressure
    baseYearStart = 2017
    baseYearEnd = 2023

    # Use corridor context if provided (from drought.py), otherwise detect
    if corridor is not None:
        is_global = (corridor == "global")
    else:
        is_global = False
        try:
            geom_str = str(geometry.serialize())
            if "-180" in geom_str and "180" in geom_str and "90" in geom_str and "-90" in geom_str:
                is_global = True
        except: pass

    if area_sqkm is None:
        try:
            area_sqkm = geometry.bounds().area(maxError=1000).divide(1e6).getInfo() if not is_global else 999999999
        except Exception:
            area_sqkm = 999999999

    # Use MODIS-only path for areas > 20,000 sqkm (countries, global)
    # Use Landsat for small areas (districts)
    use_landsat = not (is_global or area_sqkm > 20000)

    # Use 1km MODIS (MOD13A2) for very large areas to prevent memory overflow
    modis_veg_id = "MODIS/061/MOD13A2" if (is_global or area_sqkm > 100000) else "MODIS/061/MOD13Q1"

    # --- MODIS baseline (always needed as gap-fill) ---
    # Build collections ONCE, filter by bounds ONCE
    modis_veg = ee.ImageCollection(modis_veg_id).filterBounds(geometry)
    modis_lst_col = ee.ImageCollection("MODIS/061/MOD11A2").filterBounds(geometry)

    # Current season MODIS
    modis_veg_season = modis_veg.filterDate(seasonStart, seasonEnd)
    modis_ndvi_curr = modis_veg_season.select("NDVI").median().multiply(0.0001).rename("NDVI")
    modis_evi_curr = modis_veg_season.select("EVI").median().multiply(0.0001).rename("EVI")
    modis_lst_curr = modis_lst_col.filterDate(seasonStart, seasonEnd).select("LST_Day_1km").median().multiply(0.02).subtract(273.15).rename("LST_C")

    # Baseline MODIS (seasonal filter only — much lighter than full date range)
    modis_veg_base = modis_veg.filter(
        ee.Filter.calendarRange(start_month, end_month, "month")
    ).filter(
        ee.Filter.calendarRange(baseYearStart, baseYearEnd, "year")
    )
    modis_ndvi_base_col = modis_veg_base.select("NDVI").map(lambda img: img.multiply(0.0001))
    modis_ndvi_min_base = modis_ndvi_base_col.min().rename("NDVI")
    modis_ndvi_max_base = modis_ndvi_base_col.max().rename("NDVI")

    modis_lst_base_mean = modis_lst_col.filter(
        ee.Filter.calendarRange(start_month, end_month, "month")
    ).filter(
        ee.Filter.calendarRange(baseYearStart, baseYearEnd, "year")
    ).select("LST_Day_1km").mean().multiply(0.02).subtract(273.15).rename("LST_mean")

    # Climatology fallback (all-time median — lightweight single image)
    modis_ndvi_clim = modis_veg.select("NDVI").median().multiply(0.0001)
    modis_evi_clim = modis_veg.select("EVI").median().multiply(0.0001)
    modis_lst_clim = modis_lst_col.select("LST_Day_1km").median().multiply(0.02).subtract(273.15)

    # Gap-fill MODIS with climatology
    modis_ndvi_curr = modis_ndvi_curr.unmask(modis_ndvi_clim)
    modis_evi_curr = modis_evi_curr.unmask(modis_evi_clim)
    modis_lst_curr = modis_lst_curr.unmask(modis_lst_clim)
    modis_ndvi_min_base = modis_ndvi_min_base.unmask(modis_ndvi_clim.multiply(0.5))
    modis_ndvi_max_base = modis_ndvi_max_base.unmask(modis_ndvi_clim.multiply(1.5))
    modis_lst_base_mean = modis_lst_base_mean.unmask(modis_lst_clim)

    if use_landsat:
        # Landsat 8+9 — build collection ONCE
        ls8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').filterBounds(geometry)
        ls9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2').filterBounds(geometry)
        allLS = ls8.merge(ls9)

        comp_primary = allLS.filterDate(seasonStart, seasonEnd).map(maskL8sr).median()
        # Extended window: 1 month buffer
        extStart = (start_dt - relativedelta(months=1)).strftime('%Y-%m-%d')
        extEnd = (end_dt + relativedelta(months=1)).strftime('%Y-%m-%d')
        comp_extended = allLS.filterDate(extStart, extEnd).map(maskL8sr).median()

        ls_filled = comp_primary.unmask(comp_extended)

        # Indices — NO clip on intermediates, only at end
        ls_ndvi = ls_filled.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI')
        ndvi_current = ls_ndvi.unmask(modis_ndvi_curr)

        ls_evi = ls_filled.expression(
            '2.5 * ((NIR - RED) / (NIR + 6.0 * RED - 7.5 * BLUE + 1.0))', {
                'NIR':  ls_filled.select('SR_B5'),
                'RED':  ls_filled.select('SR_B4'),
                'BLUE': ls_filled.select('SR_B2')
            }).rename('EVI')
        evi_current = ls_evi.unmask(modis_evi_curr)

        ls_lst = ls_filled.select('ST_B10').subtract(273.15).rename('LST_C')
        lst_current = ls_lst.unmask(modis_lst_curr)

        # Baseline — shorter window (2017-2023), season-filtered only
        ls_base = ls8.filter(
            ee.Filter.calendarRange(start_month, end_month, 'month')
        ).filter(
            ee.Filter.calendarRange(baseYearStart, baseYearEnd, 'year')
        ).map(maskL8sr)

        def get_ndvi(img): return img.normalizedDifference(['SR_B5','SR_B4']).rename('NDVI')
        ndvi_base = ls_base.map(get_ndvi)

        ndvi_min = ndvi_base.min().unmask(modis_ndvi_min_base)
        ndvi_max = ndvi_base.max().unmask(modis_ndvi_max_base)
        lst_base_mean = ls_base.select('ST_B10').mean().subtract(273.15).unmask(modis_lst_base_mean).rename('LST_mean')
    else:
        # MODIS-only path for large/global areas
        ndvi_current = modis_ndvi_curr
        evi_current = modis_evi_curr
        lst_current = modis_lst_curr
        ndvi_min = modis_ndvi_min_base
        ndvi_max = modis_ndvi_max_base
        lst_base_mean = modis_lst_base_mean

    # VCI
    denom = ndvi_max.subtract(ndvi_min)
    vci = ndvi_current.subtract(ndvi_min).divide(denom.where(denom.abs().lt(0.01), 0.01)).multiply(100).clamp(0, 100).rename('VCI').unmask(50.0)
    lst_anom = lst_current.subtract(lst_base_mean).rename('LST_ANOM')

    # Precipitation — use ERA5 for high latitudes, CHIRPS otherwise
    try:
        bounds_coords = geometry.bounds(maxError=1000).coordinates().get(0).getInfo()
        lats = [pt[1] for pt in bounds_coords]
        use_era5_precip = max(lats) > 50 or min(lats) < -50
    except:
        use_era5_precip = True

    if use_era5_precip:
        era_col = ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR").select("total_precipitation_sum")
        chirps_current = era_col.filterDate(seasonStart, seasonEnd).sum().multiply(1000).rename('RF_CUMUL')
        
        # Single filter instead of years.map() — much lighter computation graph
        n_months = (end_month - start_month + 1) if start_month <= end_month else (12 - start_month + 1 + end_month)
        chirps_ltm = era_col.filter(
            ee.Filter.calendarRange(start_month, end_month, 'month')
        ).filter(
            ee.Filter.calendarRange(2010, 2022, 'year')
        ).mean().multiply(1000).multiply(n_months).rename('RF_LTM')
        
        def is_dry_month(img): return img.multiply(1000).lt(10).rename('dry')
        dry_pentads = era_col.filterDate(seasonStart, seasonEnd).map(is_dry_month).sum().rename('CDD')
        
        chirps_current = chirps_current.unmask(chirps_ltm)
        dry_pentads = dry_pentads.unmask(2.0)
    else:
        chirps_col = ee.ImageCollection('UCSB-CHG/CHIRPS/PENTAD')
        chirps_current = chirps_col.filterDate(seasonStart, seasonEnd).sum().rename('RF_CUMUL')

        # Single filter instead of years.map() — much lighter computation graph
        # CHIRPS pentad gives ~6 images/month, so multiply mean by approx pentad count
        n_months = (end_month - start_month + 1) if start_month <= end_month else (12 - start_month + 1 + end_month)
        n_pentads = n_months * 6  # ~6 pentads per month
        chirps_ltm = chirps_col.filter(
            ee.Filter.calendarRange(start_month, end_month, 'month')
        ).filter(
            ee.Filter.calendarRange(2010, 2022, 'year')
        ).mean().multiply(n_pentads).rename('RF_LTM')

        def is_dry(img): return img.lt(1).rename('dry')
        dry_pentads = chirps_col.filterDate(seasonStart, seasonEnd).map(is_dry).sum().rename('CDD')
        dry_pentads = dry_pentads.unmask(2.0)
        
    rf_anom = chirps_current.subtract(chirps_ltm).rename('RF_ANOM').unmask(0.0)

    # Soil Moisture (ERA5)
    # Soil moisture — reuse era_col if ERA5 precip path was taken, otherwise create new
    sm_col = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR').select('volumetric_soil_water_layer_1')
    sm_current = sm_col.filterDate(seasonStart, seasonEnd).mean().rename('SM')
    sm_ltm = sm_col.filter(
        ee.Filter.calendarRange(start_month, end_month, 'month')
    ).filter(
        ee.Filter.calendarRange(2015, 2022, 'year')
    ).mean().rename('SM_LTM')
    sm_current = sm_current.unmask(sm_ltm)
    sm_anom = sm_current.subtract(sm_ltm).rename('SM_ANOM').unmask(0.0)

    # Normalize
    sm_norm = normPositive(sm_anom, -0.10, 0.10, 'SM_norm').unmask(0.5)
    rf_norm = normPositive(rf_anom, -250, 150, 'RF_norm').unmask(0.5)
    ndvi_norm = normPositive(ndvi_current, -0.10, 0.85, 'NDVI_norm').unmask(0.5)
    vci_norm = normPositive(vci, 0, 100, 'VCI_norm').unmask(0.5)
    lst_norm = normInvert(lst_anom, -5, 12, 'LST_norm').unmask(0.5)
    cdd_norm = normInvert(dry_pentads, 0, (4 if use_era5_precip else 12), 'CDD_norm').unmask(0.5)
    evi_norm = normPositive(evi_current, -0.10, 0.85, 'EVI_norm').unmask(0.5)

    if weights is None:
        weights = {"sm": 0.400, "rf": 0.220, "ndvi": 0.110, "vci": 0.110, "lst": 0.065, "cdd": 0.065, "evi": 0.030}

    # Normalize weights to ensure they sum to 1.0
    total_weight = sum(weights.values())
    if total_weight > 0:
        w = {k: v / total_weight for k, v in weights.items()}
    else:
        w = {"sm": 0.400, "rf": 0.220, "ndvi": 0.110, "vci": 0.110, "lst": 0.065, "cdd": 0.065, "evi": 0.030}

    # DVI — single computation, clip ONLY at the end
    DVI = sm_norm.multiply(w.get("sm", 0)) \
        .add(rf_norm.multiply(w.get("rf", 0))) \
        .add(ndvi_norm.multiply(w.get("ndvi", 0))) \
        .add(vci_norm.multiply(w.get("vci", 0))) \
        .add(lst_norm.multiply(w.get("lst", 0))) \
        .add(cdd_norm.multiply(w.get("cdd", 0))) \
        .add(evi_norm.multiply(w.get("evi", 0))) \
        .clamp(0, 1) \
        .rename('DVI')

    # Clip only at the very end
    if not is_global:
        DVI = DVI.clip(geometry)
        
    layers = [
        {"name": "DVI", "image": DVI, "title": "Drought Vulnerability Index"},
        {"name": "SM", "image": sm_norm if is_global else sm_norm.clip(geometry), "title": "Soil Moisture Norm"},
        {"name": "RF", "image": rf_norm if is_global else rf_norm.clip(geometry), "title": "Rainfall Norm"},
        {"name": "VCI", "image": vci_norm if is_global else vci_norm.clip(geometry), "title": "VCI Norm"},
        {"name": "LST", "image": lst_norm if is_global else lst_norm.clip(geometry), "title": "LST Norm"},
    ]
    return DVI, layers, geometry

def compute_dvi(
    aoi_config: dict,
    start_date: str,
    end_date: str,
    n_classes: int = 5,
    weights: dict = None
) -> dict:
    cache_key = json.dumps([aoi_config, start_date, end_date, n_classes, weights], sort_keys=True)

    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    DVI, layers, geometry = build_dvi_image(aoi_config, start_date, end_date, weights)

    vuln_class = ee.Image(0) \
        .where(DVI.lte(0.20), 1) \
        .where(DVI.gt(0.20).And(DVI.lte(0.40)), 2) \
        .where(DVI.gt(0.40).And(DVI.lte(0.60)), 3) \
        .where(DVI.gt(0.60).And(DVI.lte(0.80)), 4) \
        .where(DVI.gt(0.80), 5) \
        .rename('Vuln_Class').updateMask(DVI.mask()).clip(geometry)

    # Map URLs
    dvi_pal = ['#1a9641','#a6d96a','#ffffbf','#fdae61','#d7191c']
    class_pal = ['#1a9641','#a6d96a','#ffffbf','#fdae61','#d7191c']

    with gee_semaphore:
        dvi_map_id = _safe_gee_call(lambda: DVI.getMapId({'min': 0, 'max': 1, 'palette': dvi_pal}))
        class_map_id = _safe_gee_call(lambda: vuln_class.getMapId({'min': 1, 'max': 5, 'palette': class_pal}))

    import concurrent.futures

    scale = get_dynamic_scale(geometry, aoi_config)
    calc_geom = geometry.bounds(maxError=1000)

    class_area_bands = ee.Image.cat([vuln_class.eq(i+1).multiply(ee.Image.pixelArea()).rename(f"c{i}") for i in range(5)])

    def get_stats_and_areas():
        combined = ee.Dictionary({
            "stats": DVI.reduceRegion(
                reducer=ee.Reducer.mean().combine(ee.Reducer.min(), sharedInputs=True).combine(ee.Reducer.max(), sharedInputs=True).combine(ee.Reducer.stdDev(), sharedInputs=True),
                geometry=calc_geom,
                scale=scale, 
                maxPixels=1e10,
            ),
            "areas": class_area_bands.reduceRegion(
                reducer=ee.Reducer.sum(), geometry=calc_geom, scale=scale, maxPixels=1e10
            ),
            "bounds": geometry.bounds()
        })
        with gee_semaphore:
            return _safe_gee_call(lambda: combined.getInfo())

    def get_classify():
        with gee_semaphore:
            return _safe_gee_call(lambda: quantile_classify(
                layers=[{"name": "DVI", "image": DVI, "title": "Drought Vulnerability Index"}],
                aoi=geometry,
                scale=scale,
                n_classes=n_classes,
            ))

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        future_stats = executor.submit(get_stats_and_areas)
        future_classify = executor.submit(get_classify)

        combined_results = future_stats.result()
        classify = future_classify.result()

    stats = combined_results.get("stats", {})
    area_dict = combined_results.get("areas", {})
    bounds = combined_results.get("bounds", {"coordinates": [[[0,0],[0,0],[0,0],[0,0]]] })["coordinates"][0]
    
    labels = ["Very Low", "Low", "Moderate", "High", "Very High"]
    class_areas = {lbl: round((area_dict.get(f"c{i}", 0) or 0) / 1e6, 2) for i, lbl in enumerate(labels)}
    center_lon = (bounds[0][0] + bounds[2][0]) / 2
    center_lat = (bounds[0][1] + bounds[2][1]) / 2

    def get_thumbs():
        with gee_semaphore:
            thumb = _safe_gee_call(lambda: DVI.getThumbURL({"min": 0, "max": 1, "palette": dvi_pal, "region": calc_geom, "dimensions": 800, "crs": "EPSG:4326", "format": "png"}))
            class_thumb = _safe_gee_call(lambda: vuln_class.getThumbURL({"min": 1, "max": 5, "palette": class_pal, "region": calc_geom, "dimensions": 800, "crs": "EPSG:4326", "format": "png"}))
        return thumb, class_thumb

    thumb_url, class_thumb_url = get_thumbs()

    result = {
        "tile_url": dvi_map_id["tile_fetcher"].url_format,
        "class_tile_url": class_map_id["tile_fetcher"].url_format,
        "thumb_url": thumb_url,
        "class_thumb_url": class_thumb_url,
        "stats": {
            "Mean DVI": round(stats.get("DVI_mean") or 0, 4),
            "Min DVI": round(stats.get("DVI_min") or 0, 4),
            "Max DVI": round(stats.get("DVI_max") or 0, 4),
            "Std Dev": round(stats.get("DVI_stdDev") or 0, 4),
        },
        "class_areas_km2": class_areas,
        "classify": classify,
        "center": [center_lat, center_lon],
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
        "bbox": bounds,
        "start_date": start_date,
        "end_date": end_date,
    }

    with _lock:
        _cache[cache_key] = result

    return result
