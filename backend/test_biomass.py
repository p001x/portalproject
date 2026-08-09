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
        print("KEYS:", res.keys())
        print("FACTOR MAPS KEYS:", res.get('factor_maps', {}).keys())
except Exception as e:
    print("ERROR:")
    traceback.print_exc()
