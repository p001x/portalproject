import ee
import json
import logging
from cachetools import TTLCache, cached
import threading
import math
import numpy as np

logger = logging.getLogger(__name__)

_earthwork_cache = TTLCache(maxsize=5000, ttl=86400)
_lock = threading.Lock()

def get_earthwork_base(polygon_coords: list, custom_dem_id: str = None):
    poly = ee.Geometry.Polygon([polygon_coords])
    
    if custom_dem_id and len(custom_dem_id.strip()) > 0:
        try:
            # If the user passed an ImageCollection, we mosaic it. If it's an Image, we just use it.
            # Easiest way to handle an unknown asset string is to try casting to Image.
            # If it fails, they passed an invalid ID or a collection.
            dem = ee.Image(custom_dem_id).clip(poly)
        except Exception:
            # Fallback to collection if it is an ImageCollection
            dem = ee.ImageCollection(custom_dem_id).mosaic().clip(poly)
    else:
        dem = ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").mosaic().clip(poly)
        
    return poly, dem

def get_target_surface(poly, target_elevation, slope_grade, slope_angle):
    if slope_grade > 0:
        centroid = poly.centroid(maxError=1)
        cx = ee.Number(centroid.coordinates().get(0))
        cy = ee.Number(centroid.coordinates().get(1))
        
        angle_rad = ee.Number(slope_angle).multiply(math.pi / 180.0)
        grade_frac = ee.Number(slope_grade).divide(100.0)
        
        lonLat = ee.Image.pixelLonLat()
        lon = lonLat.select('longitude')
        lat = lonLat.select('latitude')
        
        dx = lon.subtract(cx)
        dy = lat.subtract(cy)
        
        meters_per_deg_lat = 111320.0
        meters_per_deg_lon = ee.Number(cy).multiply(math.pi / 180.0).cos().multiply(111320.0)
        
        dx_m = dx.multiply(meters_per_deg_lon)
        dy_m = dy.multiply(meters_per_deg_lat)
        
        dir_x = angle_rad.sin()
        dir_y = angle_rad.cos()
        
        dist_along_slope = dx_m.multiply(dir_x).add(dy_m.multiply(dir_y))
        elev_adj = dist_along_slope.multiply(grade_frac)
        
        target_surface = ee.Image.constant(target_elevation).add(elev_adj)
    else:
        target_surface = ee.Image.constant(target_elevation)
    return target_surface

def _compute_volumes_only(
    poly, dem, target_elevation, swell_factor, shrink_factor, 
    slope_grade, slope_angle, topsoil_depth, strata_layers
):
    if topsoil_depth > 0:
        dem = dem.subtract(topsoil_depth)
        
    target_surface = get_target_surface(poly, target_elevation, slope_grade, slope_angle)
        
    diff = dem.subtract(target_surface)
    pixel_area = ee.Image.pixelArea()
    
    cut_img = diff.updateMask(diff.gt(0)).multiply(pixel_area)
    fill_img = diff.updateMask(diff.lt(0)).abs().multiply(pixel_area)
    
    cut_vol_dict = cut_img.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo()
    fill_vol_dict = fill_img.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo()
    
    raw_cut_m3 = cut_vol_dict.get("DEM") or 0
    raw_fill_m3 = fill_vol_dict.get("DEM") or 0
    
    adjusted_cut_m3 = 0
    if strata_layers and len(strata_layers) > 0:
        current_depth = 0.0
        cut_depth_img = diff.updateMask(diff.gt(0))
        for layer in strata_layers:
            layer_thickness = layer.get('thickness', 1.0)
            layer_swell = layer.get('swell', 1.0)
            depth_above = cut_depth_img.subtract(current_depth)
            valid_above = depth_above.updateMask(depth_above.gt(0))
            amount_in_layer = valid_above.min(layer_thickness)
            
            layer_vol_img = amount_in_layer.multiply(pixel_area)
            layer_vol = layer_vol_img.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo()
            vol_m3 = layer_vol.get("DEM") or 0
            adjusted_cut_m3 += vol_m3 * layer_swell
            current_depth += layer_thickness
            
        depth_above = cut_depth_img.subtract(current_depth)
        valid_above = depth_above.updateMask(depth_above.gt(0))
        if valid_above is not None:
            rem_vol_img = valid_above.multiply(pixel_area)
            rem_vol = rem_vol_img.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo()
            rem_vol_m3 = rem_vol.get("DEM") or 0
            adjusted_cut_m3 += rem_vol_m3 * swell_factor
    else:
        adjusted_cut_m3 = raw_cut_m3 * swell_factor
    
    adjusted_fill_m3 = raw_fill_m3 / shrink_factor if shrink_factor > 0 else raw_fill_m3
    net_balance = adjusted_cut_m3 - adjusted_fill_m3
    return net_balance

