import ee
import json
try:
    with open(r"c:\Users\user\Documents\blacportal\backend\gee\gee_sessions.json") as f:
        credentials = json.load(f)
    token = credentials.get("refresh_token")
    if token:
        cred = ee.oauth.get_credentials_from_dict({"refresh_token": token})
        ee.Initialize(cred, project='ee-test')
    else:
        ee.Initialize(project='ee-test')
except:
    ee.Initialize(project='ee-test')

# Test MERIT DEM
try:
    dem = ee.Image("MERIT/DEM/v1_0_3").select('dem')
    print("MERIT DEM is available!")
except Exception as e:
    print("MERIT Error:", e)

# Test COPERNICUS DEM
try:
    dem2 = ee.ImageCollection("COPERNICUS/DEM/GLO30").select('DEM').mosaic()
    print("COPERNICUS DEM is available!")
except Exception as e:
    print("COPERNICUS Error:", e)
