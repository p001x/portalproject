import ee
import urllib.request
import urllib.error
import os
from backend.gee.auth import initialize_gee

os.environ["GEE_SERVICE_ACCOUNT_KEY"] = open("backend/gee_key.json").read().strip()
initialize_gee()

img = ee.Image(1)
url = img.getThumbURL({"min": 0, "max": 2, "palette": ["red", "green", "blue"], "region": ee.Geometry.Point([30, -2]).buffer(1000).bounds(), "dimensions": 100, "format": "png"})
print("URL:", url)
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req)
    print("Size:", len(resp.read()))
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code)
    print(e.read().decode("utf-8"))