def _optimize_grading_surface(poly, dem, mean_elev, swell_factor, shrink_factor, topsoil_depth, batter_ratio=3.0):
    # Fetch a coarse point cloud of the polygon AND its 300m buffer to optimize locally in python
    if topsoil_depth > 0:
        dem = dem.subtract(topsoil_depth)
        
    dist = ee.FeatureCollection([ee.Feature(poly)]).distance(searchRadius=500, maxError=1)
    dem_with_coords = dem.addBands(ee.Image.pixelLonLat()).addBands(dist.rename('dist'))
    
    # We sample a max of 2000 points (pad + buffer) for daylighting optimization
    samples = dem_with_coords.sample(
        region=poly.buffer(300, 1),
        scale=30,
        geometries=False,
        numPixels=2000
    ).getInfo()
    
    features = samples.get("features", [])
    if not features:
        return mean_elev, 0.0, 0.0
        
    X = np.array([f["properties"]["longitude"] for f in features])
    Y = np.array([f["properties"]["latitude"] for f in features])
    Z = np.array([f["properties"]["DEM"] for f in features])
    D = np.array([f["properties"]["dist"] for f in features])
    
    # Calculate centroid of the pad (only where D == 0)
    pad_mask = D == 0
    if np.sum(pad_mask) > 0:
        cx, cy = np.mean(X[pad_mask]), np.mean(Y[pad_mask])
    else:
        cx, cy = np.mean(X), np.mean(Y)
    cy_rad = math.radians(cy)
    
    best_cost = float('inf')
    best_elev = mean_elev
    best_grade = 0.0
    best_angle = 0.0
    
    # Search Space: Target Elevation (±10m), Slope Grade (0-10%), Slope Direction (0-360°)
    elev_range = np.linspace(mean_elev - 10, mean_elev + 10, 20)
    grade_range = np.linspace(0, 10, 6)
    angle_range = np.linspace(0, 315, 8)
    
    # Precompute DX and DY arrays (in meters from centroid)
    DX = (X - cx) * 111320 * math.cos(cy_rad)
    DY = (Y - cy) * 111320
    
    for elev in elev_range:
        for grade in grade_range:
            for angle in angle_range:
                angle_rad = math.radians(angle)
                grade_frac = grade / 100.0
                
                # Z_target = elev + dx*grade*sin(angle) + dy*grade*cos(angle)
                dz = DX * grade_frac * math.sin(angle_rad) + DY * grade_frac * math.cos(angle_rad)
                Z_target = elev + dz
                
                # Batter slope logic
                if batter_ratio > 0:
                    Z_batter_cut = Z_target + D / batter_ratio
                    Prop_cut = np.minimum(Z_batter_cut, Z)
                    
                    Z_batter_fill = Z_target - D / batter_ratio
                    Prop_fill = np.maximum(Z_batter_fill, Z)
                    
                    Proposed = Prop_cut + Prop_fill - Z
                else:
                    Proposed = Z_target
                
                diff = Z - Proposed
                cut = diff[diff > 0]
                fill = -diff[diff < 0]
                
                raw_cut = np.sum(cut)
                raw_fill = np.sum(fill)
                
                adj_cut = raw_cut * swell_factor
                adj_fill = (raw_fill / shrink_factor) if shrink_factor > 0 else raw_fill
                
                net_balance = adj_cut - adj_fill
                
                # Cost function: Total earth moved + strong penalty for unbalanced site
                cost = adj_cut + adj_fill + 5 * abs(net_balance)
                
                if cost < best_cost:
                    best_cost = cost
                    best_elev = elev
                    best_grade = grade
                    best_angle = angle
                    
    return float(best_elev), float(best_grade), float(best_angle)

