import sys
import os
import json

sys.path.append(r"c:\Users\user\Documents\blacportal\backend")

import ee
from google.oauth2.service_account import Credentials

try:
    with open(r"c:\Users\user\Documents\blacportal\backend\gee_key.json") as f:
        key_data = json.load(f)
    credentials = Credentials.from_service_account_info(key_data)
    scoped_credentials = credentials.with_scopes(['https://www.googleapis.com/auth/earthengine'])
    ee.Initialize(scoped_credentials, project=key_data.get('project_id'))
    print("EE Initialized")
except Exception as e:
    print("Init error:", e)

from gee.drought import compute_drought_classify
try:
    print(compute_drought_classify({"type":"world", "country":"World"}, start_year=2023, end_year=2024))
except Exception as e:
    print("Classify Error:", repr(e))
