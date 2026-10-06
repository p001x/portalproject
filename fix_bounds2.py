import os, glob, re

gee_dir = 'c:/Users/user/Documents/blacportal/backend/gee'
py_files = glob.glob(os.path.join(gee_dir, '*.py'))

for pf in py_files:
    if os.path.basename(pf) == 'slope.py': continue
    
    with open(pf, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # Check if this file has f_bounds = executor.submit( ... )
    if 'f_bounds = executor.submit' in content:
        # Remove the f_bounds submit block
        content = re.sub(r'\s*f_bounds\s*=\s*executor\.submit\(\s*lambda:\s*aoi\w*\.bounds\(\)\.getInfo\(\)\["coordinates"\]\[0\]\s*\)', '', content)
        
        # Remove bounds = f_bounds.result()
        content = re.sub(r'\s*bounds\s*=\s*f_bounds\.result\(\)', '', content)
        
        # Replace center_lon and center_lat with get_bounds_and_center call
        pat = re.compile(r'(\s+)center_lon\s*=\s*\(bounds\[0\]\[0\]\s*\+\s*bounds\[2\]\[0\]\)\s*/\s*2\s+center_lat\s*=\s*\(bounds\[0\]\[1\]\s*\+\s*bounds\[2\]\[1\]\)\s*/\s*2')
        content = pat.sub(r'\1from gee.aoi_utils import get_bounds_and_center\n\1bounds, center = get_bounds_and_center(aoi)\n\1center_lat, center_lon = center[0], center[1]', content)

    # Some other files (like landslide.py) have bounds but not f_bounds? Let's check:
    if 'bounds = aoi.bounds().getInfo()["coordinates"][0]' in content:
        pat = re.compile(r'(\s+)bounds\s*=\s*aoi\.bounds\(\)\.getInfo\(\)\["coordinates"\]\[0\]\s+center\s*=\s*\[\(bounds\[0\]\[1\]\s*\+\s*bounds\[2\]\[1\]\)\s*/\s*2,\s*\(bounds\[0\]\[0\]\s*\+\s*bounds\[2\]\[0\]\)\s*/\s*2\]')
        content = pat.sub(r'\1from gee.aoi_utils import get_bounds_and_center\n\1bounds, center = get_bounds_and_center(aoi)', content)

    if content != original_content:
        with open(pf, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed bounds logic in {os.path.basename(pf)}")
