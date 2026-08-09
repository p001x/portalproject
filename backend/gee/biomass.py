import ee
from .aoi_utils import get_aoi_geometry
import concurrent.futures

_PALETTE = ["#0000ff", "#00ffff", "#00ff00", "#ffff00", "#ff0000"]
_VIS = {"min": 0, "max": 100, "palette": _PALETTE}

def compute_biomass_depletion(aoi_config: dict, buffer_km: float = 3.0, year_start: int = 2019, year_end: int = 2023):
    """
    Computes Firewood/Biomass Depletion Risk.
    Risk (0-100) = Proximity to settlement * (Recent Forest Loss OR NDVI Degradation) * Forest Baseline
    """
    
    aoi = get_aoi_geometry(aoi_config)
    
    # 1. Settlement Proximity Risk (WorldPop)
    pop = ee.ImageCollection("WorldPop/GP/100m/pop_age_sex_cons_unadj") \
        .filter(ee.Filter.inList('country', ['RWA'])) \
        .filterDate('2020-01-01', '2021-01-01') \
        .mean()
    
    # Distance to areas with > 10 people per pixel.
    # fastDistanceTransform measures distance to nearest 0 pixel in pixels.
    # We make settlements 0, everything else 1.
    settlements_inv = pop.lte(10)
    # Convert pixel distance to meters (approx 100m per WorldPop pixel)
    dist_m = settlements_inv.fastDistanceTransform(256).multiply(100)
    
    max_dist = buffer_km * 1000
    # Proximity risk: 1.0 at settlement (0 dist), 0.0 at max_dist
    proximity_risk = ee.Image(1).subtract(dist_m.divide(max_dist)).clamp(0, 1)
    
    # 2. Forest Baseline & Clear-cut Loss (Hansen)
    hansen = ee.Image("UMD/hansen/global_forest_change_2022_v1_10")
    forest_mask = hansen.select('treecover2000').gt(30)
    
    # Recent clear-cut loss (e.g. 2019 = 19 in lossyear)
    recent_loss = hansen.select('lossyear').gte(year_start - 2000)
    
    # 3. NDVI Degradation (Thinning/Gathering) - Sentinel-2 Dry Season (Jun-Aug)
    s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED") \
        .filterBounds(aoi) \
        .filter(ee.Filter.calendarRange(6, 8, 'month')) \
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60))
        
    def get_annual_ndvi(y):
        start = ee.Date.fromYMD(y, 1, 1)
        end = ee.Date.fromYMD(y, 12, 31)
        img = s2.filterDate(start, end).median()
        ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI')
        return ndvi.addBands(ee.Image.constant(y).rename('year')).float()
        
    years = ee.List.sequence(year_start, year_end)
    ndvi_col = ee.ImageCollection(years.map(get_annual_ndvi))
    
    # Linear trend of NDVI over time
    trend = ndvi_col.select(['year', 'NDVI']).reduce(ee.Reducer.linearFit())
    slope = trend.select('scale')
    
    # Convert negative slope (greenness loss) to risk 0-1
    # A slope of -0.05 NDVI per year is very high degradation
    degradation_risk = slope.multiply(-1).divide(0.05).clamp(0, 1).unmask(0)
    
    # 4. Final Biomass Depletion Score
    # Risk is max of clear-cut loss or gradual degradation
    combined_loss_risk = degradation_risk.max(recent_loss.unmask(0))

    
    depletion_score = proximity_risk.multiply(combined_loss_risk).multiply(forest_mask).multiply(100).round()
    depletion_score = depletion_score.clip(aoi).rename('depletion_risk')
    
    # Mask out 0 areas so the map isn't covered in solid 0 values
    depletion_score = depletion_score.updateMask(depletion_score.gt(0))
    
    # 5. Statistics
    with concurrent.futures.ThreadPoolExecutor() as executor:
        f_stats = executor.submit(
            lambda: depletion_score.reduceRegion(
                reducer=ee.Reducer.mean().combine(ee.Reducer.max(), sharedInputs=True),
                geometry=aoi,
                scale=100,
                maxPixels=1e9,
                bestEffort=True
            ).getInfo()
        )
        
        # Area distribution
        # Let's group into classes: High (75-100), Moderate (50-75), Low (25-50), Minimal (1-25)
        classes = ee.Image(0) \
            .where(depletion_score.gt(0).And(depletion_score.lte(25)), 1) \
            .where(depletion_score.gt(25).And(depletion_score.lte(50)), 2) \
            .where(depletion_score.gt(50).And(depletion_score.lte(75)), 3) \
            .where(depletion_score.gt(75), 4) \
            .updateMask(depletion_score.gt(0))
            
        area_img = ee.Image.pixelArea().addBands(classes).reduceRegion(
            reducer=ee.Reducer.sum().group(groupField=1, groupName='class'),
            geometry=aoi,
            scale=100,
            maxPixels=1e9,
            bestEffort=True
        )
        
        f_area = executor.submit(lambda: area_img.getInfo())
        f_bounds = executor.submit(lambda: aoi.bounds().getInfo()["coordinates"][0])
        
        stats_raw = f_stats.result()
        area_raw = f_area.result()
        bounds = f_bounds.result()
        
    area_groups = area_raw.get('groups', [])
    area_dict = {str(int(g['class'])): g['sum'] for g in area_groups}
    
    class_areas_km2 = {
        "High Risk (75-100)": round(area_dict.get('4', 0) / 1e6, 2),
        "Moderate Risk (50-75)": round(area_dict.get('3', 0) / 1e6, 2),
        "Low Risk (25-50)": round(area_dict.get('2', 0) / 1e6, 2),
        "Minimal Risk (1-25)": round(area_dict.get('1', 0) / 1e6, 2)
    }

    heatmap_vis = depletion_score.unmask(0).focal_max(radius=1000, units="meters").focal_mean(radius=2000, units="meters").clip(aoi)
    heatmap_vis = heatmap_vis.updateMask(heatmap_vis.gt(5))

    map_id = heatmap_vis.getMapId(_VIS)
    
    thumb_url = heatmap_vis.getThumbURL({
        "min": _VIS["min"], "max": _VIS["max"], "palette": _VIS["palette"],
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
    for key, f_data in factor_maps.items():
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
        
        factor_results[key] = {
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
    
    center_lon = (bounds[0][0] + bounds[2][0]) / 2
    center_lat = (bounds[0][1] + bounds[2][1]) / 2

    return {
        "tile_url": map_id["tile_fetcher"].url_format,
        "thumb_url": thumb_url,
        "factor_maps": factor_results,
        "center": [center_lat, center_lon],
        "bbox": bounds,
        "stats": {
            "Mean Depletion Risk": round(stats_raw.get("depletion_risk_mean", 0) or 0, 1),
            "Max Depletion Risk": round(stats_raw.get("depletion_risk_max", 0) or 0, 1)
        },
        "class_areas_km2": class_areas_km2,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI"))
    }

def export_factor_map(aoi_config: dict, factor_key: str, palette: list = None, buffer_km: float = 3.0, year_start: int = 2019, year_end: int = 2023):
    """
    Export a specific biomass factor as a GeoTIFF, either raw or styled (RGB).
    """
    aoi = get_aoi_geometry(aoi_config)
    
    if factor_key == "proximity":
        pop = ee.ImageCollection("WorldPop/GP/100m/pop_age_sex_cons_unadj") \
            .filter(ee.Filter.inList('country', ['RWA'])) \
            .filterDate('2020-01-01', '2021-01-01').mean()
        dist_m = pop.lte(10).fastDistanceTransform(256).multiply(100)
        img = ee.Image(1).subtract(dist_m.divide(buffer_km * 1000)).clamp(0, 1)
        img = img.clip(aoi).multiply(100).round()
        default_palette = ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"]
        vis_min, vis_max = 0, 100
        
    elif factor_key == "recent_loss":
        hansen = ee.Image("UMD/hansen/global_forest_change_2022_v1_10")
        img = hansen.select('lossyear').gte(year_start - 2000).clip(aoi).unmask(0)
        default_palette = ["#ffffff", "#d73027"]
        vis_min, vis_max = 0, 1
        
    elif factor_key == "degradation":
        s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED") \
            .filterBounds(aoi) \
            .filter(ee.Filter.calendarRange(6, 8, 'month')) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60))
        def get_annual_ndvi(y):
            start = ee.Date.fromYMD(y, 1, 1)
            end = ee.Date.fromYMD(y, 12, 31)
            ndvi = s2.filterDate(start, end).median().normalizedDifference(['B8', 'B4']).rename('NDVI')
            return ndvi.addBands(ee.Image.constant(y).rename('year')).float()
        years = ee.List.sequence(year_start, year_end)
        ndvi_col = ee.ImageCollection(years.map(get_annual_ndvi))
        slope = ndvi_col.select(['year', 'NDVI']).reduce(ee.Reducer.linearFit()).select('scale')
        img = slope.multiply(-1).divide(0.05).clamp(0, 1).unmask(0).clip(aoi).multiply(100).round()
        default_palette = ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#b10026"]
        vis_min, vis_max = 0, 100
        
    elif factor_key == "baseline":
        hansen = ee.Image("UMD/hansen/global_forest_change_2022_v1_10")
        img = hansen.select('treecover2000').gt(30).clip(aoi)
        default_palette = ["#ffffff", "#238b45"]
        vis_min, vis_max = 0, 1
    
    else:
        raise ValueError(f"Unknown factor {factor_key}")
        
    if palette:
        # User requested a styled RGB export
        styled = img.visualize(min=vis_min, max=vis_max, palette=palette)
        url = styled.getDownloadURL({
            "name": f"biomass_{factor_key}_styled",
            "scale": 100,
            "region": aoi.bounds(),
            "format": "GEO_TIFF"
        })
    else:
        # Raw data export
        url = img.toFloat().getDownloadURL({
            "name": f"biomass_{factor_key}_raw",
            "scale": 100,
            "region": aoi.bounds(),
            "format": "GEO_TIFF"
        })
        
    return {"download_url": url}

