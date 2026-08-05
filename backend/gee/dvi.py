import json
"""DVI computation — AHP-Weighted Drought Vulnerability Map"""
import ee
from cachetools import TTLCache
from threading import Lock
from gee.classify_utils import quantile_classify
from datetime import datetime
from dateutil.relativedelta import relativedelta

RWANDA_DISTRICTS = [
    "Bugesera", "Burera", "Gakenke", "Gasabo", "Gatsibo",
    "Gicumbi", "Gisagara", "Huye", "Kamonyi", "Karongi",
    "Kayonza", "Kicukiro", "Kirehe", "Muhanga", "Musanze",
    "Ngoma", "Ngororero", "Nyabihu", "Nyagatare", "Nyamagabe",
    "Nyamasheke", "Nyanza", "Nyarugenge", "Nyaruguru", "Rubavu",
    "Ruhango", "Rulindo", "Rusizi", "Rutsiro", "Rwamagana",
]

_cache: TTLCache = TTLCache(maxsize=128, ttl=3600)
_lock = Lock()

def maskL8sr(image):
    qa = image.select('QA_PIXEL')
    cloudFree = qa.bitwiseAnd(1 << 1).eq(0) \
        .And(qa.bitwiseAnd(1 << 3).eq(0)) \
        .And(qa.bitwiseAnd(1 << 4).eq(0)) \
        .And(qa.bitwiseAnd(1 << 5).eq(0))
    satFree = image.select('QA_RADSAT').eq(0)
    opt = image.select('SR_B.').multiply(0.0000275).add(-0.2)
    thermal = image.select('ST_B.*').multiply(0.00341802).add(149.0)
    return image.addBands(opt, None, True).addBands(thermal, None, True).updateMask(cloudFree).updateMask(satFree)

def normInvert(img, lo, hi, name):
    return img.subtract(lo).divide(ee.Number(hi).subtract(lo)).clamp(0, 1).rename(name)

def normPositive(img, lo, hi, name):
    return ee.Image(1).subtract(img.subtract(lo).divide(ee.Number(hi).subtract(lo)).clamp(0, 1)).rename(name)

