import sys
import json

sys.path.append(r"c:\Users\user\Documents\blacportal\backend")

import ee
from google.oauth2.service_account import Credentials

with open(r"c:\Users\user\Documents\blacportal\backend\gee_key.json") as f:
    key_data = json.load(f)
credentials = Credentials.from_service_account_info(key_data)
scoped_credentials = credentials.with_scopes(['https://www.googleapis.com/auth/earthengine'])
ee.Initialize(scoped_credentials, project=key_data.get('project_id'))

geom = ee.Geometry.Polygon([[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]], None, False)
print("geom area:", geom.area(maxError=1).divide(1e6).getInfo())
print("geom bounds area:", geom.bounds().area(maxError=1).divide(1e6).getInfo())
