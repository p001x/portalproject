import ee
from .aoi_utils import get_aoi_geometry
import concurrent.futures
from .classify_utils import quantile_classify

_PALETTE = ["#0000ff", "#00ffff", "#00ff00", "#ffff00", "#ff0000"]
_VIS = {"min": 0, "max": 100, "palette": _PALETTE}

def _build_biomass_base(aoi_config: dict, buffer_km: float = 3.0, year_start: int = 2019, year_end: int = 2023):
    aoi = get_aoi_geometry(aoi_config)
    area_sqkm = aoi.area().divide(1e6).getInfo()
    if area_sqkm > 10000:
        dynamic_scale = 500
    elif area_sqkm > 2000:
        dynamic_scale = 250
    elif area_sqkm > 500:
        dynamic_scale = 100
    else:
        dynamic_scale = 30

    pop = ee.ImageCollection("WorldPop/GP/100m/pop_age_sex_cons_unadj") \
        .filter(ee.Filter.inList('country', ['RWA'])) \
        .filterDate('2020-01-01', '2021-01-01').mean()
    
    settlements_inv = pop.lte(10)
    dist_m = settlements_inv.fastDistanceTransform(256).multiply(100)
    max_dist = buffer_km * 1000
    proximity_risk = ee.Image(1).subtract(dist_m.divide(max_dist)).clamp(0, 1)
    
    hansen = ee.Image("UMD/hansen/global_forest_change_2022_v1_10")
    forest_mask = hansen.select('treecover2000').gt(30)
    recent_loss = hansen.select('lossyear').gte(year_start - 2000)
    
    from gee.aoi_utils import get_historical_ndvi
    ndvi_images = []
    for y in range(year_start, year_end + 1):
        start_date = f"{y}-06-01"
        end_date = f"{y}-08-31"
        ndvi = get_historical_ndvi(aoi, y, start_date, end_date, 60).rename('NDVI')
        ndvi_images.append(ndvi.addBands(ee.Image.constant(y).rename('year')).float())
        
    ndvi_col = ee.ImageCollection(ndvi_images)
    trend = ndvi_col.select(['year', 'NDVI']).reduce(ee.Reducer.linearFit())
    slope = trend.select('scale')
    degradation_risk = slope.multiply(-1).divide(0.05).clamp(0, 1).unmask(0)
    
    combined_loss_risk = degradation_risk.max(recent_loss.unmask(0))
    depletion_score = proximity_risk.multiply(combined_loss_risk).multiply(forest_mask).multiply(100).round()
    depletion_score = depletion_score.clip(aoi).rename('depletion_risk')
    depletion_score = depletion_score.updateMask(depletion_score.gt(0))
    
    return aoi, dynamic_scale, depletion_score, proximity_risk, recent_loss, degradation_risk, forest_mask

def compute_biomass_map(aoi_config: dict, buffer_km: float = 3.0, year_start: int = 2019, year_end: int = 2023) -> dict:
    aoi, dynamic_scale, depletion_score, proximity_risk, recent_loss, degradation_risk, forest_mask = _build_biomass_base(aoi_config, buffer_km, year_start, year_end)

    classes = ee.Image(0) \
        .where(depletion_score.gt(0).And(depletion_score.lte(25)), 1) \
        .where(depletion_score.gt(25).And(depletion_score.lte(50)), 2) \
        .where(depletion_score.gt(50).And(depletion_score.lte(75)), 3) \
        .where(depletion_score.gt(75), 4) \
        .updateMask(depletion_score.gt(0))

    _CLASS_VIS = {"min": 1, "max": 4, "palette": ["#0000ff", "#00ff00", "#ffff00", "#ff0000"]}
    map_id = classes.getMapId(_CLASS_VIS)
    
    thumb_url = classes.getThumbURL({
        "min": _CLASS_VIS["min"], "max": _CLASS_VIS["max"], "palette": _CLASS_VIS["palette"],
        "dimensions": 512, "region": aoi.bounds(), "format": "png"
    })
    
    factor_maps = {
        "proximity": {
            "title": "Settlement Proximity Risk",
            "image": proximity_risk.clip(aoi).multiply(100).round(),
            "description": "Proximity to populated settlements. Closer areas are at higher risk of biomass extraction.",
            "min": 0, "max": 100,
            "palette": ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"],
            "unit": "Score (0-100)",
            "reverse": False
        },
        "recent_loss": {
            "title": "Recent Forest Loss",
            "image": recent_loss.clip(aoi).unmask(0),
            "description": "Areas that have experienced clear-cut forest loss since the selected start year.",
            "min": 0, "max": 1,
            "palette": ["#ffffff", "#d73027"],
            "unit": "Binary (1=Loss)",
            "reverse": False
        },
        "degradation": {
            "title": "Gradual NDVI Degradation",
            "image": degradation_risk.clip(aoi).unmask(0).multiply(100).round(),
            "description": "Areas showing gradual loss of vegetation greenness (NDVI trend).",
            "min": 0, "max": 100,
            "palette": ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#b10026"],
            "unit": "Score (0-100)",
            "reverse": False
        },
        "baseline": {
            "title": "Forest Cover Baseline",
            "image": forest_mask.clip(aoi),
            "description": "Baseline forest cover before recent losses or degradation.",
            "min": 0, "max": 1,
            "palette": ["#ffffff", "#238b45"],
            "unit": "Binary (1=Forest)",
            "reverse": False
        }
    }
    
    factor_results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        def process_factor(key, f_data):
            img = f_data["image"]
            f_vis = {"min": f_data["min"], "max": f_data["max"], "palette": f_data["palette"]}
            if f_data["max"] == 1:
                img = img.updateMask(img.gt(0))
            f_mapid = img.getMapId(f_vis)
            f_thumb = img.getThumbURL({
                "min": f_vis["min"], "max": f_vis["max"], 
                "palette": f_vis["palette"], 
                "dimensions": 512, "region": aoi.bounds(), "format": "png"
            })
            return key, {
                "title": f_data["title"],
                "description": f_data["description"],
                "tile_url": f_mapid["tile_fetcher"].url_format,
                "thumb_url": f_thumb,
                "min": f_vis["min"],
                "max": f_vis["max"],
                "palette": f_vis["palette"],
                "unit": f_data["unit"],
                "reverse": f_data["reverse"]
            }
        
        futures = [executor.submit(process_factor, key, f_data) for key, f_data in factor_maps.items()]
        for future in concurrent.futures.as_completed(futures):
            k, result_dict = future.result()
            factor_results[k] = result_dict

    bounds = aoi.bounds().getInfo()["coordinates"][0]
    center_lon = (bounds[0][0] + bounds[2][0]) / 2
    center_lat = (bounds[0][1] + bounds[2][1]) / 2

    return {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": thumb_url,
        "factor_maps": factor_results,
        "center": [center_lat, center_lon],
        "bbox": bounds,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI"))
    }

