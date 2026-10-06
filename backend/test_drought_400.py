import ee
import urllib.request
import urllib.error
import json
import os
from gee.drought import compute_agricultural_drought
from gee.auth import initialize_gee

os.environ["GEE_SERVICE_ACCOUNT_KEY"] = open("backend/gee_key.json").read().strip()
initialize_gee()

aoi_config = {"type": "rwanda_district", "district": "Gasabo", "name": "Gasabo"}
print("Computing drought classify...")
res = compute_agricultural_drought(aoi_config, 2023)

thumb = res.get("dvi_class_thumb_url")
print("Thumb URL:", thumb)

if thumb:
    try:
        req = urllib.request.Request(thumb, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as resp:
            print("Success! Size:", len(resp.read()))
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code)
        print(e.read().decode("utf-8"))
