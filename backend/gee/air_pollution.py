import json
"""Air Pollution (Sentinel-5P NO2, CO, SO2, Aerosol) — no Streamlit dependency."""
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


def compute_air_pollution(aoi_config: dict, start_date: str, end_date: str, n_classes: int = 5) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_date, end_date, n_classes)
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    # NO2 (µmol/m2)
    s5p_no2 = (
        ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2")
        .filterDate(start_date, end_date)
        .filterBounds(aoi)
        .select("tropospheric_NO2_column_number_density")
        .map(lambda img: img.multiply(1e6).rename("NO2_umol_m2").copyProperties(img, ["system:time_start", "system:time_end"]))
    )

    # Combine synchronous info requests to GEE to avoid blocking
    pre_info = ee.Dictionary({
        "area_sqkm": aoi.area().divide(1e6),
        "collection_size": s5p_no2.size(),
        "bounds": aoi.bounds().coordinates().get(0)
    }).getInfo()

    area_sqkm = pre_info.get("area_sqkm", 0)
    collection_size = pre_info.get("collection_size", 0)
    bounds = pre_info.get("bounds", [[0,0],[0,0],[0,0],[0,0]])

    # Hardcode scale to 1000 as per user request (exception for this module)
    # Sentinel-5P native resolution is ~1113m.
    dynamic_scale = 1000
    
    # CO (mol/m2)
    s5p_co = (
        ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_CO")
        .filterDate(start_date, end_date)
        .filterBounds(aoi)
        .select("CO_column_number_density")
        .map(lambda img: img.rename("CO_mol_m2").copyProperties(img, ["system:time_start", "system:time_end"]))
    )
    
    # SO2 (µmol/m2)
    s5p_so2 = (
        ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_SO2")
        .filterDate(start_date, end_date)
        .filterBounds(aoi)
        .select("SO2_column_number_density")
        .map(lambda img: img.multiply(1e6).rename("SO2_umol_m2").copyProperties(img, ["system:time_start", "system:time_end"]))
    )
    
    # Aerosol Index (Unitless)
    s5p_aer = (
        ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_AER_AI")
        .filterDate(start_date, end_date)
        .filterBounds(aoi)
        .select("absorbing_aerosol_index")
        .map(lambda img: img.rename("AER_AI").copyProperties(img, ["system:time_start", "system:time_end"]))
    )

    district_name = aoi_config.get("district", aoi_config.get("name", "Custom AOI"))
    if collection_size == 0:
        raise ValueError(
            f"No Sentinel-5P imagery available for {district_name} between "
            f"{start_date} and {end_date}. Sentinel-5P data only exists from "
            f"~2018-07 onward — try a later date range."
        )

    # Calculate medians for the total period
    comp_no2 = s5p_no2.median().clip(aoi)
    comp_co = s5p_co.median().clip(aoi)
    comp_so2 = s5p_so2.median().clip(aoi)
    comp_aer = s5p_aer.median().clip(aoi)
    
    composite = ee.Image.cat([comp_no2, comp_co, comp_so2, comp_aer])

    vis_params = {"min": 0, "max": 200, "palette": ["#000080", "#0000ff", "#00ffff", "#ffff00", "#ff0000"]}
    map_id = comp_no2.getMapId(vis_params)

    months = _month_range(start_date, end_date)
    month_images = []
    
    def _get_monthly_mean(col, start_m, end_m, band_name, orig_band):
        month_col = col.filterDate(start_m, end_m).select([orig_band])
        dummy = ee.Image.constant(0).toFloat().rename([orig_band]).updateMask(0)
        return ee.ImageCollection.fromImages([dummy, month_col.mean().toFloat()]).mean().rename([band_name])

    for i, (y, m) in enumerate(months):
        start_m = ee.Date.fromYMD(y, m, 1)
        end_m = start_m.advance(1, "month")
        
        m_no2 = _get_monthly_mean(s5p_no2, start_m, end_m, f"NO2_m{i}", "NO2_umol_m2")
        m_co = _get_monthly_mean(s5p_co, start_m, end_m, f"CO_m{i}", "CO_mol_m2")
        m_so2 = _get_monthly_mean(s5p_so2, start_m, end_m, f"SO2_m{i}", "SO2_umol_m2")
        m_aer = _get_monthly_mean(s5p_aer, start_m, end_m, f"AER_m{i}", "AER_AI")
        
        month_images.append(ee.Image.cat([m_no2, m_co, m_so2, m_aer]))

    monthly_img = ee.Image.cat(month_images)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        f_stats = executor.submit(
            lambda: composite.reduceRegion(
                reducer=ee.Reducer.mean()
                .combine(ee.Reducer.max(), sharedInputs=True)
                .combine(ee.Reducer.percentile([90]), sharedInputs=True),
                geometry=aoi, scale=dynamic_scale, maxPixels=1e10, tileScale=4,
            ).getInfo()
        )

        f_monthly = executor.submit(
            lambda: monthly_img.reduceRegion(
                reducer=ee.Reducer.mean(), geometry=aoi, scale=dynamic_scale, maxPixels=1e10, tileScale=4,
            ).getInfo()
        )

        f_classify = executor.submit(
            lambda: quantile_classify(
                layers=[
                    {"name": "NO2_umol_m2", "image": comp_no2, "title": "NO₂ Column (µmol/m²)"},
                    {"name": "CO_mol_m2", "image": comp_co, "title": "CO Column (mol/m²)"},
                    {"name": "SO2_umol_m2", "image": comp_so2, "title": "SO₂ Column (µmol/m²)"},
                    {"name": "AER_AI", "image": comp_aer, "title": "Aerosol Index (Unitless)"},
                ],
                aoi=aoi, scale=dynamic_scale, n_classes=n_classes,
            )
        )

        f_download = executor.submit(
            lambda: composite.getDownloadURL({
                "name": f"Air_Pollution_{district_name.replace(' ', '_')}",
                "region": aoi.bounds(),
                "scale": dynamic_scale,
                "format": "GEO_TIFF",
                "maxPixels": 1e9
            })
        )

        stats = f_stats.result()
        monthly_dict = f_monthly.result()
        classify = f_classify.result()
        download_url = f_download.result()

    time_series = [
        {
            "month": m, 
            "year": y, 
            "NO2 (µmol/m²)": round(monthly_dict.get(f"NO2_m{i}") or 0, 2),
            "CO (mol/m²)": round(monthly_dict.get(f"CO_m{i}") or 0, 4),
            "SO2 (µmol/m²)": round(monthly_dict.get(f"SO2_m{i}") or 0, 2),
            "Aerosol Index": round(monthly_dict.get(f"AER_m{i}") or 0, 2),
        }
        for i, (y, m) in enumerate(months)
    ]

    center = [(bounds[0][1] + bounds[2][1]) / 2, (bounds[0][0] + bounds[2][0]) / 2]
    mean_no2 = round(stats.get("NO2_umol_m2_mean") or 0, 2)
    mean_co = round(stats.get("CO_mol_m2_mean") or 0, 4)
    mean_so2 = round(stats.get("SO2_umol_m2_mean") or 0, 2)
    mean_aer = round(stats.get("AER_AI_mean") or 0, 2)

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": comp_no2.getThumbURL({**vis_params, "region": aoi.bounds(), "dimensions": 800, "format": "png"}),
        "download_url": download_url,
        "stats": {
            "Mean NO2 (µmol/m²)": mean_no2,
            "Max NO2 (µmol/m²)": round(stats.get("NO2_umol_m2_max") or 0, 2),
            "P90 NO2 (µmol/m²)": round(stats.get("NO2_umol_m2_p90") or 0, 2),
            "Mean CO (mol/m²)": mean_co,
            "Mean SO2 (µmol/m²)": mean_so2,
            "Mean Aerosol Index": mean_aer,
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

# ALIAS backward compatibility
compute_no2 = compute_air_pollution