def compute_biomass_stats(aoi_config: dict, buffer_km: float = 3.0, year_start: int = 2019, year_end: int = 2023) -> dict:
    aoi, dynamic_scale, depletion_score, _, _, _, _ = _build_biomass_base(aoi_config, buffer_km, year_start, year_end)

    stats_raw = depletion_score.reduceRegion(
        reducer=ee.Reducer.mean().combine(ee.Reducer.max(), sharedInputs=True),
        geometry=aoi,
        scale=dynamic_scale,
        maxPixels=1e10
    ).getInfo()

    return {
        "stats": {
            "Mean Depletion Risk": round(stats_raw.get("depletion_risk_mean", 0) or 0, 1),
            "Max Depletion Risk": round(stats_raw.get("depletion_risk_max", 0) or 0, 1)
        }
    }

def compute_biomass_classify(aoi_config: dict, buffer_km: float = 3.0, year_start: int = 2019, year_end: int = 2023, n_classes: int = 4, method: str = "natural_breaks", custom_labels: list = None) -> dict:
    aoi, dynamic_scale, depletion_score, _, _, _, _ = _build_biomass_base(aoi_config, buffer_km, year_start, year_end)

    layers = [{
        "name": "risk_index",
        "title": "Biomass Depletion Risk",
        "image": depletion_score,
        "mask": depletion_score.gt(0)
    }]

    return quantile_classify(
        layers=layers,
        aoi=aoi,
        scale=dynamic_scale,
        n_classes=n_classes,
        reverse_palette=False,
        custom_labels=custom_labels,
        method=method
    )

def compute_biomass_export(aoi_config: dict, buffer_km: float = 3.0, year_start: int = 2019, year_end: int = 2023) -> dict:
    aoi, _, depletion_score, _, _, _, _ = _build_biomass_base(aoi_config, buffer_km, year_start, year_end)
    return {
        "download_url": depletion_score.getDownloadURL({
            "name": "biomass_depletion_risk",
            "scale": 100,
            "region": aoi.bounds(),
            "format": "GEO_TIFF",
            "crs": "EPSG:4326"
        })
    }

def export_factor_map(aoi_config: dict, factor_key: str, palette: list = None, buffer_km: float = 3.0, year_start: int = 2019, year_end: int = 2023):
    aoi, _, _, proximity_risk, recent_loss, degradation_risk, forest_mask = _build_biomass_base(aoi_config, buffer_km, year_start, year_end)
    
    if factor_key == "proximity":
        img = proximity_risk.clip(aoi).multiply(100).round()
        vis_min, vis_max = 0, 100
    elif factor_key == "recent_loss":
        img = recent_loss.clip(aoi).unmask(0)
        vis_min, vis_max = 0, 1
    elif factor_key == "degradation":
        img = degradation_risk.clip(aoi).unmask(0).multiply(100).round()
        vis_min, vis_max = 0, 100
    elif factor_key == "baseline":
        img = forest_mask.clip(aoi)
        vis_min, vis_max = 0, 1
    else:
        raise ValueError(f"Unknown factor {factor_key}")
        
    if palette:
        styled = img.visualize(min=vis_min, max=vis_max, palette=palette)
        url = styled.getDownloadURL({"name": f"biomass_{factor_key}_styled", "scale": 100, "region": aoi.bounds(), "format": "GEO_TIFF"})
    else:
        url = img.toFloat().getDownloadURL({"name": f"biomass_{factor_key}_raw", "scale": 100, "region": aoi.bounds(), "format": "GEO_TIFF"})
        
    return {"download_url": url}

