import os
import re

directory = "c:/Users/user/Documents/blacportal/backend/gee"
files = [f for f in os.listdir(directory) if f.endswith(".py") and f != "aoi_utils.py"]

for filename in files:
    path = os.path.join(directory, filename)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Change function signatures: district_name: str -> aoi_config: dict
    content = re.sub(r'district_name:\s*str', r'aoi_config: dict', content)

    # Change imports: get_district_geometry -> get_aoi_geometry
    content = re.sub(r'get_district_geometry', r'get_aoi_geometry', content)

    # Change usages: aoi = get_aoi_geometry(district_name) -> aoi = get_aoi_geometry(aoi_config)
    content = re.sub(r'get_aoi_geometry\(district_name\)', r'get_aoi_geometry(aoi_config)', content)

    # Update cache keys: district_name -> json.dumps(aoi_config, sort_keys=True)
    # This might require importing json if not present
    if "import json" not in content:
        content = "import json\n" + content

    content = re.sub(r'cache_key\s*=\s*\(\s*district_name,', r'cache_key = (json.dumps(aoi_config, sort_keys=True),', content)
    content = re.sub(r'cache_key\s*=\s*f"\{district_name\}_', r'cache_key = f"{json.dumps(aoi_config, sort_keys=True)}_', content)
    
    # Inside the result dict, replace "district": district_name with "district": aoi_config.get("district", "Custom AOI"), "bbox": bounds
    # (Just replace "district": district_name)
    content = re.sub(r'"district":\s*district_name', r'"district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),\n        "bbox": bounds', content)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

print("Updated gee/*.py")
