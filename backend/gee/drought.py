import json
"""Agricultural Drought Vulnerability Index — no Streamlit dependency."""
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
from gee.classify_utils import quantile_classify

# AHP Weights from the JS script
WEIGHTS = {
    "sm": 0.400,
    "rf": 0.220,
    "ndvi": 0.110,
    "vci": 0.110,
    "lst": 0.065,
    "cdd": 0.065,
    "evi": 0.030,
}

DVI_VIS = {"min": 0, "max": 1, "palette": ["#1a9641", "#a6d96a", "#ffffbf", "#fdae61", "#d7191c"]}
CLASS_VIS = {"min": 1, "max": 5, "palette": ["#1a9641", "#a6d96a", "#ffffbf", "#fdae61", "#d7191c"]}
CLASS_NAMES = ["Very Low", "Low", "Moderate", "High", "Very High"]

_cache: TTLCache = TTLCache(maxsize=64, ttl=3600)
_lock = Lock()


def mask_l8_sr(image: ee.Image) -> ee.Image:
    qa = image.select("QA_PIXEL")
    # Bit 1 (dilated cloud), 3 (cloud shadow), 4 (cloud), 5 (snow)
    cloud_free = (
        qa.bitwiseAnd(1 << 1).eq(0)
        .And(qa.bitwiseAnd(1 << 3).eq(0))
        .And(qa.bitwiseAnd(1 << 4).eq(0))
        .And(qa.bitwiseAnd(1 << 5).eq(0))
    )
    sat_free = image.select("QA_RADSAT").eq(0)
    opt = image.select("SR_B.").multiply(0.0000275).add(-0.2)
    thermal = image.select("ST_B.*").multiply(0.00341802).add(149.0)
    
    return (
        image.addBands(opt, None, True)
        .addBands(thermal, None, True)
        .updateMask(cloud_free)
        .updateMask(sat_free)
    )


def norm_invert(img: ee.Image, lo: float, hi: float, name: str) -> ee.Image:
    # High raw value -> high vulnerability
    return img.subtract(lo).divide(hi - lo).clamp(0, 1).rename(name)


def norm_positive(img: ee.Image, lo: float, hi: float, name: str) -> ee.Image:
    # Low raw value -> high vulnerability
    return ee.Image(1).subtract(
        img.subtract(lo).divide(hi - lo).clamp(0, 1)
    ).rename(name)


