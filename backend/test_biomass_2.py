import urllib.request
import json
import traceback

try:
    url = 'http://127.0.0.1:8000/api/biomass/map'
    data = json.dumps({
        "aoi": {"type": "district", "name": "GICUMBI"},
        "buffer_km": 3.0,
        "year_start": 2019,
        "year_end": 2023
    }).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        with open("C:/Users/user/Documents/blacportal/backend/test_output.txt", "w") as f:
            f.write(f"KEYS: {res.keys()}\n")
            f.write(f"FACTOR MAPS KEYS: {res.get('factor_maps', {}).keys()}\n")
except Exception as e:
    with open("C:/Users/user/Documents/blacportal/backend/test_output.txt", "w") as f:
        f.write(f"ERROR:\n{traceback.format_exc()}\n")
