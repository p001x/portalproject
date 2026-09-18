"""Water Harvesting Calculator — FastAPI backend."""
import json
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

_cache_map = TTLCache(maxsize=64, ttl=3600)
_cache_stats = TTLCache(maxsize=64, ttl=3600)
_cache_export = TTLCache(maxsize=64, ttl=3600)
_lock = Lock()

_PRECIP_VIS = {"min": 0, "max": 200, "palette": ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"]}

def _build_water_harvesting_images(aoi_config: dict, year: int):
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)

    
    start_date = f"{year}-01-01"
    end_date = f"{year}-12-31"

    # Precipitation from TERRACLIMATE (Monthly, ~4km)
    precip_col = ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE").filterDate(start_date, end_date).select("pr")
    annual_precip = precip_col.sum().clip(aoi).rename("annual_precip")
    monthly_precip = annual_precip.divide(12).rename("monthly_precip")
    
    return aoi, annual_precip, monthly_precip, precip_col


def apply_natural_breaks(img: ee.Image, aoi: ee.Geometry, scale: int, n_classes: int = 5):
    from gee.classify_utils import get_jenks_breaks
    hist = img.reduceRegion(
        reducer=ee.Reducer.autoHistogram(maxBuckets=100),
        geometry=aoi, scale=scale, maxPixels=10000, bestEffort=True
    ).getInfo()
    
    band_name = img.bandNames().get(0).getInfo()
    band_hist = hist.get(band_name) if hist else []
    
    if not band_hist:
        return img, [0, 50, 100, 150]
        
    bps = get_jenks_breaks(band_hist, n_classes)
    
    # Handle highly uniform data (e.g. single pixel values due to coarse resolution)
    if len(bps) == 1 or (len(bps) > 1 and (bps[-1] - bps[0]) < 0.0001):
        val = bps[0] if bps else 0
        bps = [val - 20, val - 10, val + 10, val + 20]
    else:
        while len(bps) < n_classes - 1:
            bps.append(bps[-1] + 0.001 if bps else 1.0)
        bps = bps[:n_classes-1]
    
    cls = ee.Image.constant(1).updateMask(img.mask())
    for i, bp in enumerate(bps):
        cls = cls.where(img.gt(bp), i + 2)
        
    return cls.clip(aoi), bps


def get_continuous_labels(breaks, unit=""):
    labels = []
    labels.append(f"Class 1 (< {breaks[0]:.1f}{unit})")
    for i in range(len(breaks) - 1):
        labels.append(f"Class {i+2} ({breaks[i]:.1f} - {breaks[i+1]:.1f}{unit})")
    labels.append(f"Class {len(breaks)+1} (> {breaks[-1]:.1f}{unit})")
    return labels


def compute_water_harvesting_map(aoi_config: dict, year: int) -> dict:
    cache_key = json.dumps({"aoi": aoi_config, "year": year}, sort_keys=True)
    with _lock:
        if cache_key in _cache_map:
            return _cache_map[cache_key]

    aoi, annual_precip, monthly_precip, _ = _build_water_harvesting_images(aoi_config, year)

    # Classify using natural breaks
    scale = get_dynamic_scale(aoi)
    classified_precip, breaks = apply_natural_breaks(monthly_precip, aoi, scale, len(_PRECIP_VIS["palette"]))
    
    vis_params = {"min": 1, "max": len(_PRECIP_VIS["palette"]), "palette": _PRECIP_VIS["palette"]}
    
    map_id = classified_precip.getMapId(vis_params)
    
    centroid = aoi.centroid(maxError=100).coordinates().getInfo()
    bounds = aoi.bounds().getInfo()["coordinates"][0]
    
    thumb_url = classified_precip.getThumbURL({
        **vis_params,
        "region": aoi.bounds(),
        "dimensions": 512,
        "format": "png"
    })
    
    labels = get_continuous_labels(breaks, " mm")

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": thumb_url,
        "center": [centroid[1], centroid[0]],
        "bbox": bounds,
        "labels": labels
    }
    with _lock:
        _cache_map[cache_key] = result
    return result


