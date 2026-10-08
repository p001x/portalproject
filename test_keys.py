import os, glob, json, ee
from google.oauth2 import service_account

base_dir = r"c:\Users\user\Documents\blacportal\backend"
keys = glob.glob(os.path.join(base_dir, "gee_key*.json"))

print(f"Found {len(keys)} keys")
for key_file in keys:
    try:
        with open(key_file, "r") as f:
            key_data = json.load(f)
        
        project_id = key_data.get("project_id", "ee-petersonyang87")
        creds = service_account.Credentials.from_service_account_info(key_data)
        ee.Initialize(creds, project=project_id)
        
        print(f"Testing {os.path.basename(key_file)} (Project: {project_id})...")
        # Run a heavy operation
        img = ee.Image(1)
        res = img.reduceRegion(reducer=ee.Reducer.mean(), geometry=ee.Geometry.Point([0, 0]), scale=1, maxPixels=10).getInfo()
        print(f" -> OK: {os.path.basename(key_file)}")
    except Exception as e:
        print(f" -> ERROR: {os.path.basename(key_file)} - {e}")
        # Rename it so it's not used
        os.rename(key_file, key_file + ".bad")
        print(f" -> Disabled {os.path.basename(key_file)}")