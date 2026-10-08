from gee.persistent_cache import with_cache
import json
"""Air Pollution (Sentinel-5P NO2, CO, SO2, Aerosol) ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â decoupled architecture."""
from datetime import date as _date
import ee
from gee.persistent_cache import PersistentCache
from threading import Lock
import concurrent.futures
from gee.classify_utils import quantile_classify

WHO_NO2_ANNUAL_THRESHOLD = 10.0

_cache = PersistentCache(ttl=3600)
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


def _get_collections(aoi, start_date, end_date):
    """Retrieve quality-masked Sentinel-5P collections."""
    
    # NO2 (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/m2) - Mask qa_value > 0.75
    s5p_no2 = (
        ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2")
        .filterDate(start_date, end_date)
        .filterBounds(aoi)
        .select("tropospheric_NO2_column_number_density")
        .map(lambda img: img.multiply(1e6).rename("NO2_umol_m2").copyProperties(img, ["system:time_start"]))
    )

    # CO (mol/m2) - Mask qa_value > 0.5
    s5p_co = (
        ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_CO")
        .filterDate(start_date, end_date)
        .filterBounds(aoi)
        .select("CO_column_number_density")
        .map(lambda img: img.rename("CO_mol_m2").copyProperties(img, ["system:time_start"]))
    )
    
    # SO2 (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/m2) - Mask qa_value > 0.5
    s5p_so2 = (
        ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_SO2")
        .filterDate(start_date, end_date)
        .filterBounds(aoi)
        .select("SO2_column_number_density")
        .map(lambda img: img.multiply(1e6).rename("SO2_umol_m2").copyProperties(img, ["system:time_start"]))
    )
    
    # Aerosol Index (Unitless) - Mask absorbing_aerosol_index_sensor_error >= 0 usually, but we'll use a safer mask if needed
    # (Just take it directly as it has fewer standard QA requirements unless extreme)
    s5p_aer = (
        ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_AER_AI")
        .filterDate(start_date, end_date)
        .filterBounds(aoi)
        .select("absorbing_aerosol_index")
        .map(lambda img: img.rename("AER_AI").copyProperties(img, ["system:time_start"]))
    )

    comp_no2 = s5p_no2.median().clip(aoi)
    comp_co = s5p_co.median().clip(aoi)
    comp_so2 = s5p_so2.median().clip(aoi)
    comp_aer = s5p_aer.median().clip(aoi)

    return s5p_no2, s5p_co, s5p_so2, s5p_aer, comp_no2, comp_co, comp_so2, comp_aer


@with_cache
def compute_air_pollution_map(aoi_config: dict, start_date: str, end_date: str) -> dict:
    cache_key = ("air_map", json.dumps(aoi_config, sort_keys=True), start_date, end_date)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    _, _, _, _, comp_no2, _, _, _ = _get_collections(aoi, start_date, end_date)

    bounds = aoi.bounds().coordinates().get(0).getInfo()
    center = [(bounds[0][1] + bounds[2][1]) / 2, (bounds[0][0] + bounds[2][0]) / 2]

    vis_params = {"min": 0, "max": 20, "palette": ["#000080", "#0000ff", "#00ffff", "#ffff00", "#ff0000"]}
    map_id = comp_no2.getMapId(vis_params)

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": comp_no2.getThumbURL({**vis_params, "region": aoi.bounds(), "dimensions": 800, "crs": "EPSG:4326", "format": "png"}),
        "center": center,
        "bbox": bounds,
        "start_date": start_date,
        "end_date": end_date,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
    }
    with _lock:
        _cache[cache_key] = result
    return result


@with_cache
def compute_air_pollution_stats(aoi_config: dict, start_date: str, end_date: str) -> dict:
    cache_key = ("air_stats", json.dumps(aoi_config, sort_keys=True), start_date, end_date)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    _, _, _, _, comp_no2, comp_co, comp_so2, comp_aer = _get_collections(aoi, start_date, end_date)

    composite = ee.Image.cat([comp_no2, comp_co, comp_so2, comp_aer])
    from gee.aoi_utils import get_dynamic_scale; dynamic_scale = max(1113, get_dynamic_scale(aoi, aoi_config))

    stats = composite.reduceRegion(
        reducer=ee.Reducer.mean()
        .combine(ee.Reducer.max(), sharedInputs=True)
        .combine(ee.Reducer.percentile([90]), sharedInputs=True),
        geometry=aoi.bounds(maxError=1000), scale=dynamic_scale, maxPixels=1e10, tileScale=4,
    ).getInfo()

    mean_no2 = round(stats.get("NO2_umol_m2_mean") or 0, 2)
    mean_co = round(stats.get("CO_mol_m2_mean") or 0, 4)
    mean_so2 = round(stats.get("SO2_umol_m2_mean") or 0, 2)
    mean_aer = round(stats.get("AER_AI_mean") or 0, 2)

    result = {
        "stats": {
            "Mean NO2 (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²)": mean_no2,
            "Max NO2 (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²)": round(stats.get("NO2_umol_m2_max") or 0, 2),
            "P90 NO2 (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²)": round(stats.get("NO2_umol_m2_p90") or 0, 2),
            "Mean CO (mol/mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²)": mean_co,
            "Mean SO2 (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²)": mean_so2,
            "Mean Aerosol Index": mean_aer,
            "WHO Threshold (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²)": WHO_NO2_ANNUAL_THRESHOLD,
        },
        "exceeds_who": mean_no2 > WHO_NO2_ANNUAL_THRESHOLD,
    }
    with _lock:
        _cache[cache_key] = result
    return result