def _analyze_single_zone(
    polygon_coords: list, 
    target_elevation: float = None, 
    auto_balance: bool = False,
    swell_factor: float = 1.0, 
    shrink_factor: float = 1.0,
    slope_grade: float = 0.0,
    slope_angle: float = 0.0,
    topsoil_depth: float = 0.0,
    batter_ratio: float = 3.0,
    strata_layers: list = None,
    custom_dem_id: str = None,
    boreholes: list = None,
    water_table_depth: float = 0.0
):
    poly, dem = get_earthwork_base(polygon_coords, custom_dem_id)
    
    mean_elev_dict = dem.reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=poly,
        scale=30,
        maxPixels=1e9
    ).getInfo()
    
    mean_elev = mean_elev_dict.get("DEM")
    if mean_elev is None:
        raise ValueError("Polygon is too small or outside DEM coverage.")
        
    mean_elev = round(mean_elev, 2)
    
    if auto_balance:
        # Generative Design: Optimize 3D surface to minimize earthwork costs (including batter daylighting)
        best_elev, best_grade, best_angle = _optimize_grading_surface(
            poly, dem, mean_elev, swell_factor, shrink_factor, topsoil_depth, batter_ratio
        )
        target_elevation = round(best_elev, 2)
        slope_grade = round(best_grade, 2)
        slope_angle = round(best_angle, 2)
    elif target_elevation is None:
        target_elevation = mean_elev
        
    if topsoil_depth > 0:
        dem = dem.subtract(topsoil_depth)
        
    target_surface = get_target_surface(poly, target_elevation, slope_grade, slope_angle)
        
    if batter_ratio > 0:
        dist = ee.FeatureCollection([ee.Feature(poly)]).distance(searchRadius=500, maxError=1)
        z_batter_cut = target_surface.add(dist.divide(batter_ratio))
        prop_cut = z_batter_cut.min(dem)
        
        z_batter_fill = target_surface.subtract(dist.divide(batter_ratio))
        prop_fill = z_batter_fill.max(dem)
        
        final_batter_surface = prop_cut.add(prop_fill).subtract(dem)
        
        is_pad = ee.Image.constant(1).clip(poly).unmask(0)
        dist_mask = dist.lte(500)
        
        proposed_surface = dem.where(dist_mask, final_batter_surface)
        proposed_surface = proposed_surface.where(is_pad, target_surface)
        
        calc_geom = poly.buffer(500, 1)
    else:
        proposed_surface = target_surface
        calc_geom = poly
        
    diff = dem.subtract(proposed_surface)
    pixel_area = ee.Image.pixelArea()
    
    cut = diff.updateMask(diff.gt(0)).multiply(pixel_area)
    fill = diff.updateMask(diff.lt(0)).abs().multiply(pixel_area)
    
    cut_vol_dict = cut.reduceRegion(reducer=ee.Reducer.sum(), geometry=calc_geom, scale=30, maxPixels=1e9).getInfo()
    fill_vol_dict = fill.reduceRegion(reducer=ee.Reducer.sum(), geometry=calc_geom, scale=30, maxPixels=1e9).getInfo()
    
    raw_cut_m3 = cut_vol_dict.get("DEM") or 0
    raw_fill_m3 = fill_vol_dict.get("DEM") or 0
    
    strata_results = []
    adjusted_cut_m3 = 0
    
    borehole_depth_img = None
    if boreholes and len(boreholes) > 0:
        features = []
        for b in boreholes:
            geom = ee.Geometry.Point([b['lon'], b['lat']])
            features.append(ee.Feature(geom, {'depth': float(b['depth'])}))
        fc = ee.FeatureCollection(features)
        borehole_depth_img = fc.kriging(propertyName='depth', shape='spherical', range=10000, sill=1.0, nugget=0.1, maxDistance=10000)
        
    if strata_layers and len(strata_layers) > 0:
        current_depth = ee.Image.constant(0)
        cut_depth_img = diff.updateMask(diff.gt(0))
        for layer in strata_layers:
            layer_thickness = layer.get('thickness', 1.0)
            if layer.get('use_boreholes', False) and borehole_depth_img is not None:
                layer_thickness = borehole_depth_img
            else:
                layer_thickness = ee.Image.constant(layer_thickness)
                
            layer_swell = layer.get('swell', 1.0)
            
            depth_above = cut_depth_img.subtract(current_depth)
            valid_above = depth_above.updateMask(depth_above.gt(0))
            amount_in_layer = valid_above.min(layer_thickness)
            
            layer_vol_img = amount_in_layer.multiply(pixel_area)
            layer_vol = layer_vol_img.reduceRegion(reducer=ee.Reducer.sum(), geometry=calc_geom, scale=30, maxPixels=1e9).getInfo()
            vol_m3 = layer_vol.get("DEM") or 0
            
            if water_table_depth > 0:
                wt_elev = dem.subtract(water_table_depth)
                # target surface could be above or below wt
                # amount_in_layer is the depth of cut in this strata layer
                # we need to find how much of this layer is below wt_elev.
                # Actually, this is complex for an image layer. We can simply apply a 10% swell factor 
                # increase to the whole layer if its average elevation is below water table, or 
                # we just do it mathematically:
                wt_depth_img = wt_elev.subtract(target_surface)
                # if wt_elev > target_surface, it means cut goes below water table.
                # we will just add a global wetness factor if water_table_depth > 0 for now.
                adj_vol_m3 = vol_m3 * (layer_swell * 1.1) 
            else:
                adj_vol_m3 = vol_m3 * layer_swell

            
            strata_results.append({
                "name": layer.get("name", "Layer"),
                "raw_m3": round(vol_m3, 2),
                "adjusted_m3": round(adj_vol_m3, 2)
            })
            adjusted_cut_m3 += adj_vol_m3
            current_depth = current_depth.add(layer_thickness)
            
        depth_above = cut_depth_img.subtract(current_depth)
        valid_above = depth_above.updateMask(depth_above.gt(0))
        if valid_above is not None:
            rem_vol_img = valid_above.multiply(pixel_area)
            rem_vol = rem_vol_img.reduceRegion(reducer=ee.Reducer.sum(), geometry=calc_geom, scale=30, maxPixels=1e9).getInfo()
            rem_vol_m3 = rem_vol.get("DEM") or 0
            rem_adj_vol_m3 = rem_vol_m3 * swell_factor
            if rem_vol_m3 > 0.1:
                strata_results.append({
                    "name": "Remaining Subgrade",
                    "raw_m3": round(rem_vol_m3, 2),
                    "adjusted_m3": round(rem_adj_vol_m3, 2)
                })
                adjusted_cut_m3 += rem_adj_vol_m3
    else:
        adjusted_cut_m3 = raw_cut_m3 * swell_factor
    
    adjusted_fill_m3 = raw_fill_m3 / shrink_factor if shrink_factor > 0 else raw_fill_m3
    
    area_m2 = calc_geom.area(maxError=1).getInfo()
    
    cut_diff = diff.updateMask(diff.gt(0))
    cut_vis = cut_diff.visualize(min=0, max=5, palette=["#fc9272", "#fb6a4a", "#ef3b2c", "#cb181d", "#99000d"])
    
    fill_diff_abs = diff.updateMask(diff.lt(0)).abs()
    fill_vis = fill_diff_abs.visualize(min=0, max=5, palette=["#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#084594"])
    
    heatmap = ee.ImageCollection([fill_vis, cut_vis]).mosaic().clip(calc_geom)
    map_id = heatmap.getMapId()
    
    proposed_slope = ee.Terrain.slope(proposed_surface).clip(calc_geom)
    drainage_vis = proposed_slope.visualize(min=0, max=10, palette=["#313695", "#74add1", "#abdda4", "#fdae61", "#d7191c"])
    
    cut_with_coords = cut_diff.addBands(ee.Image.pixelLonLat())
    max_cut_feat = cut_with_coords.reduceRegion(
        reducer=ee.Reducer.max(3).setOutputs(['depth', 'lon', 'lat']),
        geometry=calc_geom,
        scale=30,
        maxPixels=1e9
    ).getInfo()
    
    fill_with_coords = fill_diff_abs.addBands(ee.Image.pixelLonLat())
    max_fill_feat = fill_with_coords.reduceRegion(
        reducer=ee.Reducer.max(3).setOutputs(['depth', 'lon', 'lat']),
        geometry=calc_geom,
        scale=30,
        maxPixels=1e9
    ).getInfo()

    max_cut_pt = None
    if max_cut_feat.get('lon') is not None and max_cut_feat.get('lat') is not None:
        max_cut_pt = {"lon": max_cut_feat['lon'], "lat": max_cut_feat['lat'], "depth": round(max_cut_feat.get('depth', 0), 2)}
        
    max_fill_pt = None
    if max_fill_feat.get('lon') is not None and max_fill_feat.get('lat') is not None:
        max_fill_pt = {"lon": max_fill_feat['lon'], "lat": max_fill_feat['lat'], "depth": round(max_fill_feat.get('depth', 0), 2)}
        
    lonLat = ee.Image.pixelLonLat()
    
    cut_mass_x = lonLat.select('longitude').multiply(cut_diff)
    cut_mass_y = lonLat.select('latitude').multiply(cut_diff)
    cut_x_sum = cut_mass_x.reduceRegion(reducer=ee.Reducer.sum(), geometry=calc_geom, scale=30, maxPixels=1e9).getInfo().get('longitude', 0)
    cut_y_sum = cut_mass_y.reduceRegion(reducer=ee.Reducer.sum(), geometry=calc_geom, scale=30, maxPixels=1e9).getInfo().get('latitude', 0)
    cut_depth_sum = cut_diff.reduceRegion(reducer=ee.Reducer.sum(), geometry=calc_geom, scale=30, maxPixels=1e9).getInfo().get('DEM', 0)
    
    cut_centroid = None
    if cut_depth_sum > 0:
        cut_centroid = {"lon": cut_x_sum / cut_depth_sum, "lat": cut_y_sum / cut_depth_sum}
        
    fill_mass_x = lonLat.select('longitude').multiply(fill_diff_abs)
    fill_mass_y = lonLat.select('latitude').multiply(fill_diff_abs)
    fill_x_sum = fill_mass_x.reduceRegion(reducer=ee.Reducer.sum(), geometry=calc_geom, scale=30, maxPixels=1e9).getInfo().get('longitude', 0)
    fill_y_sum = fill_mass_y.reduceRegion(reducer=ee.Reducer.sum(), geometry=calc_geom, scale=30, maxPixels=1e9).getInfo().get('latitude', 0)
    fill_depth_sum = fill_diff_abs.reduceRegion(reducer=ee.Reducer.sum(), geometry=calc_geom, scale=30, maxPixels=1e9).getInfo().get('DEM', 0)
    
    fill_centroid = None
    if fill_depth_sum > 0:
        fill_centroid = {"lon": fill_x_sum / fill_depth_sum, "lat": fill_y_sum / fill_depth_sum}
        
    haul_distance_m = 0
    if cut_centroid and fill_centroid:
        dx = (cut_centroid["lon"] - fill_centroid["lon"]) * 111320 * math.cos(math.radians(cut_centroid["lat"]))
        dy = (cut_centroid["lat"] - fill_centroid["lat"]) * 111320
        haul_distance_m = round(math.sqrt(dx*dx + dy*dy), 2)
        
    hauled_volume = min(adjusted_cut_m3, adjusted_fill_m3)
    haul_effort_m3_km = round(hauled_volume * (haul_distance_m / 1000.0), 2)
    
    # Land Cover Extraction (ESA WorldCover 2021)
    land_cover_stats = []
    try:
        lc = ee.ImageCollection("ESA/WorldCover/v200/2021").first().clip(calc_geom)
        lc_hist = lc.reduceRegion(
            reducer=ee.Reducer.frequencyHistogram(),
            geometry=calc_geom,
            scale=10,
            maxPixels=1e9
        ).getInfo().get('Map', {})
        
        LC_CLASSES = {
            '10': "Tree cover",
            '20': "Shrubland",
            '30': "Grassland",
            '40': "Cropland",
            '50': "Built-up",
            '60': "Bare / sparse vegetation",
            '70': "Snow and ice",
            '80': "Permanent water bodies",
            '90': "Herbaceous wetland",
            '95': "Mangroves",
            '100': "Moss and lichen"
        }
        
        for cls_val, count in lc_hist.items():
            if count > 0:
                area_ha = (count * 100) / 10000.0  # 10m scale approx
                land_cover_stats.append({
                    "class_name": LC_CLASSES.get(str(cls_val), f"Class {cls_val}"),
                    "area_ha": round(area_ha, 2)
                })
        land_cover_stats = sorted(land_cover_stats, key=lambda x: x['area_ha'], reverse=True)
    except Exception as e:
        logger.error(f"Error fetching land cover: {e}")

    diesel_liters = haul_effort_m3_km * 0.08
    haul_co2_kg = diesel_liters * 2.68
    
    CARBON_STORAGE_PER_HA = {
        "Tree cover": 150,
        "Shrubland": 30,
        "Grassland": 10,
        "Cropland": 10,
        "Herbaceous wetland": 50,
        "Mangroves": 300,
    }
    
    cleared_carbon_tons = sum(lc['area_ha'] * CARBON_STORAGE_PER_HA.get(lc['class_name'], 0) for lc in land_cover_stats)
    clearing_co2_tons = cleared_carbon_tons * 3.67
    
    carbon_footprint = {
        "haul_co2_kg": round(haul_co2_kg, 2),
        "clearing_co2_tons": round(clearing_co2_tons, 2),
        "total_co2_tons": round((haul_co2_kg / 1000.0) + clearing_co2_tons, 2)
    }

    return {
        "mean_elevation": mean_elev,
        "target_elevation": target_elevation,
        "optimized_slope_grade": slope_grade if auto_balance else None,
        "optimized_slope_angle": slope_angle if auto_balance else None,
        "raw_cut_m3": round(raw_cut_m3, 2),
        "raw_fill_m3": round(raw_fill_m3, 2),
        "adjusted_cut_m3": round(adjusted_cut_m3, 2),
        "adjusted_fill_m3": round(adjusted_fill_m3, 2),
        "strata_results": strata_results,
        "net_balance_m3": round(adjusted_cut_m3 - adjusted_fill_m3, 2),
        "area_m2": round(area_m2 or 0, 2),
        "heatmap_tile_url": map_id["tile_fetcher"].url_format,
        "drainage_tile_url": drainage_vis.getMapId()["tile_fetcher"].url_format,
        "max_cut_point": max_cut_pt,
        "max_fill_point": max_fill_pt,
        "logistics": {
            "haul_distance_m": haul_distance_m,
            "haul_effort_m3_km": haul_effort_m3_km,
            "cut_centroid": cut_centroid,
            "fill_centroid": fill_centroid
        },
        "land_cover": land_cover_stats,
        "carbon_footprint": carbon_footprint,
        "cut_vis": cut_vis,
        "fill_vis": fill_vis,
        "drainage_vis": drainage_vis,
        "poly": poly
    }

