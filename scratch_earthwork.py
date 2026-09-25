import os
import re

file_path = r"c:\Users\user\Documents\blacportal\backend\gee\earthwork.py"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# We want to replace everything from get_earthwork_base to the end of the file.
# No, let's just write the whole file content out.

new_content = """import ee
import json
import logging
from cachetools import TTLCache, cached
import threading
import math
import numpy as np

logger = logging.getLogger(__name__)

_earthwork_cache = TTLCache(maxsize=5000, ttl=86400)
_lock = threading.Lock()

def get_earthwork_base(polygon_coords: list):
    poly = ee.Geometry.Polygon([polygon_coords])
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

def analyze_earthwork(
    polygon_coords: list, 
    target_elevation: float = None, 
    auto_balance: bool = False,
    swell_factor: float = 1.0, 
    shrink_factor: float = 1.0,
    slope_grade: float = 0.0,
    slope_angle: float = 0.0,
    topsoil_depth: float = 0.0,
    strata_layers: list = None
) -> dict:
    poly, dem = get_earthwork_base(polygon_coords)
    
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
        # Binary search
        min_elev_dict = dem.reduceRegion(reducer=ee.Reducer.min(), geometry=poly, scale=30, maxPixels=1e9).getInfo()
        max_elev_dict = dem.reduceRegion(reducer=ee.Reducer.max(), geometry=poly, scale=30, maxPixels=1e9).getInfo()
        
        low = min_elev_dict.get("DEM", mean_elev - 100)
        high = max_elev_dict.get("DEM", mean_elev + 100)
        
        best_elev = mean_elev
        best_diff = float('inf')
        
        for _ in range(7):
            mid = (low + high) / 2
            bal = _compute_volumes_only(poly, dem, mid, swell_factor, shrink_factor, slope_grade, slope_angle, topsoil_depth, strata_layers)
            if abs(bal) < best_diff:
                best_diff = abs(bal)
                best_elev = mid
                
            if bal > 0:
                low = mid
            else:
                high = mid
                
        target_elevation = round(best_elev, 2)
    elif target_elevation is None:
        target_elevation = mean_elev
        
    if topsoil_depth > 0:
        dem = dem.subtract(topsoil_depth)
        
    target_surface = get_target_surface(poly, target_elevation, slope_grade, slope_angle)
        
    diff = dem.subtract(target_surface)
    pixel_area = ee.Image.pixelArea()
    
    cut = diff.updateMask(diff.gt(0)).multiply(pixel_area)
    fill = diff.updateMask(diff.lt(0)).abs().multiply(pixel_area)
    
    cut_vol_dict = cut.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo()
    fill_vol_dict = fill.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo()
    
    raw_cut_m3 = cut_vol_dict.get("DEM") or 0
    raw_fill_m3 = fill_vol_dict.get("DEM") or 0
    
    strata_results = []
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
            adj_vol_m3 = vol_m3 * layer_swell
            
            strata_results.append({
                "name": layer.get("name", "Layer"),
                "raw_m3": round(vol_m3, 2),
                "adjusted_m3": round(adj_vol_m3, 2)
            })
            adjusted_cut_m3 += adj_vol_m3
            current_depth += layer_thickness
            
        depth_above = cut_depth_img.subtract(current_depth)
        valid_above = depth_above.updateMask(depth_above.gt(0))
        if valid_above is not None:
            rem_vol_img = valid_above.multiply(pixel_area)
            rem_vol = rem_vol_img.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo()
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
    
    area_m2 = poly.area(maxError=1).getInfo()
    
    cut_diff = diff.updateMask(diff.gt(0))
    cut_vis = cut_diff.visualize(min=0, max=5, palette=["#fc9272", "#fb6a4a", "#ef3b2c", "#cb181d", "#99000d"])
    
    fill_diff_abs = diff.updateMask(diff.lt(0)).abs()
    fill_vis = fill_diff_abs.visualize(min=0, max=5, palette=["#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#084594"])
    
    heatmap = ee.ImageCollection([fill_vis, cut_vis]).mosaic().clip(poly)
    
    map_id = heatmap.getMapId()
    
    cut_with_coords = cut_diff.addBands(ee.Image.pixelLonLat())
    max_cut_feat = cut_with_coords.reduceRegion(
        reducer=ee.Reducer.max(3).setOutputs(['depth', 'lon', 'lat']),
        geometry=poly,
        scale=30,
        maxPixels=1e9
    ).getInfo()
    
    fill_with_coords = fill_diff_abs.addBands(ee.Image.pixelLonLat())
    max_fill_feat = fill_with_coords.reduceRegion(
        reducer=ee.Reducer.max(3).setOutputs(['depth', 'lon', 'lat']),
        geometry=poly,
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
    cut_x_sum = cut_mass_x.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo().get('longitude', 0)
    cut_y_sum = cut_mass_y.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo().get('latitude', 0)
    cut_depth_sum = cut_diff.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo().get('DEM', 0)
    
    cut_centroid = None
    if cut_depth_sum > 0:
        cut_centroid = {"lon": cut_x_sum / cut_depth_sum, "lat": cut_y_sum / cut_depth_sum}
        
    fill_mass_x = lonLat.select('longitude').multiply(fill_diff_abs)
    fill_mass_y = lonLat.select('latitude').multiply(fill_diff_abs)
    fill_x_sum = fill_mass_x.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo().get('longitude', 0)
    fill_y_sum = fill_mass_y.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo().get('latitude', 0)
    fill_depth_sum = fill_diff_abs.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo().get('DEM', 0)
    
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
    
    return {
        "mean_elevation": mean_elev,
        "target_elevation": target_elevation,
        "raw_cut_m3": round(raw_cut_m3, 2),
        "raw_fill_m3": round(raw_fill_m3, 2),
        "adjusted_cut_m3": round(adjusted_cut_m3, 2),
        "adjusted_fill_m3": round(adjusted_fill_m3, 2),
        "strata_results": strata_results,
        "net_balance_m3": round(adjusted_cut_m3 - adjusted_fill_m3, 2),
        "area_m2": round(area_m2 or 0, 2),
        "heatmap_tile_url": map_id["tile_fetcher"].url_format,
        "max_cut_point": max_cut_pt,
        "max_fill_point": max_fill_pt,
        "logistics": {
            "haul_distance_m": haul_distance_m,
            "haul_effort_m3_km": haul_effort_m3_km,
            "cut_centroid": cut_centroid,
            "fill_centroid": fill_centroid
        }
    }

def profile_earthwork_line(
    polygon_coords: list, 
    line_coords: list, 
    target_elevation: float, 
    slope_grade: float = 0.0, 
    slope_angle: float = 0.0, 
    topsoil_depth: float = 0.0
):
    poly, dem = get_earthwork_base(polygon_coords)
    
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
"""

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)
