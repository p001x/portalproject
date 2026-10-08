from gee.persistent_cache import with_cache
from gee.aoi_utils import get_bounds_and_center
"""Irrigation Scheduling Advisor — FastAPI backend."""
import json
import ee
from typing import Optional
from gee.classify_utils import quantile_classify

from gee.aoi_utils import get_dynamic_scale

from gee.persistent_cache import PersistentCache
from threading import Lock

_cache_map = PersistentCache(ttl=3600)
_cache_stats = PersistentCache(ttl=3600)
_cache_export = PersistentCache(ttl=3600)
_lock = Lock()

_DEFICIT_VIS = {"min": -20, "max": 20, "palette": ["#0000ff", "#a3ccff", "#ffffff", "#ff9999", "#ff0000"]}
_ET_VIS = {"min": 0, "max": 30, "palette": ["#ffffcc", "#c2e699", "#78c679", "#31a354", "#006837"]}
_PRECIP_VIS = {"min": 0, "max": 50, "palette": ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"]}
_SM_VIS = {"min": 0, "max": 250, "palette": ["#fff5f0", "#fcbba1", "#fb6a4a", "#cb181d", "#67000d"]}

def _build_irrigation_images(aoi_config: dict, start_date: str, end_date: str, planting_date: str, crop_type: str):
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)

    # 1. Dynamic Kc Calculation
    ee_start = ee.Date(start_date)
    ee_end = ee.Date(end_date)
    ee_plant = ee.Date(planting_date)
    
    # Calculate DAP for the midpoint of the requested period
    ee_mid = ee.Date(ee_start.millis().add(ee_end.millis()).divide(2))
    dap = ee_mid.difference(ee_plant, 'day')

    # FAO-56 Crop params (Lengths in days: ini, dev, mid, late), (Kc: ini, mid, late)
    crop_params = {
        "Maize": {"stages": [20, 35, 40, 30], "kc": [0.3, 1.2, 0.35], "root": 1000},
        "Beans": {"stages": [15, 25, 35, 20], "kc": [0.4, 1.15, 0.35], "root": 600},
        "Potatoes": {"stages": [25, 30, 45, 30], "kc": [0.5, 1.15, 0.75], "root": 500},
        "Rice": {"stages": [30, 30, 60, 30], "kc": [1.05, 1.20, 0.90], "root": 500},
        "Coffee": {"stages": [0, 0, 365, 0], "kc": [0.95, 0.95, 0.95], "root": 1200},
        "Tea": {"stages": [0, 0, 365, 0], "kc": [0.95, 0.95, 0.95], "root": 1200},
        "Generic": {"stages": [20, 30, 40, 20], "kc": [0.4, 1.0, 0.5], "root": 800}
    }
    
    params = crop_params.get(crop_type, crop_params["Generic"])
    L_ini, L_dev, L_mid, L_late = params["stages"]
    Kc_ini, Kc_mid, Kc_late = params["kc"]
    root_depth_mm = params["root"]
    
    t1 = L_ini
    t2 = t1 + L_dev
    t3 = t2 + L_mid
    t4 = t3 + L_late
    
    # Linear interpolation for dev and late
    kc_dev = ee.Number(Kc_ini).add(ee.Number(Kc_mid).subtract(Kc_ini).multiply(dap.subtract(t1).divide(L_dev)))
    kc_lat = ee.Number(Kc_mid).add(ee.Number(Kc_late).subtract(Kc_mid).multiply(dap.subtract(t3).divide(L_late)))
    
    kc_val = ee.Algorithms.If(
        dap.lt(0), 0.0,
        ee.Algorithms.If(
            dap.lte(t1), Kc_ini,
            ee.Algorithms.If(
                dap.lte(t2), kc_dev,
                ee.Algorithms.If(
                    dap.lte(t3), Kc_mid,
                    ee.Algorithms.If(
                        dap.lte(t4), kc_lat,
                        Kc_late 
                    )
                )
            )
        )
    )
    kc = ee.Number(kc_val).max(0.1)

    # 2. Potential Evapotranspiration (PET)
    if start_date < "2001-01-01":
        pet_col = ee.ImageCollection("ECMWF/ERA5_LAND/HOURLY").filterDate(start_date, end_date).select("potential_evaporation")
        pet_sum = pet_col.sum().multiply(-1000)
    else:
        pet_col = ee.ImageCollection("MODIS/061/MOD16A2").filterDate(start_date, end_date).select("PET")
        pet_sum = pet_col.sum().multiply(0.1)

    pet_total = ee.Image(ee.Algorithms.If(
        pet_col.size().eq(0),
        ee.Image.constant(0).rename("pet").clip(aoi),
        pet_sum.rename("pet").clip(aoi).unmask(0)
    ))
    
    etc = pet_total.multiply(ee.Image.constant(kc)).rename("etc")

    try:
        bounds_coords = aoi.bounds(maxError=1000).coordinates().get(0).getInfo()
        lats = [pt[1] for pt in bounds_coords]
        use_era5_precip = max(lats) > 50 or min(lats) < -50
    except:
        use_era5_precip = True

    # 3. Effective Precipitation
    if use_era5_precip or start_date < "1981-01-01":
        precip_col = ee.ImageCollection("ECMWF/ERA5_LAND/HOURLY").filterDate(start_date, end_date)
        p = precip_col.select("total_precipitation").sum().multiply(1000)
        # Simple effective rain for the total block (assumes ~75% effective)
        peff_sum = p.multiply(0.75)
    else:
        precip_col = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate(start_date, end_date)
        def calc_peff(img):
            p = img.select(0)
            peff = p.expression('P > 5 ? (P - 5) : 0', {'P': p})
            return peff.rename('peff')
        peff_sum = precip_col.map(calc_peff).sum()
    
    peff_total = ee.Image(ee.Algorithms.If(
        precip_col.size().eq(0),
        ee.Image.constant(0).rename("precip").clip(aoi),
        peff_sum.rename("precip").clip(aoi).unmask(0)
    ))

    # 4. Soil Water Capacity (TAW)
    fc_img = ee.Image("OpenLandMap/SOL/SOL_WATERCONTENT-33KPA_USDA-4B1C_M/v01").select('b0').divide(100)
    # The 1500kPa (Wilting Point) asset is currently unavailable in Earth Engine:
    # 'OpenLandMap/SOL/SOL_WATERCONTENT-1500KPA_USDA-4B1C_M/v01' returns Not Found.
    # We estimate Permanent Wilting Point (PWP) as ~50% of Field Capacity (FC) for medium soils.
    pwp_img = fc_img.multiply(0.5)
    
    taw = fc_img.subtract(pwp_img).multiply(root_depth_mm).max(10).rename("taw")

    # 5. Irrigation Deficit (mm) = ETc - Peff
    deficit = etc.subtract(peff_total).rename("deficit")
    
    return aoi, deficit, etc, peff_total, taw, kc