def analyze_earthwork(
    polygon_coords: list = None,
    zones: list = None,
    target_elevation: float = None,
    auto_balance: bool = False,
    swell_factor: float = 1.0,
    shrink_factor: float = 1.0,
    slope_grade: float = 0.0,
    slope_angle: float = 0.0,
    topsoil_depth: float = 0.0,
    batter_ratio: float = 3.0,
    strata_layers: list = None,
    custom_dem_id: str = None,
    boreholes: list = None,
    water_table_depth: float = 0.0
) -> dict:
    if zones and len(zones) > 0:
        total_cut = 0
        total_fill = 0
        total_raw_cut = 0
        total_raw_fill = 0
        total_area = 0
        
        cut_vis_list = []
        fill_vis_list = []
        drainage_vis_list = []
        poly_list = []
        
        strata_map = {}
        lc_map = {}
        
        total_cut_lon = 0
        total_cut_lat = 0
        total_cut_weight = 0
        
        total_fill_lon = 0
        total_fill_lat = 0
        total_fill_weight = 0
        
        for z in zones:
            z_poly = getattr(z, 'polygon', z)
            if isinstance(z, dict):
                z_poly = z.get('polygon')
                z_elev = z.get('target_elevation', target_elevation)
                z_auto = z.get('auto_balance', auto_balance)
            else:
                z_poly = z.polygon
                z_elev = getattr(z, 'target_elevation', target_elevation)
                z_auto = getattr(z, 'auto_balance', auto_balance)

            res = _analyze_single_zone(
                z_poly, z_elev, z_auto,
                swell_factor, shrink_factor, slope_grade, slope_angle,
                topsoil_depth, batter_ratio, strata_layers, custom_dem_id, boreholes, water_table_depth
            )
            total_cut += res['adjusted_cut_m3']
            total_fill += res['adjusted_fill_m3']
            total_raw_cut += res['raw_cut_m3']
            total_raw_fill += res['raw_fill_m3']
            total_area += res['area_m2']
            
            for st in res['strata_results']:
                name = st['name']
                if name not in strata_map:
                    strata_map[name] = {"name": name, "raw_m3": 0, "adjusted_m3": 0}
                strata_map[name]['raw_m3'] += st['raw_m3']
                strata_map[name]['adjusted_m3'] += st['adjusted_m3']
                
            cut_vis_list.append(res['cut_vis'])
            fill_vis_list.append(res['fill_vis'])
            drainage_vis_list.append(res['drainage_vis'])
            poly_list.append(res['poly'])
            
            if 'logistics' in res:
                c_cent = res['logistics'].get('cut_centroid')
                if c_cent and res['adjusted_cut_m3'] > 0:
                    total_cut_lon += c_cent['lon'] * res['adjusted_cut_m3']
                    total_cut_lat += c_cent['lat'] * res['adjusted_cut_m3']
                    total_cut_weight += res['adjusted_cut_m3']
                
                f_cent = res['logistics'].get('fill_centroid')
                if f_cent and res['adjusted_fill_m3'] > 0:
                    total_fill_lon += f_cent['lon'] * res['adjusted_fill_m3']
                    total_fill_lat += f_cent['lat'] * res['adjusted_fill_m3']
                    total_fill_weight += res['adjusted_fill_m3']
            
            for lc in res.get('land_cover', []):
                name = lc['class_name']
                lc_map[name] = lc_map.get(name, 0) + lc['area_ha']
            
        final_strata = list(strata_map.values())
        for st in final_strata:
            st['raw_m3'] = round(st['raw_m3'], 2)
            st['adjusted_m3'] = round(st['adjusted_m3'], 2)
            
        final_lc = [{"class_name": k, "area_ha": round(v, 2)} for k, v in lc_map.items()]
        final_lc = sorted(final_lc, key=lambda x: x['area_ha'], reverse=True)
            
        combined_cut_vis = ee.ImageCollection(cut_vis_list).mosaic()
        combined_fill_vis = ee.ImageCollection(fill_vis_list).mosaic()
        heatmap = ee.ImageCollection([combined_fill_vis, combined_cut_vis]).mosaic()
        map_id = heatmap.getMapId()
        
        combined_drainage_vis = ee.ImageCollection(drainage_vis_list).mosaic()
        drainage_map_id = combined_drainage_vis.getMapId()
        
        haul_distance_m = 0
        cut_centroid = None
        fill_centroid = None
        if total_cut_weight > 0 and total_fill_weight > 0:
            cut_centroid = {"lon": total_cut_lon / total_cut_weight, "lat": total_cut_lat / total_cut_weight}
            fill_centroid = {"lon": total_fill_lon / total_fill_weight, "lat": total_fill_lat / total_fill_weight}
            dx = (cut_centroid["lon"] - fill_centroid["lon"]) * 111320 * math.cos(math.radians(cut_centroid["lat"]))
            dy = (cut_centroid["lat"] - fill_centroid["lat"]) * 111320
            haul_distance_m = round(math.sqrt(dx*dx + dy*dy), 2)
            
        hauled_volume = min(total_cut, total_fill)
        haul_effort_m3_km = round(hauled_volume * (haul_distance_m / 1000.0), 2)
        
        diesel_liters = haul_effort_m3_km * 0.08
        haul_co2_kg = diesel_liters * 2.68
        
        CARBON_STORAGE_PER_HA = {
            "Tree cover": 150, "Shrubland": 30, "Grassland": 10,
            "Cropland": 10, "Herbaceous wetland": 50, "Mangroves": 300,
        }
        cleared_carbon_tons = sum(lc['area_ha'] * CARBON_STORAGE_PER_HA.get(lc['class_name'], 0) for lc in final_lc)
        clearing_co2_tons = cleared_carbon_tons * 3.67
        
        carbon_footprint = {
            "haul_co2_kg": round(haul_co2_kg, 2),
            "clearing_co2_tons": round(clearing_co2_tons, 2),
            "total_co2_tons": round((haul_co2_kg / 1000.0) + clearing_co2_tons, 2)
        }
        
        return {
            "target_elevation": "Multiple (Terraced)",
            "adjusted_cut_m3": round(total_cut, 2),
            "adjusted_fill_m3": round(total_fill, 2),
            "raw_cut_m3": round(total_raw_cut, 2),
            "raw_fill_m3": round(total_raw_fill, 2),
            "net_balance_m3": round(total_cut - total_fill, 2),
            "area_m2": round(total_area, 2),
            "heatmap_tile_url": map_id['tile_fetcher'].url_format,
            "drainage_tile_url": drainage_map_id['tile_fetcher'].url_format,
            "max_cut_point": None,
            "max_fill_point": None,
            "strata_results": final_strata,
            "logistics": {
                "haul_distance_m": haul_distance_m,
                "haul_effort_m3_km": haul_effort_m3_km,
                "cut_centroid": cut_centroid,
                "fill_centroid": fill_centroid
            },
            "land_cover": final_lc,
            "carbon_footprint": carbon_footprint
        }
    else:
        # Fallback to single zone
        res = _analyze_single_zone(
            polygon_coords, target_elevation, auto_balance,
            swell_factor, shrink_factor, slope_grade, slope_angle,
            topsoil_depth, batter_ratio, strata_layers, custom_dem_id, boreholes
        )
        # Remove extra keys not needed by frontend to keep payload clean
        res.pop("cut_vis", None)
        res.pop("fill_vis", None)
        res.pop("poly", None)
        return res