def recommend_tank(volume_liters: float) -> int:
    sizes = [250, 500, 1000, 2000, 2500, 3000, 5000, 10000]
    for size in sizes:
        if size >= volume_liters:
            return size
    return (int(volume_liters) // 5000 + 1) * 5000


def compute_water_harvesting_stats(aoi_config: dict, year: int, runoff_coefficient: float, manual_area_m2: float = None, use_building_footprint: bool = False, household_size: int = 5, daily_water_use_liters: int = 50) -> dict:
    cache_key = json.dumps({
        "aoi": aoi_config, "year": year, 
        "rc": runoff_coefficient, "ma": manual_area_m2, "ubf": use_building_footprint,
        "hs": household_size, "du": daily_water_use_liters
    }, sort_keys=True)
    with _lock:
        if cache_key in _cache_stats:
            return _cache_stats[cache_key]

    aoi, annual_precip, monthly_precip, precip_col = _build_water_harvesting_images(aoi_config, year)
    
    # Calculate Area
    if manual_area_m2 and manual_area_m2 > 0:
        area_m2 = manual_area_m2
    elif use_building_footprint:
        aoi_area = aoi.area(1).getInfo()
        
        # Dynamic scale to allow district-wide building footprint calculations without memory crashes
        calc_scale = 2
        if aoi_area > 50000000:  # > 50 sq km (e.g. Districts)
            calc_scale = 30
        elif aoi_area > 5000000: # > 5 sq km (e.g. Sectors)
            calc_scale = 10
            
        try:
            buildings = ee.FeatureCollection("GOOGLE/Research/open-buildings/v3/polygons").filterBounds(aoi)
            # Use rasterization to compute building area within AOI highly efficiently
            building_mask = ee.Image(0).paint(buildings, 1).clip(aoi)
            pixel_area = ee.Image.pixelArea().updateMask(building_mask.eq(1))
            area_dict = pixel_area.reduceRegion(
                reducer=ee.Reducer.sum(),
                geometry=aoi,
                scale=calc_scale,
                maxPixels=1e11
            ).getInfo()
            area_m2 = area_dict.get("area", 0.0)
            if area_m2 is None:
                area_m2 = 0.0
        except Exception:
            area_m2 = 0.0
    else:
        # Calculate area of polygon in square meters
        area_m2 = aoi.area(1).getInfo()
        
    # Extract time series of monthly precipitation over AOI
    def get_monthly(img):
        val = img.reduceRegion(reducer=ee.Reducer.mean(), geometry=aoi, scale=get_dynamic_scale(aoi), maxPixels=1e10).get('pr')
        return ee.Feature(None, {'pr': val})
    
    fc = precip_col.map(get_monthly)
    monthly_precip_series = fc.aggregate_array('pr').getInfo()
    monthly_precip_series = [float(v) if v is not None else 0.0 for v in monthly_precip_series]
    
    # Pad to 12 months if necessary (TerraClimate should have 12)
    while len(monthly_precip_series) < 12:
        monthly_precip_series.append(0.0)
    monthly_precip_series = monthly_precip_series[:12]
    
    # Calculate Total Annual Harvest
    annual_precip_mm = sum(monthly_precip_series)
    annual_volume_liters = area_m2 * annual_precip_mm * runoff_coefficient
    
    # Household demand
    daily_demand = household_size * daily_water_use_liters
    monthly_demand = daily_demand * 30.4 # Average days in a month
    annual_demand = monthly_demand * 12
    
    # Tank Simulation
    tank_sizes = [250, 500, 1000, 2000, 3000, 5000, 10000, 15000, 20000, 25000, 50000, 100000]
    recommended_tank = None
    best_months_met = 0
    
    for tank_size in tank_sizes:
        storage = 0
        months_met = 0
        # Simulate over 2 years to allow reservoir to carry over
        simulation_months = monthly_precip_series * 2
        for pr in simulation_months:
            inflow = area_m2 * pr * runoff_coefficient
            storage += inflow
            if storage > tank_size:
                storage = tank_size
            
            if storage >= monthly_demand:
                storage -= monthly_demand
                months_met += 1
            else:
                storage = 0
                
        if months_met >= 24:
            recommended_tank = tank_size
            best_months_met = 12
            break
        else:
            if months_met // 2 > best_months_met:
                best_months_met = months_met // 2
                
    if recommended_tank is None:
        recommended_tank = tank_sizes[-1]

    # Overall demand met percentage based on pure volume, capped at 100
    demand_met_percent = (annual_volume_liters / annual_demand * 100) if annual_demand > 0 else 100
    if demand_met_percent > 100:
        demand_met_percent = 100

    out = {
        "area_m2": round(area_m2, 2),
        "annual_precip_mm": round(annual_precip_mm, 2),
        "annual_volume_liters": round(annual_volume_liters, 2),
        "recommended_tank_liters": recommended_tank,
        "runoff_coefficient": runoff_coefficient,
        "annual_demand_liters": round(annual_demand, 2),
        "demand_met_percent": round(demand_met_percent, 1),
        "months_of_autonomy": best_months_met
    }
    
    with _lock:
        _cache_stats[cache_key] = out
    return out


def compute_water_harvesting_export(aoi_config: dict, year: int) -> dict:
    cache_key = json.dumps({"aoi": aoi_config, "year": year}, sort_keys=True)
    with _lock:
        if cache_key in _cache_export:
            return _cache_export[cache_key]

    aoi, annual_precip, monthly_precip, _ = _build_water_harvesting_images(aoi_config, year)
    
    # Classify using natural breaks for export
    scale = get_dynamic_scale(aoi)
    classified_precip, breaks = apply_natural_breaks(monthly_precip, aoi, scale, len(_PRECIP_VIS["palette"]))
    
    try:
        download_url = monthly_precip.getDownloadURL({
            "scale": 30, # High res for export
            "region": aoi.bounds(),
            "format": "GEO_TIFF"
        })
    except Exception:
        download_url = None
        
    labels = get_continuous_labels(breaks, " mm")

    result = {
        "download_url": download_url,
        "labels": labels
    }
    with _lock:
        _cache_export[cache_key] = result
    return result
