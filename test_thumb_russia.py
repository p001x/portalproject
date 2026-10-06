import ee
import urllib.request
import sys
import json
import ssl

sys.path.insert(0, r"c:\Users\user\Documents\blacportal\backend")

try:
    with open(r"c:\Users\user\Documents\blacportal\backend\gee\gee_sessions.json") as f:
        credentials = json.load(f)
    token = credentials.get("refresh_token")
    if token:
        cred = ee.oauth.get_credentials_from_dict({"refresh_token": token})
        ee.Initialize(cred, project='blac-portal-2')
    else:
        ee.Initialize(project='blac-portal-2')
except Exception as e:
    ee.Initialize(project='blac-portal-2')

from gee.aoi_utils import get_aoi_geometry, get_bounds_and_center

aoi_config = {
    "type": "global",
    "country": "Russian Federation"
}

aoi = get_aoi_geometry(aoi_config)
bounds, center = get_bounds_and_center(aoi)

# Simulate classify_utils.py behavior exactly
region_bad = ee.Geometry.Polygon(bounds, "EPSG:4326", False)
vis_params = {"min": 1, "max": 5, "palette": ["#a50026", "#d73027", "#f46d43", "#fdae61", "#fee08b"]}
img = ee.Image.constant(3)
url_bad = img.getThumbURL({
    "region": region_bad, "dimensions": 512, "crs": "EPSG:4326", "format": "png"
})
print("URL Bad:", url_bad)

try:
    print("Testing bad URL...")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    resp = urllib.request.urlopen(url_bad, timeout=10, context=ctx)
    print("Bad URL response:", resp.getcode())
except Exception as e:
    print("Bad URL failed:", e)

# Simulate fixed behavior
region_good = ee.Geometry.Polygon([bounds], "EPSG:4326", False)
url_good = img.getThumbURL({
    "region": region_good, "dimensions": 512, "crs": "EPSG:4326", "format": "png"
})
print("URL Good:", url_good)
try:
    print("Testing good URL...")
    resp = urllib.request.urlopen(url_good, timeout=10, context=ctx)
    print("Good URL response:", resp.getcode())
except Exception as e:
    print("Good URL failed:", e)

# Also test aoi.bounds()
region_best = aoi.bounds(maxError=1000)
url_best = img.getThumbURL({
    "region": region_best, "dimensions": 512, "crs": "EPSG:4326", "format": "png"
})
print("URL Best:", url_best)
try:
    print("Testing best URL...")
    resp = urllib.request.urlopen(url_best, timeout=10, context=ctx)
    print("Best URL response:", resp.getcode())
except Exception as e:
    print("Best URL failed:", e)