def profile_earthwork_line(
    polygon_coords: list, 
    line_coords: list, 
    target_elevation: float, 
    slope_grade: float = 0.0, 
    slope_angle: float = 0.0, 
    topsoil_depth: float = 0.0,
    custom_dem_id: str = None
):
    poly, dem = get_earthwork_base(polygon_coords, custom_dem_id)
    
    if topsoil_depth > 0:
        dem = dem.subtract(topsoil_depth)
        
    target_surface = get_target_surface(poly, target_elevation, slope_grade, slope_angle)
    
    lon1, lat1 = line_coords[0]
    lon2, lat2 = line_coords[-1]
    
    lons = np.linspace(lon1, lon2, 100)
    lats = np.linspace(lat1, lat2, 100)
    points = [ee.Feature(ee.Geometry.Point([float(lon), float(lat)])) for lon, lat in zip(lons, lats)]
    fc = ee.FeatureCollection(points)
    
    combined = dem.rename('existing_elev').addBands(target_surface.rename('proposed_elev'))
    
    sampled = combined.reduceRegions(
        collection=fc,
        reducer=ee.Reducer.first(),
        scale=30
    ).getInfo()
    
    features = sampled.get("features", [])
    
    def haversine(lon1, lat1, lon2, lat2):
        R = 6371
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlam = math.radians(lon2 - lon1)
        a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c * 1000

    profile = []
    for f in features:
        geom = f.get("geometry", {}).get("coordinates", [lon1, lat1])
        dist = haversine(lon1, lat1, geom[0], geom[1])
        props = f.get("properties", {})
        existing = props.get("existing_elev")
        proposed = props.get("proposed_elev")
        if existing is not None and proposed is not None:
            profile.append({
                "distance": round(dist, 2),
                "existing_elev": round(existing, 2),
                "proposed_elev": round(proposed, 2)
            })
            
    return profile

