import re

with open('backend/gee/earthwork.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Add boreholes to _analyze_single_zone
content = content.replace(
    'def _analyze_single_zone(',
    'def _analyze_single_zone(\n    boreholes: list = None,\n    '
)
content = content.replace(
    'topsoil_depth: float = 0.0,\n    batter_ratio: float = 3.0,\n    strata_layers: list = None,\n    custom_dem_id: str = None',
    'topsoil_depth: float = 0.0,\n    batter_ratio: float = 3.0,\n    strata_layers: list = None,\n    custom_dem_id: str = None,\n    boreholes: list = None'
)

# Add boreholes to analyze_earthwork
content = content.replace(
    'def analyze_earthwork(',
    'def analyze_earthwork(\n    boreholes: list = None,\n    '
)

# Pass boreholes to _analyze_single_zone
content = content.replace(
    'topsoil_depth, batter_ratio, strata_layers, custom_dem_id',
    'topsoil_depth, batter_ratio, strata_layers, custom_dem_id, boreholes'
)

# Implement IDW in _analyze_single_zone
target_logic_start = '''    strata_results = []
    adjusted_cut_m3 = 0
    if strata_layers and len(strata_layers) > 0:
        current_depth = 0.0'''

new_logic_start = '''    strata_results = []
    adjusted_cut_m3 = 0
    
    borehole_depth_img = None
    if boreholes and len(boreholes) > 0:
        features = []
        for b in boreholes:
            geom = ee.Geometry.Point([b['lon'], b['lat']])
            features.append(ee.Feature(geom, {'depth': float(b['depth'])}))
        fc = ee.FeatureCollection(features)
        borehole_depth_img = fc.inverseDistance(range=10000, propertyName='depth', mean=1, stdDev=1, gamma=1)
        
    if strata_layers and len(strata_layers) > 0:
        current_depth = ee.Image.constant(0)'''

content = content.replace(target_logic_start, new_logic_start)

target_loop = '''            layer_thickness = layer.get('thickness', 1.0)
            layer_swell = layer.get('swell', 1.0)
            
            depth_above = cut_depth_img.subtract(current_depth)
            valid_above = depth_above.updateMask(depth_above.gt(0))
            amount_in_layer = valid_above.min(layer_thickness)'''

new_loop = '''            layer_thickness = layer.get('thickness', 1.0)
            if layer.get('use_boreholes', False) and borehole_depth_img is not None:
                layer_thickness = borehole_depth_img
            else:
                layer_thickness = ee.Image.constant(layer_thickness)
                
            layer_swell = layer.get('swell', 1.0)
            
            depth_above = cut_depth_img.subtract(current_depth)
            valid_above = depth_above.updateMask(depth_above.gt(0))
            amount_in_layer = valid_above.min(layer_thickness)'''

content = content.replace(target_loop, new_loop)

target_acc = '''            adjusted_cut_m3 += adj_vol_m3
            current_depth += layer_thickness'''

new_acc = '''            adjusted_cut_m3 += adj_vol_m3
            current_depth = current_depth.add(layer_thickness)'''

content = content.replace(target_acc, new_acc)

with open('backend/gee/earthwork.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched earthwork.py successfully!")
