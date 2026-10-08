import ee
from .aoi_utils import get_aoi_geometry
import concurrent.futures
from .classify_utils import quantile_classify
from gee.persistent_cache import with_cache

_PALETTE = ["#0000ff", "#00ffff", "#00ff00", "#ffff00", "#ff0000"]
_VIS = {"min": 0, "max": 100, "palette": _PALETTE}

def _build_biomass_base(aoi_config: dict, buffer_km: float = 3.0, start_year: int = 2019, end_year: int = 2023):
    aoi = get_aoi_geometry(aoi_config)
    from gee.aoi_utils import get_dynamic_scale
    dynamic_scale = get_dynamic_scale(aoi)

    is_global = False
    try:
        geom_str = str(aoi.serialize())
        if "-180" in geom_str and "180" in geom_str and "90" in geom_str and "-90" in geom_str:
            is_global = True
    except:
        pass

    district = aoi_config.get("district", "")
    is_rwanda = district != "" or "rwanda" in aoi_config.get("name", "").lower()

    # 1. POPULATION & TERRAIN-WEIGHTED ROAD ACCESSIBILITY
    roads_fc = None
    if is_rwanda:
        try:
            from .crom_service import get_district_vectors
            district_name = aoi_config.get("district", aoi_config.get("name", "Unknown"))
            gdb_data = get_district_vectors(district_name)
            roads_geojson = gdb_data.get("roads")
            if roads_geojson and roads_geojson.get("features"):
                roads_fc = ee.FeatureCollection(roads_geojson["features"])
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to load roads from GDB: {e}")
    else:
        # Fallback to GlobalRoads for non-rwanda custom polygons
        roads_fc = ee.FeatureCollection("projects/sat-io/open-datasets/GRIP4/GlobalRoads").filterBounds(aoi)

    # Use WorldPop population density for weighting demand
    pop = ee.ImageCollection("WorldPop/GP/100m/pop") \
        .filterBounds(aoi) \
        .filterDate('2020-01-01', '2020-12-31') \
        .mosaic() \
        .select('population')
    
    pop_density = pop.unmask(0).clamp(0, 1000).divide(1000)
    max_dist = buffer_km * 1000
    
    if roads_fc is not None:
        # Rasterize roads to avoid Memory Capacity Exceeded tile cuts from vector distance
        # Paint roads as 0, background as 1, so fastDistanceTransform finds distance to roads
        roads_img = ee.Image(1).paint(roads_fc, 0)
        # Compute raster distance, force 100m scale for true metric distance
        dist_m = roads_img.fastDistanceTransform(256).multiply(100).reproject(crs='EPSG:4326', scale=100)
        
        # Spatial interpolation (Gaussian-like decay) for smoother accessibility mapping
        # 1.0 at distance 0, decaying towards 0 at max_dist
        normalized_dist = dist_m.divide(max_dist).clamp(0, 1)
        proximity_base = ee.Image(1).subtract(normalized_dist).pow(1.5).unmask(0)
    else:
        # Fallback to settlement distance if roads unavailable, forcing a fixed scale to avoid zoom artifacts
        settlements_inv = pop.lte(10)
        dist_m = settlements_inv.fastDistanceTransform(256).multiply(100).reproject(crs='EPSG:4326', scale=100)
        normalized_dist = dist_m.divide(max_dist).clamp(0, 1)
        proximity_base = ee.Image(1).subtract(normalized_dist).pow(1.5).unmask(0)

    # Elevation & Slope accessibility penalty
    dem = ee.Image("NASA/NASADEM_HGT/001").select('elevation').unmask(0, False)
    slope_deg = ee.Terrain.slope(dem)
    slope_penalty = slope_deg.divide(30).clamp(0, 1)

    # Friction/Accessibility adjusted for slope and population demand
    proximity_risk = proximity_base.multiply(ee.Image(1).subtract(slope_penalty.multiply(0.4)))
    proximity_risk = proximity_risk.multiply(ee.Image(0.6).add(pop_density.multiply(0.4))).clamp(0, 1)

    # 2. PHYSICAL BIOMASS TONNAGE (ESA CCI Biomass V6.0 with fallback to WCMC)
    # Band name in WCMC is 'carbon_tonnes_per_ha'
    wcmc = ee.Image("WCMC/biomass_carbon_density/v1_0/2010")
    wcmc_agb = wcmc.select('carbon_tonnes_per_ha').multiply(2).rename('agb')
    
    # Check ESA CCI Biomass (100m)
    esa_col = ee.ImageCollection("ESA/CCI/Above_Ground_Biomass/V6_0")
    esa_agb = ee.Image(esa_col.sort('system:time_start', False).mosaic()).select(['agb'], ['agb']).unmask(0)
    
    # Use ESA CCI where available (> 0), fallback to WCMC
    agb_tonnes_ha = esa_agb.where(esa_agb.lte(0), wcmc_agb).rename('agb')
    
    # 3. DIFFERENTIATE GRADUAL GATHERING vs CLEAR-CUTTING (Hansen Global Forest Change)
    gfc = ee.Image("UMD/hansen/global_forest_change_2023_v1_11")
    treecover = gfc.select('treecover2000')
    loss_year = gfc.select('lossyear')
    
    forest_mask = treecover.gt(20).Or(agb_tonnes_ha.gt(15))
    
    start_yy = max(1, start_year - 2000)
    end_yy = min(23, end_year - 2000)
    recent_loss = loss_year.gte(start_yy).And(loss_year.lte(end_yy))
    
    # Spatial morphological analysis: edges = gradual gathering, core = commercial logging
    loss_edges = recent_loss.focal_min(radius=1.5).neq(recent_loss)
    gradual_gathering = recent_loss.And(loss_edges)
    clear_cut = recent_loss.And(loss_edges.Not())

    # 4. DROUGHT-ADJUSTED DEGRADATION & 5-YEAR PREDICTIVE FORECASTING
    from gee.aoi_utils import get_historical_ndvi
    chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
    
    ndvi_images = []
    precip_images = []
    for y in range(start_year, end_year + 1):
        ndvi = get_historical_ndvi(aoi, y, f"{y}-06-01", f"{y}-08-31", 60).rename('NDVI')
        ndvi_images.append(ndvi.addBands(ee.Image.constant(y).rename('year')).float())
        
        precip = chirps.filterDate(f"{y}-01-01", f"{y}-08-31").sum().rename('precip')
        precip_images.append(precip.addBands(ee.Image.constant(y).rename('year')).float())

    ndvi_trend = ee.ImageCollection(ndvi_images).select(['year', 'NDVI']).reduce(ee.Reducer.linearFit()).select('scale')
    precip_trend = ee.ImageCollection(precip_images).select(['year', 'precip']).reduce(ee.Reducer.linearFit()).select('scale')
    
    degradation_base = ndvi_trend.multiply(-1).divide(0.05).clamp(0, 1).unmask(0)
    drought_factor = precip_trend.multiply(-1).divide(100).clamp(0, 1).unmask(0)
    degradation_risk = degradation_base.multiply(ee.Image(1).subtract(drought_factor))

    # 5-year predictive projection
    future_loss_pred = ndvi_trend.multiply(-5).divide(0.05).clamp(0, 1).unmask(0).multiply(ee.Image(1).subtract(drought_factor))

    # 5. COMBINE TO OVERALL DEPLETION RISK
    combined_loss_risk = degradation_risk.max(recent_loss.unmask(0)).max(future_loss_pred.multiply(0.5))
    depletion_score = proximity_risk.multiply(combined_loss_risk).multiply(forest_mask).multiply(100).round()
    depletion_score = depletion_score.clip(aoi).rename('depletion_risk')
    
    # 6. EXCLUDE NATIONAL PARKS (Protected Areas)
    if is_rwanda:
        try:
            from .crom_service import get_district_vectors
            district_name = aoi_config.get("district", aoi_config.get("name", "Unknown"))
            gdb_data = get_district_vectors(district_name)
            parks_geojson = gdb_data.get("parks")
            if parks_geojson and parks_geojson.get("features"):
                # Create ee.FeatureCollection from geojson features
                parks_fc = ee.FeatureCollection(parks_geojson["features"])
                parks_mask = ee.Image().paint(parks_fc, 1).unmask(0)
                # updateMask(0) hides the area
                depletion_score = depletion_score.updateMask(parks_mask.Not())
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to mask parks from GDB: {e}")
    else:
        # Global Protected Areas
        parks_fc = ee.FeatureCollection("WCMC/WDPA/current/polygons").filterBounds(aoi)
        parks_mask = ee.Image().paint(parks_fc, 1).unmask(0)
        depletion_score = depletion_score.updateMask(parks_mask.Not())

    depletion_score = depletion_score.updateMask(depletion_score.gt(0))
    
    return aoi, dynamic_scale, depletion_score, proximity_risk, recent_loss, degradation_risk, forest_mask, clear_cut, gradual_gathering, future_loss_pred, agb_tonnes_ha, pop, is_global