def get_earthwork_3d_grid(
    polygon_coords: list,
    target_elevation: float = None,
    slope_grade: float = 0.0,
    slope_angle: float = 0.0,
    topsoil_depth: float = 0.0,
    batter_ratio: float = 3.0,
    custom_dem_id: str = None
):
    poly, dem = get_earthwork_base(polygon_coords, custom_dem_id)
    
    if topsoil_depth > 0:
        dem = dem.subtract(topsoil_depth)
        
    if batter_ratio > 0:
        bounds = poly.buffer(200, 1).bounds()
    else:
        bounds = poly.bounds()
        
    coords = bounds.coordinates().get(0).getInfo()
    lon_min = min(c[0] for c in coords)
    lon_max = max(c[0] for c in coords)
    lat_min = min(c[1] for c in coords)
    lat_max = max(c[1] for c in coords)
    
    dist_x = (lon_max - lon_min) * 111320 * math.cos(math.radians(lat_min))
    dist_y = (lat_max - lat_min) * 111320
    
    max_dist = max(dist_x, dist_y)
    # Target approx 50x50 grid for performance in Plotly
    scale = max(10, max_dist / 50.0)
    
    if target_elevation is None:
        mean_elev = dem.reduceRegion(ee.Reducer.mean(), poly, scale=30, maxPixels=1e9).getInfo().get("DEM", 0)
        target_elevation = mean_elev
        
    target_surface = get_target_surface(poly, target_elevation, slope_grade, slope_angle)
    
    if batter_ratio > 0:
        dist = ee.FeatureCollection([ee.Feature(poly)]).distance(searchRadius=500, maxError=1)
        z_batter_cut = target_surface.add(dist.divide(batter_ratio))
        prop_cut = z_batter_cut.min(dem)
        
        z_batter_fill = target_surface.subtract(dist.divide(batter_ratio))
        prop_fill = z_batter_fill.max(dem)
        
        final_batter_surface = prop_cut.add(prop_fill).subtract(dem)
        
        is_pad = ee.Image.constant(1).clip(poly).unmask(0)
        dist_mask = dist.lte(500)
        
        proposed_dem = dem.unmask().where(dist_mask, final_batter_surface)
        proposed_dem = proposed_dem.where(is_pad, target_surface)
    else:
        proposed_dem = dem.unmask().where(ee.Image.constant(1).clip(poly), target_surface)
    
    # Resample to EPSG:4326 grid
    dem_resampled = dem.unmask().reproject(crs="EPSG:4326", scale=scale)
    prop_resampled = proposed_dem.unmask().reproject(crs="EPSG:4326", scale=scale)
    
    dem_grid = dem_resampled.sampleRectangle(region=bounds, defaultValue=0).getInfo()
    prop_grid = prop_resampled.sampleRectangle(region=bounds, defaultValue=0).getInfo()
    
    return {
        "original_z": dem_grid.get("properties", {}).get("DEM", []),
        "proposed_z": prop_grid.get("properties", {}).get("constant", prop_grid.get("properties", {}).get("DEM", [])), 
        "lon_min": lon_min,
        "lon_max": lon_max,
        "lat_min": lat_min,
        "lat_max": lat_max,
        "scale": scale
    }


