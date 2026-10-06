import os, glob, re

gee_dir = 'c:/Users/user/Documents/blacportal/backend/gee'

# 1. Add helper to aoi_utils.py
helper_code = '''
def get_bounds_and_center(aoi):
    try:
        bounds_info = aoi.bounds(maxError=1000).getInfo()
        if bounds_info.get("type") == "Polygon":
            bounds = bounds_info.get("coordinates", [[[0,0]]])[0]
        elif bounds_info.get("type") == "MultiPolygon":
            bounds = bounds_info.get("coordinates", [[[[0,0]]]])[0][0]
        else:
            bounds = [[0,0],[0,0],[0,0],[0,0]]
            
        center_coords = aoi.centroid(maxError=1000).getInfo().get("coordinates", [0, 0])
        center = [center_coords[1], center_coords[0]]
    except Exception:
        bounds = [[0,0],[0,0],[0,0],[0,0]]
        center = [0, 0]
    return bounds, center
'''

aoi_utils_path = os.path.join(gee_dir, 'aoi_utils.py')
with open(aoi_utils_path, 'a', encoding='utf-8') as f:
    f.write(helper_code)

# 2. Replace occurrences in all py files
py_files = glob.glob(os.path.join(gee_dir, '*.py'))

pat1 = re.compile(r'(\s+)bounds\s*=\s*aoi_geometry\.bounds\(\)\.getInfo\(\)\["coordinates"\]\[0\]\s+center\s*=\s*\[\(bounds\[0\]\[1\]\s*\+\s*bounds\[2\]\[1\]\)\s*/\s*2,\s*\(bounds\[0\]\[0\]\s*\+\s*bounds\[2\]\[0\]\)\s*/\s*2\]')

pat2 = re.compile(r'(\s+)bounds\s*=\s*aoi\.bounds\(\)\.getInfo\(\)\["coordinates"\]\[0\]\s+center\s*=\s*\[\(bounds\[0\]\[1\]\s*\+\s*bounds\[2\]\[1\]\)\s*/\s*2,\s*\(bounds\[0\]\[0\]\s*\+\s*bounds\[2\]\[0\]\)\s*/\s*2\]')

for pf in py_files:
    if os.path.basename(pf) == 'slope.py':
        continue # Already manually fixed
    with open(pf, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = pat1.sub(r'\1from gee.aoi_utils import get_bounds_and_center\n\1bounds, center = get_bounds_and_center(aoi_geometry)', content)
    new_content = pat2.sub(r'\1from gee.aoi_utils import get_bounds_and_center\n\1bounds, center = get_bounds_and_center(aoi)', new_content)
    
    if new_content != content:
        with open(pf, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Updated {os.path.basename(pf)} regular bounds')