def compute_dvi(
    aoi_config: dict,
    start_date: str,
    end_date: str,
    n_classes: int = 5,
) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_date, end_date, n_classes)

    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry
    geometry = get_aoi_geometry(aoi_config)
    geometryBuffered = geometry.buffer(500)

    # Date ranges
    seasonStart = start_date
    seasonEnd = end_date
    
    start_dt = datetime.strptime(start_date, '%Y-%m-%d')
    end_dt = datetime.strptime(end_date, '%Y-%m-%d')
    extStart = (start_dt - relativedelta(months=1)).strftime('%Y-%m-%d')
    extEnd = (end_dt + relativedelta(months=1)).strftime('%Y-%m-%d')
    start_month = start_dt.month
    end_month = end_dt.month

    baseYearStart = 2013
    baseYearEnd = 2022

    # Landsat
    ls8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    ls9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    allLS = ls8.merge(ls9)

    comp_primary = allLS.filterBounds(geometryBuffered).filterDate(seasonStart, seasonEnd).map(maskL8sr).median()
    comp_extended = allLS.filterBounds(geometryBuffered).filterDate(extStart, extEnd).map(maskL8sr).median()
    comp_multiyear = allLS.filterBounds(geometryBuffered).filter(ee.Filter.calendarRange(start_month, end_month, 'month')).filter(ee.Filter.calendarRange(2019, 2022, 'year')).map(maskL8sr).median()

    ls_filled = comp_primary.unmask(comp_extended).unmask(comp_multiyear).clip(geometry)

    # Indices
    ndvi_current = ls_filled.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI').clip(geometry)
    evi_current = ls_filled.expression(
        '2.5 * ((NIR - RED) / (NIR + 6.0 * RED - 7.5 * BLUE + 1.0))', {
            'NIR':  ls_filled.select('SR_B5'),
            'RED':  ls_filled.select('SR_B4'),
            'BLUE': ls_filled.select('SR_B2')
        }).rename('EVI').clip(geometry)
    lst_current = ls_filled.select('ST_B10').subtract(273.15).rename('LST_C').clip(geometry)

    # Baseline
    ls_base = ls8.filterBounds(geometryBuffered).filter(ee.Filter.calendarRange(start_month, end_month, 'month')).filter(ee.Filter.calendarRange(baseYearStart, baseYearEnd, 'year')).map(maskL8sr)
    ls_base_full = ls8.filterBounds(geometryBuffered).filter(ee.Filter.calendarRange(baseYearStart, baseYearEnd, 'year')).map(maskL8sr)

    def get_ndvi(img): return img.normalizedDifference(['SR_B5','SR_B4']).rename('NDVI')
    ndvi_base = ls_base.map(get_ndvi)
    ndvi_base_ext = ls_base_full.map(get_ndvi)

    ndvi_min = ndvi_base.min().unmask(ndvi_base_ext.min()).clip(geometry)
    ndvi_max = ndvi_base.max().unmask(ndvi_base_ext.max()).clip(geometry)

    denom = ndvi_max.subtract(ndvi_min)
    vci = ndvi_current.subtract(ndvi_min).divide(denom.where(denom.abs().lt(0.01), 0.01)).multiply(100).clamp(0, 100).rename('VCI').clip(geometry)

    lst_base_mean = ls_base.select('ST_B10').mean().unmask(ls_base_full.select('ST_B10').mean()).subtract(273.15).rename('LST_mean').clip(geometry)
    lst_anom = lst_current.subtract(lst_base_mean).rename('LST_ANOM').clip(geometry)

    # CHIRPS
    chirps_col = ee.ImageCollection('UCSB-CHG/CHIRPS/PENTAD')
    chirps_current = chirps_col.filterBounds(geometryBuffered).filterDate(seasonStart, seasonEnd).sum().rename('RF_CUMUL').reproject(crs='EPSG:32736', scale=30).clip(geometry)

    years = ee.List.sequence(2001, 2022)
    def get_chirps_yr(yr):
        return chirps_col.filterBounds(geometryBuffered).filter(ee.Filter.calendarRange(start_month, end_month, 'month')).filter(ee.Filter.calendarRange(yr, yr, 'year')).sum()
    chirps_ltm = ee.ImageCollection(years.map(get_chirps_yr)).mean().rename('RF_LTM').reproject(crs='EPSG:32736', scale=30).clip(geometry)
    rf_anom = chirps_current.subtract(chirps_ltm).rename('RF_ANOM').clip(geometry)

    def is_dry(img): return img.lt(1).rename('dry')
    dry_pentads = chirps_col.filterBounds(geometryBuffered).filterDate(seasonStart, seasonEnd).map(is_dry).sum().rename('CDD').reproject(crs='EPSG:32736', scale=30).clip(geometry)

    # ERA5
    era5 = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR').select('volumetric_soil_water_layer_1')
    sm_current = era5.filterBounds(geometryBuffered).filterDate(seasonStart, seasonEnd).mean().rename('SM').reproject(crs='EPSG:32736', scale=30).clip(geometry)
    sm_ltm = era5.filterBounds(geometryBuffered).filter(ee.Filter.calendarRange(start_month, end_month, 'month')).filter(ee.Filter.calendarRange(2001, 2022, 'year')).mean().rename('SM_LTM').reproject(crs='EPSG:32736', scale=30).clip(geometry)
    sm_anom = sm_current.subtract(sm_ltm).rename('SM_ANOM').clip(geometry)

    # Normalize
    sm_norm = normPositive(sm_anom, -0.10, 0.10, 'SM_norm')
    rf_norm = normPositive(rf_anom, -250, 150, 'RF_norm')
    ndvi_norm = normPositive(ndvi_current, -0.10, 0.85, 'NDVI_norm')
    vci_norm = normPositive(vci, 0, 100, 'VCI_norm')
    lst_norm = normInvert(lst_anom, -5, 12, 'LST_norm')
    cdd_norm = normInvert(dry_pentads, 0, 12, 'CDD_norm')
    evi_norm = normPositive(evi_current, -0.10, 0.85, 'EVI_norm')

    # DVI
    DVI = sm_norm.multiply(0.400) \
        .add(rf_norm.multiply(0.220)) \
        .add(ndvi_norm.multiply(0.110)) \
        .add(vci_norm.multiply(0.110)) \
        .add(lst_norm.multiply(0.065)) \
        .add(cdd_norm.multiply(0.065)) \
        .add(evi_norm.multiply(0.030)) \
        .rename('DVI').clip(geometry)

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

    dvi_map_id = DVI.getMapId({'min': 0, 'max': 1, 'palette': dvi_pal})
    class_map_id = vuln_class.getMapId({'min': 1, 'max': 5, 'palette': class_pal})

    import concurrent.futures

    class_area_bands = ee.Image.cat([vuln_class.eq(i+1).multiply(ee.Image.pixelArea()).rename(f"c{i}") for i in range(5)])

    def get_stats_and_areas():
        combined = ee.Dictionary({
            "stats": DVI.reduceRegion(
                reducer=ee.Reducer.mean().combine(ee.Reducer.min(), sharedInputs=True).combine(ee.Reducer.max(), sharedInputs=True).combine(ee.Reducer.stdDev(), sharedInputs=True),
                geometry=geometry,
                scale=100, 
                maxPixels=1e6, bestEffort=True,
                tileScale=4,
            ),
            "areas": class_area_bands.reduceRegion(
                reducer=ee.Reducer.sum(), geometry=geometry, scale=100, maxPixels=1e6, bestEffort=True, tileScale=4
            ),
            "bounds": geometry.bounds()
        })
        return combined.getInfo()

    def get_classify():
        return quantile_classify(
            layers=[{"name": "DVI", "image": DVI, "title": "Drought Vulnerability Index"}],
            aoi=geometry,
            scale=100,
            n_classes=n_classes,
        )

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

    result = {
        "tile_url": dvi_map_id["tile_fetcher"].url_format,
        "class_tile_url": class_map_id["tile_fetcher"].url_format,
        "thumb_url": DVI.getThumbURL({"min": 0, "max": 1, "palette": dvi_pal, "region": geometry.bounds(), "dimensions": 800, "format": "png"}),
        "class_thumb_url": vuln_class.getThumbURL({"min": 1, "max": 5, "palette": class_pal, "region": geometry.bounds(), "dimensions": 800, "format": "png"}),
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
