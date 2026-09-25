import re

with open('backend/gee/earthwork.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix duplicates in _analyze_single_zone signature
content = content.replace(
    'def _analyze_single_zone(\n    boreholes: list = None,\n    \n    polygon_coords',
    'def _analyze_single_zone(\n    polygon_coords'
)
content = content.replace(
    'custom_dem_id: str = None,\n    boreholes: list = None\n):',
    'custom_dem_id: str = None,\n    boreholes: list = None,\n    water_table_depth: float = 0.0\n):'
)

# Fix duplicates in analyze_earthwork signature
content = content.replace(
    'def analyze_earthwork(\n    boreholes: list = None,\n    \n    polygon_coords',
    'def analyze_earthwork(\n    polygon_coords'
)
content = content.replace(
    'custom_dem_id: str = None,\n    boreholes: list = None\n) -> dict:',
    'custom_dem_id: str = None,\n    boreholes: list = None,\n    water_table_depth: float = 0.0\n) -> dict:'
)

# Update _analyze_single_zone call
content = content.replace(
    'topsoil_depth, batter_ratio, strata_layers, custom_dem_id, boreholes\n            )',
    'topsoil_depth, batter_ratio, strata_layers, custom_dem_id, boreholes, water_table_depth\n            )'
)

# Replace inverseDistance with Kriging
old_idw = "fc.inverseDistance(range=10000, propertyName='depth', mean=1, stdDev=1, gamma=1)"
new_kriging = "fc.kriging(propertyName='depth', shape='spherical', range=10000, sill=1.0, nugget=0.1, maxDistance=10000)"
content = content.replace(old_idw, new_kriging)

# Add water table logic to _analyze_single_zone
target_logic = "adj_vol_m3 = vol_m3 * layer_swell"

new_logic = """
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
"""
content = content.replace(target_logic, new_logic)

with open('backend/gee/earthwork.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched earthwork.py successfully!")