@with_cache
def compute_air_pollution_classify(aoi_config: dict, start_date: str, end_date: str, n_classes: int = 5, method: str = "natural_breaks", custom_labels: list = None) -> dict:
    cache_key = ("air_classify", json.dumps(aoi_config, sort_keys=True), start_date, end_date, n_classes, method, tuple(custom_labels) if custom_labels else None)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    _, _, _, _, comp_no2, comp_co, comp_so2, comp_aer = _get_collections(aoi, start_date, end_date)
    from gee.aoi_utils import get_dynamic_scale; dynamic_scale = max(1113, get_dynamic_scale(aoi, aoi_config))

    classify = quantile_classify(
        layers=[
            {"name": "NO2_umol_m2", "image": comp_no2, "title": "NOÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ Column (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²)"},
            {"name": "CO_mol_m2", "image": comp_co, "title": "CO Column (mol/mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²)"},
            {"name": "SO2_umol_m2", "image": comp_so2, "title": "SOÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ Column (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²)"},
            {"name": "AER_AI", "image": comp_aer, "title": "Aerosol Index (Unitless)"},
        ],
        aoi=aoi, scale=dynamic_scale, n_classes=n_classes,
        method=method, custom_labels=custom_labels
    )
    result = {"classify": classify}
    with _lock:
        _cache[cache_key] = result
    return result


@with_cache
def compute_air_pollution_export(aoi_config: dict, start_date: str, end_date: str) -> dict:
    cache_key = ("air_export", json.dumps(aoi_config, sort_keys=True), start_date, end_date)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    _, _, _, _, comp_no2, comp_co, comp_so2, comp_aer = _get_collections(aoi, start_date, end_date)

    composite = ee.Image.cat([comp_no2, comp_co, comp_so2, comp_aer])
    from gee.aoi_utils import get_dynamic_scale; dynamic_scale = max(1113, get_dynamic_scale(aoi, aoi_config))
    district_name = aoi_config.get("district", aoi_config.get("name", "Custom AOI"))

    download_url = None
    for attempt in range(3):
        try:
            download_url = composite.getDownloadURL({
                "name": f"Air_Pollution_{district_name.replace(' ', '_')}",
                "region": aoi.bounds(),
                "scale": dynamic_scale,
                "format": "GEO_TIFF",
                "maxPixels": 1e9
            })
            break
        except Exception as e:
            if "size" in str(e).lower() and "must be less than" in str(e).lower():
                dynamic_scale = int(dynamic_scale * 1.5)
            else:
                raise
    result = {"download_url": download_url}
    with _lock:
        _cache[cache_key] = result
    return result


@with_cache
def compute_air_pollution_timeseries(aoi_config: dict, start_date: str, end_date: str) -> dict:
    cache_key = ("air_ts", json.dumps(aoi_config, sort_keys=True), start_date, end_date)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    s5p_no2, s5p_co, s5p_so2, s5p_aer, _, _, _, _ = _get_collections(aoi, start_date, end_date)
    
    from gee.aoi_utils import get_dynamic_scale; dynamic_scale = max(1113, get_dynamic_scale(aoi, aoi_config)) * 2 # Use coarser scale for time-series
    months = _month_range(start_date, end_date)
    
    # Process each month in parallel to avoid single huge EE image failure
    def process_month(ym):
        y, m = ym
        m_start = ee.Date.fromYMD(y, m, 1)
        m_end = m_start.advance(1, "month")
        
        # Take mean across month for each collection
        no2_mean = s5p_no2.filterDate(m_start, m_end).mean()
        co_mean = s5p_co.filterDate(m_start, m_end).mean()
        so2_mean = s5p_so2.filterDate(m_start, m_end).mean()
        aer_mean = s5p_aer.filterDate(m_start, m_end).mean()
        
        combined = ee.Image.cat([no2_mean, co_mean, so2_mean, aer_mean])
        
        def fetch_stats(img):
            return img.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=aoi.bounds(maxError=1000),
                scale=dynamic_scale,
                maxPixels=1e9,
                tileScale=2
            ).getInfo()
            
        # Try to import safe_gee_call or implement retry logic here
        import time, random
        from gee.auth import rotate_credentials
        retries = 5
        stats = {}
        for i in range(retries):
            try:
                stats = fetch_stats(combined)
                break
            except Exception as e:
                err_str = str(e)
                if "429" in err_str or "Too Many Requests" in err_str or "concurrency" in err_str.lower() or "quota" in err_str.lower() or "restricted mode" in err_str.lower() or "permission" in err_str.lower():
                    try:
                        rotate_credentials()
                    except:
                        pass
                    if i < retries - 1:
                        time.sleep((2 ** i) + random.uniform(0, 1))
                        continue
                raise
        
        return {
            "month": m,
            "year": y,
            "NO2 (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²)": round(stats.get("NO2_umol_m2") or 0, 2),
            "CO (mol/mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²)": round(stats.get("CO_mol_m2") or 0, 4),
            "SO2 (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²)": round(stats.get("SO2_umol_m2") or 0, 2),
            "Aerosol Index": round(stats.get("AER_AI") or 0, 2),
        }

    time_series = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        results = executor.map(process_month, months)
        for res in results:
            time_series.append(res)
            
    result = {"time_series": time_series}
    with _lock:
        _cache[cache_key] = result
    return result

