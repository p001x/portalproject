import os
import re

gee_dir = r"c:\Users\user\Documents\blacportal\backend\gee"
files_with_error = ["accessibility.py", "drought.py", "dvi.py", "flood.py", "habitat.py", 
                    "irrigation.py", "landfill.py", "landslide.py", "lst.py", "uhi.py", "water_harvesting.py"]

# This script removes the previously incorrectly injected code
# and correctly injects it inside every function that actually needs dynamic_scale.

for filename in files_with_error:
    filepath = os.path.join(gee_dir, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Strip existing incorrect injection
    content = re.sub(r'[ \t]*# Calculate dynamic scale.*?dynamic_scale = 30\s*# Sector or small polygon\n', '', content, flags=re.DOTALL)

    # Now we need to inject the logic exactly where it's needed.
    # The safest way is to inject it BEFORE `with concurrent.futures.ThreadPoolExecutor`
    # Or, if that doesn't exist, just at the top of the compute function.
    
    geom_var = "geometry" if filename in ["drought.py", "dvi.py"] else "aoi"

    injection_code = f"""
    # Calculate dynamic scale based on geometry size (sq km)
    area_sqkm = {geom_var}.area().divide(1e6).getInfo()
    if area_sqkm > 10000:
        dynamic_scale = 500
    elif area_sqkm > 2000:
        dynamic_scale = 250
    elif area_sqkm > 500:
        dynamic_scale = 100
    else:
        dynamic_scale = 30
"""

    if "with concurrent.futures" in content:
        # Inject right before ThreadPoolExecutor
        content = re.sub(r'([ \t]+)with concurrent\.futures\.ThreadPoolExecutor', r'\1' + injection_code.strip().replace('\n', '\n\\1') + r'\n\1with concurrent.futures.ThreadPoolExecutor', content)
    else:
        # Fallback for files without ThreadPoolExecutor (like irrigation.py)
        # Find def compute_* and inject right after the cache check
        # Usually looks like:
        #     with _lock:
        #         if cache_key in _cache:
        #             return _cache[cache_key]
        content = re.sub(r'([ \t]+)return _cache\[cache_key\]\n', r'\1return _cache[cache_key]\n\n\1' + injection_code.strip().replace('\n', '\n\\1') + '\n', content)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Fixed {filename}")

