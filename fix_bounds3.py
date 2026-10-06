import os, glob, re

gee_dir = 'c:/Users/user/Documents/blacportal/backend/gee'
py_files = glob.glob(os.path.join(gee_dir, '*.py'))

pat = re.compile(r'(\s+)bounds\s*=\s*aoi\w*\.bounds\(\)\.getInfo\(\)\["coordinates"\]\[0\]\s+center_lon\s*=\s*\(bounds\[0\]\[0\]\s*\+\s*bounds\[2\]\[0\]\)\s*/\s*2\s+center_lat\s*=\s*\(bounds\[0\]\[1\]\s*\+\s*bounds\[2\]\[1\]\)\s*/\s*2')
pat2 = re.compile(r'(\s+)bounds\s*=\s*aoi\.bounds\(\)\.getInfo\(\)\["coordinates"\]\[0\]\s+center_lon\s*=\s*\(bounds\[0\]\[0\]\s*\+\s*bounds\[2\]\[0\]\)\s*/\s*2\s+center_lat\s*=\s*\(bounds\[0\]\[1\]\s*\+\s*bounds\[2\]\[1\]\)\s*/\s*2')

for pf in py_files:
    if os.path.basename(pf) == 'slope.py': continue
    
    with open(pf, 'r', encoding='utf-8') as f:
        content = f.read()
    
    orig = content
    content = pat.sub(r'\1from gee.aoi_utils import get_bounds_and_center\n\1bounds, center = get_bounds_and_center(aoi)\n\1center_lat, center_lon = center[0], center[1]', content)
    content = pat2.sub(r'\1from gee.aoi_utils import get_bounds_and_center\n\1bounds, center = get_bounds_and_center(aoi)\n\1center_lat, center_lon = center[0], center[1]', content)
    
    # Finally, if bounds = aoi.bounds().getInfo()["coordinates"][0] is there standalone, replace it.
    if 'bounds = aoi.bounds().getInfo()["coordinates"][0]' in content:
        if 'get_bounds_and_center' not in content:
            content = 'from gee.aoi_utils import get_bounds_and_center\n' + content
        content = re.sub(r'bounds\s*=\s*aoi\.bounds\(\)\.getInfo\(\)\["coordinates"\]\[0\]', 'bounds, _ = get_bounds_and_center(aoi)', content)

    if orig != content:
        with open(pf, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Fixed synchronous bounds in {os.path.basename(pf)}')