def get_earthwork_3d_surface(
    polygon_coords: list,
    target_elevation: float = None,
    slope_grade: float = 0.0,
    slope_angle: float = 0.0,
    topsoil_depth: float = 0.0,
    batter_ratio: float = 3.0,
    custom_dem_id: str = None
):
    poly, dem = get_earthwork_base(polygon_coords, custom_dem_id)
    if topsoil_depth > 0:
        dem = dem.subtract(topsoil_depth)
        
    dist = ee.FeatureCollection([ee.Feature(poly)]).distance(searchRadius=500, maxError=1)
    
    # Calculate target surface
    if target_elevation is None:
        target_elevation = dem.reduceRegion(reducer=ee.Reducer.mean(), geometry=poly, scale=30, maxPixels=1e9).getInfo().get("DEM")
    target_surface = get_target_surface(poly, target_elevation, slope_grade, slope_angle)
    
    if batter_ratio > 0:
        z_batter_cut = target_surface.add(dist.divide(batter_ratio))
        prop_cut = z_batter_cut.min(dem)
        
        z_batter_fill = target_surface.subtract(dist.divide(batter_ratio))
        prop_fill = z_batter_fill.max(dem)
        
        proposed = prop_cut.add(prop_fill).subtract(dem)
    else:
        proposed = target_surface
        
    dem_with_props = dem.addBands(ee.Image.pixelLonLat()).addBands(proposed.rename('proposed'))
    
    samples = dem_with_props.sample(
        region=poly.buffer(100, 1),
        scale=30,
        geometries=False,
        numPixels=3000
    ).getInfo()
    
    features = samples.get("features", [])
    if not features:
        return []
        
    pts = []
    for f in features:
        props = f["properties"]
        if "longitude" in props and "latitude" in props and "DEM" in props and "proposed" in props:
            pts.append({
                "x": props["longitude"],
                "y": props["latitude"],
                "z_exist": props["DEM"],
                "z_prop": props["proposed"]
            })
    return pts
