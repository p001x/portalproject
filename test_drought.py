import sys
import os
import json
import ee
from dotenv import load_dotenv

load_dotenv("backend/.env")
credentials = ee.ServiceAccountCredentials(os.getenv("EE_SERVICE_ACCOUNT"), key_data=os.getenv("EE_PRIVATE_KEY"))
ee.Initialize(credentials, project="blac-geoportal-sandbox")

try:
    from backend.gee.drought import compute_drought_map
    
    aoi_config = {"name": "Rwanda", "country": "Rwanda", "geometry": {"type": "Polygon", "coordinates": [[[29.0, -2.5], [30.0, -2.5], [30.0, -1.5], [29.0, -1.5], [29.0, -2.5]]]}}
    
    res = compute_drought_map(
        aoi_config=aoi_config,
        start_year=2024,
        end_year=2024,
        n_classes=5
    )
    print("SUCCESS")
    print(res)
except Exception as e:
    import traceback
    traceback.print_exc()