@with_cache
def compute_biomass_map(aoi_config: dict, buffer_km: float = 3.0, start_year: int = 2019, end_year: int = 2023) -> dict:
    aoi, dynamic_scale, depletion_score, proximity_risk, recent_loss, degradation_risk, forest_mask, clear_cut, gradual_gathering, future_loss_pred, agb_tonnes_ha, pop, is_global = _build_biomass_base(aoi_config, buffer_km, start_year, end_year)

    classes = ee.Image(0) \
        .where(depletion_score.gt(0).And(depletion_score.lte(25)), 1) \
        .where(depletion_score.gt(25).And(depletion_score.lte(50)), 2) \
        .where(depletion_score.gt(50).And(depletion_score.lte(75)), 3) \
        .where(depletion_score.gt(75), 4) \
        .updateMask(depletion_score.gt(0))

    _CLASS_VIS = {"min": 1, "max": 4, "palette": ["#0000ff", "#00ff00", "#ffff00", "#ff0000"]}
    map_id = classes.getMapId(_CLASS_VIS)
    
    calc_geom = ee.Geometry.Rectangle([-180, -89, 180, 89], "EPSG:4326", False) if is_global else aoi.bounds(maxError=1000)
    thumb_url = classes.getThumbURL({
        "min": _CLASS_VIS["min"], "max": _CLASS_VIS["max"], "palette": _CLASS_VIS["palette"],
        "dimensions": 512, "crs": "EPSG:4326", "region": calc_geom, "format": "png"
    })
    
    factor_maps = {
        "proximity": {
            "title": "Population-Weighted Road Accessibility",
            "image": proximity_risk.clip(aoi).multiply(100).round(),
            "description": "Risk driven by proximity to settlements and accessibility, weighted by population density (demand).",
            "min": 0, "max": 100,
            "palette": ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"],
            "unit": "Score (0-100)",
            "reverse": False
        },
        "gradual_gathering": {
            "title": "Gradual Firewood Extraction",
            "image": gradual_gathering.clip(aoi).unmask(0),
            "description": "Edge-effect forest loss, typical of informal firewood gathering rather than commercial clear-cutting.",
            "min": 0, "max": 1,
            "palette": ["#ffffff", "#fd8d3c"],
            "unit": "Binary (1=Extraction)",
            "reverse": False
        },
        "clear_cut": {
            "title": "Commercial Logging / Clear-Cutting",
            "image": clear_cut.clip(aoi).unmask(0),
            "description": "Contiguous, core forest loss patches typically associated with commercial operations or agriculture expansion.",
            "min": 0, "max": 1,
            "palette": ["#ffffff", "#800026"],
            "unit": "Binary (1=Clear-cut)",
            "reverse": False
        },
        "degradation": {
            "title": "Drought-Adjusted Degradation",
            "image": degradation_risk.clip(aoi).unmask(0).multiply(100).round(),
            "description": "Areas showing gradual loss of vegetation greenness, adjusted to ignore natural precipitation droughts.",
            "min": 0, "max": 100,
            "palette": ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#b10026"],
            "unit": "Score (0-100)",
            "reverse": False
        },
        "future_loss": {
            "title": "5-Year Forecasted Depletion",
            "image": future_loss_pred.clip(aoi).unmask(0).multiply(100).round(),
            "description": "Predictive model showing areas most likely to suffer severe degradation in the next 5 years based on current accelerating trends.",
            "min": 0, "max": 100,
            "palette": ["#ffffff", "#e0e0e0", "#ffb3b3", "#ff4d4d", "#b30000"],
            "unit": "Probability (%)",
            "reverse": False
        },
        "baseline": {
            "title": "Aboveground Biomass (Tonnes/ha)",
            "image": agb_tonnes_ha.clip(aoi).updateMask(agb_tonnes_ha.gt(0)),
            "description": "Actual physical biomass estimation (tonnes per hectare) derived from ESA CCI Biomass (100m) calibrated with LiDAR.",
            "min": 0, "max": 200,
            "palette": ["#ffffe5", "#f7fcb9", "#d9f0a3", "#addd8e", "#78c679", "#41ab5d", "#238443", "#006837", "#004529"],
            "unit": "Tonnes/ha",
            "reverse": False
        }
    }
    
    factor_results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        def process_factor(key, f_data):
            img = f_data["image"]
            f_vis = {"min": f_data["min"], "max": f_data["max"], "palette": f_data["palette"]}
            if f_data["max"] == 1:
                img = img.updateMask(img.gt(0))
            f_mapid = img.getMapId(f_vis)
            f_thumb = img.getThumbURL({
                "min": f_vis["min"], "max": f_vis["max"], 
                "palette": f_vis["palette"], 
                "dimensions": 512, "crs": "EPSG:4326", "region": calc_geom, "format": "png"
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

    from gee.aoi_utils import get_bounds_and_center


    bounds, center = get_bounds_and_center(aoi)


    center_lat, center_lon = center[0], center[1]

    return {
        "tile_url": map_id["tile_fetcher"].url_format,
        "map_id": map_id["tile_fetcher"].url_format,
        "thumb_url": thumb_url,
        "factor_maps": factor_results,
        "factors": factor_results,
        "center": [center_lat, center_lon],
        "bbox": bounds,
        "bounds": bounds,
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI"))
    }

@with_cache
def compute_biomass_stats(aoi_config: dict, buffer_km: float = 3.0, start_year: int = 2019, end_year: int = 2023) -> dict:
    aoi, dynamic_scale, depletion_score, proximity_risk, recent_loss, degradation_risk, forest_mask, clear_cut, gradual_gathering, future_loss_pred, agb_tonnes_ha, pop, is_global = _build_biomass_base(aoi_config, buffer_km, start_year, end_year)

    pixel_area_ha = ee.Image.pixelArea().divide(10000)
    standing_biomass_img = agb_tonnes_ha.multiply(forest_mask).multiply(pixel_area_ha)
    biomass_lost_img = agb_tonnes_ha.multiply(recent_loss).multiply(pixel_area_ha)
    forest_area_km2 = forest_mask.multiply(ee.Image.pixelArea()).divide(1e6)
    pop_img = pop.unmask(0)

    calc_geom = ee.Geometry.Rectangle([-180, -89, 180, 89], "EPSG:4326", False) if is_global else aoi.bounds(maxError=1000)
    stats_raw = ee.Image.cat([
        depletion_score.rename('depletion_risk'),
        standing_biomass_img.rename('standing_biomass_tonnes'),
        biomass_lost_img.rename('biomass_lost_tonnes'),
        forest_area_km2.rename('forest_area_km2'),
        pop_img.rename('population_total')
    ]).reduceRegion(
        reducer=ee.Reducer.mean().combine(ee.Reducer.max(), sharedInputs=True).combine(ee.Reducer.sum(), sharedInputs=True),
        geometry=calc_geom,
        scale=dynamic_scale,
        maxPixels=1e10
    ).getInfo()

    mean_risk = round(stats_raw.get("depletion_risk_mean", 0) or 0, 1)
    max_risk = round(stats_raw.get("depletion_risk_max", 0) or 0, 1)
    standing_tons = round(stats_raw.get("standing_biomass_tonnes_sum", 0) or 0, 1)
    lost_tons = round(stats_raw.get("biomass_lost_tonnes_sum", 0) or 0, 1)
    forest_km2 = round(stats_raw.get("forest_area_km2_sum", 0) or 0, 1)
    pop_total = int(round(stats_raw.get("population_total_sum", 0) or 0))

    # Enterprise Mass Balance calculations
    annual_demand = round(pop_total * 0.584, 1)  # 1.6 kg/capita/day * 365 days / 1000
    sustainable_yield = round(standing_tons * 0.038, 1)  # 3.8% annual mean biological increment
    net_deficit = round(annual_demand - sustainable_yield, 1)

    if net_deficit > 0 and standing_tons > 0:
        runway_years = round(standing_tons / net_deficit, 1)
        status_label = "CRITICAL DEFICIT" if runway_years < 10 else "DEFICIT"
    elif net_deficit > 0:
        runway_years = 0.0
        status_label = "CRITICAL DEFICIT"
    else:
        runway_years = 999.0
        status_label = "SUSTAINABLE SURPLUS"

    return {
        "stats": {
            "Mean Depletion Risk": mean_risk,
            "Max Depletion Risk": max_risk,
            "Total Standing Biomass (Tonnes)": standing_tons,
            "Estimated Biomass Lost (Tonnes)": lost_tons,
            "Forest Area (km²)": forest_km2,
            "Population (WorldPop)": pop_total,
            "Annual Fuelwood Demand (Tonnes/yr)": annual_demand,
            "Sustainable Annual Yield (Tonnes/yr)": sustainable_yield,
            "Net Biomass Deficit (Tonnes/yr)": net_deficit,
            "Depletion Runway (Years)": runway_years,
            "Commercial Energy Status": status_label
        }
    }

@with_cache
def compute_biomass_classify(aoi_config: dict, buffer_km: float = 3.0, start_year: int = 2019, end_year: int = 2023, n_classes: int = 4, method: str = "natural_breaks", custom_labels: list = None) -> dict:
    aoi, dynamic_scale, depletion_score, proximity_risk, recent_loss, degradation_risk, forest_mask, clear_cut, gradual_gathering, future_loss_pred, agb_tonnes_ha, pop, is_global = _build_biomass_base(aoi_config, buffer_km, start_year, end_year)

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

@with_cache
def compute_biomass_export(aoi_config: dict, buffer_km: float = 3.0, start_year: int = 2019, end_year: int = 2023) -> dict:
    aoi, dynamic_scale, depletion_score, proximity_risk, recent_loss, degradation_risk, forest_mask, clear_cut, gradual_gathering, future_loss_pred, agb_tonnes_ha, pop = _build_biomass_base(aoi_config, buffer_km, start_year, end_year)
    
    url = depletion_score.getDownloadURL({
        "name": "biomass_depletion_risk",
        "scale": dynamic_scale,
        "region": calc_geom,
        "format": "GEO_TIFF",
        "crs": "EPSG:4326"
    })
    
    return {
        "download_url": url,
        "export_url": url
    }

def export_factor_map(aoi_config: dict, factor_key: str, palette: list = None, buffer_km: float = 3.0, start_year: int = 2019, end_year: int = 2023):
    aoi, dynamic_scale, _, proximity_risk, recent_loss, degradation_risk, forest_mask, clear_cut, gradual_gathering, future_loss_pred, agb_tonnes_ha, pop, is_global = _build_biomass_base(aoi_config, buffer_km, start_year, end_year)
    calc_geom = ee.Geometry.Rectangle([-180, -89, 180, 89], "EPSG:4326", False) if is_global else aoi.bounds(maxError=1000)
    
    if factor_key == "proximity":
        img = proximity_risk.clip(aoi).multiply(100).round()
        vis_min, vis_max = 0, 100
    elif factor_key == "gradual_gathering":
        img = gradual_gathering.clip(aoi).unmask(0)
        vis_min, vis_max = 0, 1
    elif factor_key == "clear_cut":
        img = clear_cut.clip(aoi).unmask(0)
        vis_min, vis_max = 0, 1
    elif factor_key == "recent_loss":
        img = recent_loss.clip(aoi).unmask(0)
        vis_min, vis_max = 0, 1
    elif factor_key == "degradation":
        img = degradation_risk.clip(aoi).unmask(0).multiply(100).round()
        vis_min, vis_max = 0, 100
    elif factor_key == "future_loss":
        img = future_loss_pred.clip(aoi).unmask(0).multiply(100).round()
        vis_min, vis_max = 0, 100
    elif factor_key == "baseline":
        img = agb_tonnes_ha.clip(aoi).updateMask(agb_tonnes_ha.gt(0))
        vis_min, vis_max = 0, 200
    else:
        raise ValueError(f"Unknown factor {factor_key}")
        
    if palette:
        styled = img.visualize(min=vis_min, max=vis_max, palette=palette)
        url = styled.getDownloadURL({"name": f"biomass_{factor_key}_styled", "scale": dynamic_scale, "region": calc_geom, "format": "GEO_TIFF"})
    else:
        url = img.toFloat().getDownloadURL({"name": f"biomass_{factor_key}_raw", "scale": dynamic_scale, "region": calc_geom, "format": "GEO_TIFF"})
        
    return {"download_url": url}