@with_cache
def compute_irrigation_map(
    aoi_config: dict, 
    start_date: str, 
    end_date: str, 
    planting_date: str, 
    crop_type: str,
    n_classes: int = 5,
    method: str = "continuous",
    custom_labels: Optional[list] = None
) -> dict:
    labels_tuple = tuple(custom_labels) if custom_labels else None
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_date, end_date, planting_date, crop_type, n_classes, method, labels_tuple)
    
    with _lock:
        if cache_key in _cache_map:
            return _cache_map[cache_key]

    aoi, deficit, etc, precip, sm, kc = _build_irrigation_images(aoi_config, start_date, end_date, planting_date, crop_type)
    
    map_id = deficit.getMapId(_DEFICIT_VIS)
    etc_id = etc.getMapId(_ET_VIS)
    precip_id = precip.getMapId(_PRECIP_VIS)
    sm_id = sm.getMapId(_SM_VIS)

    centroid = aoi.centroid(maxError=100).coordinates().getInfo()
    bounds, _ = get_bounds_and_center(aoi)
    
    dynamic_scale = get_dynamic_scale(aoi)

    classify_res = None
    if method != "continuous":
        classify_res = quantile_classify(
            layers=[{"name": "Deficit", "image": deficit, "title": "Irrigation Deficit"}],
            aoi=aoi,
            scale=dynamic_scale,
            n_classes=n_classes,
            reverse_palette=True, # Red is high deficit, Blue is surplus
            method=method,
            custom_labels=custom_labels,
        )

    factor_maps = {
        "etc": {"tile_url": etc_id["tile_fetcher"].url_format},
        "precip": {"tile_url": precip_id["tile_fetcher"].url_format},
        "sm": {"tile_url": sm_id["tile_fetcher"].url_format},
    }

    result = {
        "tile_url": map_id["tile_fetcher"].url_format,
        "factor_maps": factor_maps,
        "center": [centroid[1], centroid[0]],
        "bbox": bounds,
        "method": method,
        "n_classes": n_classes,
    }
    
    if classify_res:
        result["classify"] = classify_res

    with _lock:
        _cache_map[cache_key] = result
    return result


