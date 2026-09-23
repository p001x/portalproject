import ee
import json
import logging
from cachetools import TTLCache, cached
import threading
import math

logger = logging.getLogger(__name__)

_earthwork_cache = TTLCache(maxsize=5000, ttl=86400)
_lock = threading.Lock()

def get_earthwork_base(polygon_coords: list):
    """Returns poly and DEM for earthwork."""
    # Convert list of coordinates to a Polygon
    poly = ee.Geometry.Polygon([polygon_coords])
    # GLO-30 Copernicus DEM is more accurate than SRTM
    dem = ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").mosaic().clip(poly)
    return poly, dem

def analyze_earthwork(
    polygon_coords: list, 
    target_elevation: float = None, 
    swell_factor: float = 1.0, 
    shrink_factor: float = 1.0,
    slope_grade: float = 0.0,
    slope_angle: float = 0.0,
    topsoil_depth: float = 0.0,
    strata_layers: list = None
) -> dict:
    poly, dem = get_earthwork_base(polygon_coords)
    
    # 1. Get Mean Elevation of the polygon
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
    
    # If target_elevation is not provided, default to mean elevation
    if target_elevation is None:
        target_elevation = mean_elev
        
    # Apply Topsoil Stripping (remove topsoil from DEM)
    if topsoil_depth > 0:
        dem = dem.subtract(topsoil_depth)
        
    # Create the Target Surface
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
        
        # Approx meters per degree
        meters_per_deg_lat = 111320.0
        meters_per_deg_lon = ee.Number(cy).multiply(math.pi / 180.0).cos().multiply(111320.0)
        
        dx_m = dx.multiply(meters_per_deg_lon)
        dy_m = dy.multiply(meters_per_deg_lat)
        
        dir_x = angle_rad.sin()
        dir_y = angle_rad.cos()
        
        # Distance along slope
        dist_along_slope = dx_m.multiply(dir_x).add(dy_m.multiply(dir_y))
        elev_adj = dist_along_slope.multiply(grade_frac)
        
        target_surface = ee.Image.constant(target_elevation).add(elev_adj)
    else:
        target_surface = ee.Image.constant(target_elevation)
        
    # 2. Compute Cut and Fill
    diff = dem.subtract(target_surface)
    pixel_area = ee.Image.pixelArea()
    
    cut = diff.updateMask(diff.gt(0)).multiply(pixel_area)
    fill = diff.updateMask(diff.lt(0)).abs().multiply(pixel_area)
    
    cut_vol_dict = cut.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo()
    fill_vol_dict = fill.reduceRegion(reducer=ee.Reducer.sum(), geometry=poly, scale=30, maxPixels=1e9).getInfo()
    
    raw_cut_m3 = cut_vol_dict.get("DEM") or 0
    raw_fill_m3 = fill_vol_dict.get("DEM") or 0
    
    # Advanced Strata Cut Calculation
    strata_results = []
    adjusted_cut_m3 = 0
    if strata_layers and len(strata_layers) > 0:
        current_depth = 0.0
        cut_depth_img = diff.updateMask(diff.gt(0))
        for layer in strata_layers:
            # Depth of this layer
            layer_thickness = layer.get('thickness', 1.0)
            layer_swell = layer.get('swell', 1.0)
            
            # The portion of the cut depth that falls within this strata layer
            # amount_in_layer = min(max(cut_depth_img - current_depth, 0), layer_thickness)
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
            
        # Any remaining cut depth below all defined strata layers defaults to the last layer's swell or base swell
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
        # Basic Swell
        adjusted_cut_m3 = raw_cut_m3 * swell_factor
    
    # Shrink factor
    adjusted_fill_m3 = raw_fill_m3 / shrink_factor if shrink_factor > 0 else raw_fill_m3
    
    # Area
    area_m2 = poly.area(maxError=1).getInfo()
    
    # 3. Generate Visual Heatmap Tile URL
    # Cut is where diff > 0. We'll visualize diff from 0 to +5 as Light Red to Dark Red
    cut_diff = diff.updateMask(diff.gt(0))
    cut_vis = cut_diff.visualize(min=0, max=5, palette=["#fc9272", "#fb6a4a", "#ef3b2c", "#cb181d", "#99000d"])
    
    # Fill is where diff < 0. We'll visualize abs(diff) from 0 to 5 as Light Blue to Dark Blue
    fill_diff_abs = diff.updateMask(diff.lt(0)).abs()
    fill_vis = fill_diff_abs.visualize(min=0, max=5, palette=["#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#084594"])
    
    # Blend them together
    heatmap = ee.ImageCollection([fill_vis, cut_vis]).mosaic().clip(poly)
    
    map_id = heatmap.getMapId()
    
    # 4. Find Max Cut and Max Fill locations (Pinpoints)
    # addBands adds longitude and latitude bands to the image
    cut_with_coords = cut_diff.addBands(ee.Image.pixelLonLat())
    # reduceRegion with max(3) finds the maximum of the FIRST band (cut depth) and returns it along with the other 2 bands (lon, lat)
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
        
    # Phase 4: Mass Haul Logistics
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
        
    # The actual haul effort is the volume that is MOVED from cut to fill (which is the min of cut and fill)
    hauled_volume = min(adjusted_cut_m3, adjusted_fill_m3)
    # Effort in m3*km
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
