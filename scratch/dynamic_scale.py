import os
import re

gee_dir = r"c:\Users\user\Documents\blacportal\backend\gee"

dynamic_scale_code = """
    # Calculate dynamic scale based on geometry size (sq km)
    area_sqkm = aoi.area().divide(1e6).getInfo()
    if area_sqkm > 10000:
        dynamic_scale = 500   # Entire Country (High memory footprint)
    elif area_sqkm > 2000:
        dynamic_scale = 250   # Province
    elif area_sqkm > 500:
        dynamic_scale = 100   # Large District
    else:
        dynamic_scale = 30    # Sector or small polygon
"""

# Files that already have the dynamic scale (rusle.py) or shouldn't be touched
exclude_files = ["rusle.py", "aoi_utils.py", "classify_utils.py", "gee_utils.py"]

for filename in os.listdir(gee_dir):
    if not filename.endswith(".py") or filename in exclude_files:
        continue
        
    filepath = os.path.join(gee_dir, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    original_content = content

    # 1. Inject dynamic scale logic after aoi = get_aoi_geometry
    # Sometimes it's aoi = get_aoi_geometry(aoi_config), sometimes aoi_geom = ...
    if "dynamic_scale = " not in content:
        # Find the line defining aoi
        match = re.search(r'([ \t]+)([a-zA-Z0-9_]+)\s*=\s*get_aoi_geometry\([^)]+\)', content)
        if match:
            indent = match.group(1)
            aoi_var = match.group(2)
            
            # Format the injection code with the correct variable name and indentation
            injection = f"\n{indent}# Calculate dynamic scale based on geometry size (sq km)\n"
            injection += f"{indent}area_sqkm = {aoi_var}.area().divide(1e6).getInfo()\n"
            injection += f"{indent}if area_sqkm > 10000:\n"
            injection += f"{indent}    dynamic_scale = 500   # Entire Country (High memory footprint)\n"
            injection += f"{indent}elif area_sqkm > 2000:\n"
            injection += f"{indent}    dynamic_scale = 250   # Province\n"
            injection += f"{indent}elif area_sqkm > 500:\n"
            injection += f"{indent}    dynamic_scale = 100   # Large District\n"
            injection += f"{indent}else:\n"
            injection += f"{indent}    dynamic_scale = 30    # Sector or small polygon\n"
            
            # Insert after the aoi definition
            insert_pos = match.end()
            content = content[:insert_pos] + injection + content[insert_pos:]

    # 2. Remove bestEffort=True
    content = re.sub(r',\s*bestEffort=True', '', content)
    content = re.sub(r'bestEffort=True,\s*', '', content)
    content = re.sub(r'bestEffort=True', '', content)
    
    # 3. Update scale=XXX to scale=dynamic_scale in reduceRegion calls
    content = re.sub(r'scale=[0-9]+', 'scale=dynamic_scale', content)

    # 4. Update maxPixels to 1e10
    content = re.sub(r'maxPixels=[0-9eE]+', 'maxPixels=1e10', content)
    
    if content != original_content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Updated {filename}")
    else:
        print(f"No changes needed for {filename}")