@with_cache
def compute_irrigation_stats(
    aoi_config: dict, start_date: str, end_date: str, planting_date: str, crop_type: str
) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_date, end_date, planting_date, crop_type)
    
    with _lock:
        if cache_key in _cache_stats:
            return _cache_stats[cache_key]

    aoi, deficit, etc, precip, sm, kc = _build_irrigation_images(aoi_config, start_date, end_date, planting_date, crop_type)

    mean_reducer = ee.Reducer.mean()
    
    def get_mean(img):
        res = img.reduceRegion(reducer=mean_reducer, geometry=aoi.bounds(maxError=1000), scale=get_dynamic_scale(aoi), maxPixels=1e10).getInfo()
        if not res: return 0.0
        vals = list(res.values())
        return vals[0] if vals and vals[0] is not None else 0.0

    mean_deficit = get_mean(deficit)
    mean_etc = get_mean(etc)
    mean_precip = get_mean(precip)
    mean_taw = get_mean(sm)
    
    # Retrieve Kc value
    kc_value = kc.getInfo()

    # Generate Recommendation based on MAD
    # Management Allowable Depletion (MAD) is typically 50% of TAW
    mad_threshold = mean_taw * 0.5

    if mean_deficit > mad_threshold:
        recommendation = f"Critical: Depletion ({round(mean_deficit)}mm) exceeds Allowable Depletion ({round(mad_threshold)}mm). Irrigate immediately."
        status = "irrigate"
    elif mean_deficit > 0:
        recommendation = f"Monitor: Depletion ({round(mean_deficit)}mm) is below threshold ({round(mad_threshold)}mm)."
        status = "monitor"
    else:
        recommendation = "Skip irrigation, sufficient moisture/rainfall."
        status = "skip"

    result = {
        "mean_deficit_mm": round(mean_deficit, 2),
        "mean_etc_mm": round(mean_etc, 2),
        "mean_precip_mm": round(mean_precip, 2),
        "mean_sm_mm": round(mean_taw, 2), # Using TAW here
        "recommendation": recommendation,
        "status": status,
        "kc_used": round(kc_value, 2)
    }

    with _lock:
        _cache_stats[cache_key] = result
    return result


@with_cache
def compute_irrigation_export(
    aoi_config: dict, start_date: str, end_date: str, planting_date: str, crop_type: str
) -> dict:
    cache_key = (json.dumps(aoi_config, sort_keys=True), start_date, end_date, planting_date, crop_type)
    
    with _lock:
        if cache_key in _cache_export:
            return _cache_export[cache_key]

    aoi, deficit, etc, precip, sm, kc = _build_irrigation_images(aoi_config, start_date, end_date, planting_date, crop_type)

    def safe_url(img, name):
        try:
            return img.getDownloadURL({"scale": 1000, "region": aoi.bounds(), "format": "GEO_TIFF"})
        except Exception:
            return None

    def safe_thumb(img, vis):
        try:
            return img.getThumbURL({**vis, "region": aoi.bounds(), "dimensions": 512, "crs": "EPSG:4326", "format": "png"})
        except Exception:
            return None
            
    def get_continuous_labels(vis, unit=""):
        min_v = vis["min"]
        max_v = vis["max"]
        n_classes = len(vis["palette"])
        step = (max_v - min_v) / n_classes
        labels = []
        for i in range(n_classes):
            start = min_v + i * step
            end = min_v + (i + 1) * step
            if i == 0:
                labels.append(f"< {end:.1f}{unit}")
            elif i == n_classes - 1:
                labels.append(f"> {start:.1f}{unit}")
            else:
                labels.append(f"{start:.1f} - {end:.1f}{unit}")
        return labels

    result = {
        "download_url": safe_url(deficit, "Irrigation_Deficit"),
        "thumb_url": safe_thumb(deficit, _DEFICIT_VIS),
        "labels": get_continuous_labels(_DEFICIT_VIS, " mm"),
        "factors": {
            "etc": {
                "download_url": safe_url(etc, "ETc"),
                "thumb_url": safe_thumb(etc, _ET_VIS),
                "labels": get_continuous_labels(_ET_VIS, " mm")
            },
            "precip": {
                "download_url": safe_url(precip, "Precipitation"),
                "thumb_url": safe_thumb(precip, _PRECIP_VIS),
                "labels": get_continuous_labels(_PRECIP_VIS, " mm")
            },
            "sm": {
                "download_url": safe_url(sm, "Soil_Moisture"),
                "thumb_url": safe_thumb(sm, _SM_VIS),
                "labels": get_continuous_labels(_SM_VIS, " mm")
            }
        }
    }

    with _lock:
        _cache_export[cache_key] = result
    return result
