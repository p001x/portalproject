import urllib.request
import json

req = urllib.request.Request("http://127.0.0.1:8001/api/irrigation/map", method="POST", headers={"Content-Type": "application/json"}, data=json.dumps({
    "aoi": {"type": "rwanda", "country": "Rwanda", "province": "Eastern Province", "name": "Bugesera"},
    "start_date": "2023-11-24",
    "end_date": "2023-12-01",
    "crop_type": "Maize"
}).encode('utf-8'))

try:
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
        print("Body:", response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.reason)
except Exception as e:
    print("Error:", e)