def _build_drought_images(
    aoi_config: dict, year: int,
    reverse_sm: bool, reverse_rf: bool, reverse_ndvi: bool,
    reverse_vci: bool, reverse_lst: bool, reverse_cdd: bool, reverse_evi: bool
):
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)

    geometry = aoi.dissolve(maxError=1)
    geometry_buffered = geometry.buffer(500)

    season_start = f"{year}-03-01"
    season_end = f"{year}-06-30"
    ext_start = f"{year}-02-01"
    ext_end = f"{year}-07-31"
    base_year_start = 2013
    base_year_end = 2022

    # Landsat 8 and 9
    ls8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
    ls9 = ee.ImageCollection("LANDSAT/LC09/C02/T1_L2")
    all_ls = ls8.merge(ls9)

    comp_primary = (
        all_ls.filterBounds(geometry_buffered)
        .filterDate(season_start, season_end)
        .map(mask_l8_sr)
        .median()
    )
    comp_extended = (
        all_ls.filterBounds(geometry_buffered)
        .filterDate(ext_start, ext_end)
        .map(mask_l8_sr)
        .median()
    )
    comp_multiyear = (
        all_ls.filterBounds(geometry_buffered)
        .filter(ee.Filter.calendarRange(3, 6, "month"))
        .filter(ee.Filter.calendarRange(2019, 2022, "year"))
        .map(mask_l8_sr)
        .median()
    )

    ls_filled = comp_primary.unmask(comp_extended).unmask(comp_multiyear).clip(geometry)

    # Indices
    ndvi_current = ls_filled.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI").clip(geometry)
    
    evi_current = ls_filled.expression(
        "2.5 * ((NIR - RED) / (NIR + 6.0 * RED - 7.5 * BLUE + 1.0))",
        {
            "NIR": ls_filled.select("SR_B5"),
            "RED": ls_filled.select("SR_B4"),
            "BLUE": ls_filled.select("SR_B2"),
        }
    ).rename("EVI").clip(geometry)

    lst_current = ls_filled.select("ST_B10").subtract(273.15).rename("LST_C").clip(geometry)

    # Baseline multi-year composite (2013-2022)
    ls_base = (
        ls8.filterBounds(geometry_buffered)
        .filter(ee.Filter.calendarRange(3, 6, "month"))
        .filter(ee.Filter.calendarRange(base_year_start, base_year_end, "year"))
        .map(mask_l8_sr)
    )
    ls_base_full = (
        ls8.filterBounds(geometry_buffered)
        .filter(ee.Filter.calendarRange(base_year_start, base_year_end, "year"))
        .map(mask_l8_sr)
    )

    ndvi_base = ls_base.map(lambda img: img.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI"))
    ndvi_base_ext = ls_base_full.map(lambda img: img.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI"))

    ndvi_min = ndvi_base.min().unmask(ndvi_base_ext.min()).clip(geometry)
    ndvi_max = ndvi_base.max().unmask(ndvi_base_ext.max()).clip(geometry)

    denom = ndvi_max.subtract(ndvi_min)
    vci = (
        ndvi_current.subtract(ndvi_min)
        .divide(denom.where(denom.abs().lt(0.01), 0.01))
        .multiply(100).clamp(0, 100)
        .rename("VCI").clip(geometry)
    )

    lst_base_mean = (
        ls_base.select("ST_B10").mean()
        .unmask(ls_base_full.select("ST_B10").mean())
        .subtract(273.15).rename("LST_mean").clip(geometry)
    )
    lst_anom = lst_current.subtract(lst_base_mean).rename("LST_ANOM").clip(geometry)

    # CHIRPS Rainfall Anomaly & CDD
    chirps_col = ee.ImageCollection("UCSB-CHG/CHIRPS/PENTAD")
    chirps_current = (
        chirps_col.filterBounds(geometry_buffered)
        .filterDate(season_start, season_end)
        .sum().rename("RF_CUMUL")
        .clip(geometry)
    )

    years = ee.List.sequence(2001, 2022)
    def get_chirps_ltm(yr):
        return (
            chirps_col.filterBounds(geometry_buffered)
            .filter(ee.Filter.calendarRange(3, 6, "month"))
            .filter(ee.Filter.calendarRange(yr, yr, "year"))
            .sum()
        )
    
    chirps_ltm = (
        ee.ImageCollection(years.map(get_chirps_ltm))
        .mean().rename("RF_LTM")
        .clip(geometry)
    )
    rf_anom = chirps_current.subtract(chirps_ltm).rename("RF_ANOM").clip(geometry)

    dry_pentads = (
        chirps_col.filterBounds(geometry_buffered)
        .filterDate(season_start, season_end)
        .map(lambda img: img.lt(1).rename("dry"))
        .sum().rename("CDD")
        .clip(geometry)
    )

    # ERA5-Land Soil Moisture
    era5 = ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR").select("volumetric_soil_water_layer_1")
    sm_current = (
        era5.filterBounds(geometry_buffered)
        .filterDate(season_start, season_end)
        .mean().rename("SM")
        .clip(geometry)
    )
    sm_ltm = (
        era5.filterBounds(geometry_buffered)
        .filter(ee.Filter.calendarRange(3, 6, "month"))
        .filter(ee.Filter.calendarRange(2001, 2022, "year"))
        .mean().rename("SM_LTM")
        .clip(geometry)
    )
    sm_anom = sm_current.subtract(sm_ltm).rename("SM_ANOM").clip(geometry)

    # Normalise & Apply Factor Reversals
    sm_norm = norm_positive(sm_anom, -0.10, 0.10, "SM_norm")
    if reverse_sm: sm_norm = ee.Image(1).subtract(sm_norm).rename("SM_norm")

    rf_norm = norm_positive(rf_anom, -250, 150, "RF_norm")
    if reverse_rf: rf_norm = ee.Image(1).subtract(rf_norm).rename("RF_norm")

    ndvi_norm = norm_positive(ndvi_current, -0.10, 0.85, "NDVI_norm")
    if reverse_ndvi: ndvi_norm = ee.Image(1).subtract(ndvi_norm).rename("NDVI_norm")

    vci_norm = norm_positive(vci, 0, 100, "VCI_norm")
    if reverse_vci: vci_norm = ee.Image(1).subtract(vci_norm).rename("VCI_norm")

    lst_norm = norm_invert(lst_anom, -5, 12, "LST_norm")
    if reverse_lst: lst_norm = ee.Image(1).subtract(lst_norm).rename("LST_norm")

    cdd_norm = norm_invert(dry_pentads, 0, 12, "CDD_norm")
    if reverse_cdd: cdd_norm = ee.Image(1).subtract(cdd_norm).rename("CDD_norm")

    evi_norm = norm_positive(evi_current, -0.10, 0.85, "EVI_norm")
    if reverse_evi: evi_norm = ee.Image(1).subtract(evi_norm).rename("EVI_norm")

    # AHP Weights
    dvi = (
        sm_norm.multiply(WEIGHTS["sm"])
        .add(rf_norm.multiply(WEIGHTS["rf"]))
        .add(ndvi_norm.multiply(WEIGHTS["ndvi"]))
        .add(vci_norm.multiply(WEIGHTS["vci"]))
        .add(lst_norm.multiply(WEIGHTS["lst"]))
        .add(cdd_norm.multiply(WEIGHTS["cdd"]))
        .add(evi_norm.multiply(WEIGHTS["evi"]))
        .rename("DVI").clip(geometry)
    )
    
    dvi = dvi.reproject(crs="EPSG:4326", scale=get_dynamic_scale(geometry))
    return aoi, geometry, dvi, vci, sm_anom, rf_anom, lst_anom, dry_pentads, ndvi_current


def compute_drought_map(
    aoi_config: dict, year: int,
    reverse_sm: bool = False, reverse_rf: bool = False, reverse_ndvi: bool = False,
    reverse_vci: bool = False, reverse_lst: bool = False, reverse_cdd: bool = False, reverse_evi: bool = False
) -> dict:
    cache_key = ("map", json.dumps(aoi_config, sort_keys=True), year, reverse_sm, reverse_rf, reverse_ndvi, reverse_vci, reverse_lst, reverse_cdd, reverse_evi)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, geometry, dvi, _, _, _, _, _, _ = _build_drought_images(
        aoi_config, year, reverse_sm, reverse_rf, reverse_ndvi, reverse_vci, reverse_lst, reverse_cdd, reverse_evi
    )

    dvi_map_id = dvi.getMapId(DVI_VIS)
    centroid = geometry.centroid(maxError=100).coordinates().getInfo()
    bounds = geometry.bounds().coordinates().get(0).getInfo()

    result = {
        "tile_url": dvi_map_id["tile_fetcher"].url_format,
        "thumb_url": dvi.getThumbURL({**DVI_VIS, "region": geometry.bounds(), "dimensions": 800, "format": "png"}),
        "center": [centroid[1], centroid[0]],
        "bbox": bounds,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
    }
    with _lock:
        _cache[cache_key] = result
    return result


def compute_drought_stats(
    aoi_config: dict, year: int,
    reverse_sm: bool = False, reverse_rf: bool = False, reverse_ndvi: bool = False,
    reverse_vci: bool = False, reverse_lst: bool = False, reverse_cdd: bool = False, reverse_evi: bool = False
) -> dict:
    cache_key = ("stats", json.dumps(aoi_config, sort_keys=True), year, reverse_sm, reverse_rf, reverse_ndvi, reverse_vci, reverse_lst, reverse_cdd, reverse_evi)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, geometry, dvi, _, _, _, _, _, _ = _build_drought_images(
        aoi_config, year, reverse_sm, reverse_rf, reverse_ndvi, reverse_vci, reverse_lst, reverse_cdd, reverse_evi
    )

    stats = dvi.reduceRegion(
        reducer=ee.Reducer.mean().combine(ee.Reducer.min(), sharedInputs=True)
        .combine(ee.Reducer.max(), sharedInputs=True).combine(ee.Reducer.stdDev(), sharedInputs=True),
        geometry=geometry, scale=get_dynamic_scale(geometry), maxPixels=1e10,
    ).getInfo()

    result = {
        "Mean DVI": round(stats.get("DVI_mean") or 0, 3),
        "Min DVI": round(stats.get("DVI_min") or 0, 3),
        "Max DVI": round(stats.get("DVI_max") or 0, 3),
        "Std Dev": round(stats.get("DVI_stdDev") or 0, 3),
    }
    with _lock:
        _cache[cache_key] = result
    return result


def compute_drought_classify(
    aoi_config: dict, year: int, n_classes: int = 5, method: str = "natural_breaks", custom_labels: list = None,
    reverse_sm: bool = False, reverse_rf: bool = False, reverse_ndvi: bool = False,
    reverse_vci: bool = False, reverse_lst: bool = False, reverse_cdd: bool = False, reverse_evi: bool = False
) -> dict:
    cache_key = ("classify", json.dumps(aoi_config, sort_keys=True), year, n_classes, method, tuple(custom_labels) if custom_labels else None,
                 reverse_sm, reverse_rf, reverse_ndvi, reverse_vci, reverse_lst, reverse_cdd, reverse_evi)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, geometry, dvi, vci, sm_anom, rf_anom, lst_anom, dry_pentads, ndvi_current = _build_drought_images(
        aoi_config, year, reverse_sm, reverse_rf, reverse_ndvi, reverse_vci, reverse_lst, reverse_cdd, reverse_evi
    )

    result = quantile_classify(
        layers=[
            {"name": "DVI", "image": dvi, "title": "Drought Vulnerability Index"},
            {"name": "VCI", "image": vci, "title": "Vegetation Condition Index (VCI)"},
            {"name": "SM", "image": sm_anom, "title": "Soil Moisture Anomaly (SM)"},
            {"name": "RF", "image": rf_anom, "title": "Rainfall Anomaly (RF)"},
            {"name": "LST", "image": lst_anom, "title": "Land Surface Temp Anomaly (LST)"},
            {"name": "CDD", "image": dry_pentads, "title": "Consecutive Dry Days (CDD)"},
            {"name": "NDVI", "image": ndvi_current, "title": "NDVI Vegetation Health"},
        ],
        aoi=geometry, scale=get_dynamic_scale(geometry), n_classes=n_classes,
        method=method, custom_labels=custom_labels or CLASS_NAMES[:n_classes]
    )

    with _lock:
        _cache[cache_key] = result
    return result


def compute_drought_export(
    aoi_config: dict, year: int,
    reverse_sm: bool = False, reverse_rf: bool = False, reverse_ndvi: bool = False,
    reverse_vci: bool = False, reverse_lst: bool = False, reverse_cdd: bool = False, reverse_evi: bool = False
) -> dict:
    cache_key = ("export", json.dumps(aoi_config, sort_keys=True), year, reverse_sm, reverse_rf, reverse_ndvi, reverse_vci, reverse_lst, reverse_cdd, reverse_evi)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    aoi, geometry, dvi, _, _, _, _, _, _ = _build_drought_images(
        aoi_config, year, reverse_sm, reverse_rf, reverse_ndvi, reverse_vci, reverse_lst, reverse_cdd, reverse_evi
    )

    result = {
        "download_url": dvi.getDownloadURL({"region": geometry.bounds(), "scale": 100, "format": "GEO_TIFF", "crs": "EPSG:4326"})
    }
    with _lock:
        _cache[cache_key] = result
    return result
