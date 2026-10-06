import ee
from gee.auth import initialize_gee
import os

os.environ["GEE_SERVICE_ACCOUNT_KEY"] = open("gee_key.json").read().strip()
initialize_gee()

geom = ee.Geometry.Rectangle([-180, -90, 180, 90], "EPSG:4326", False)
# Create a dummy image
img = ee.Image(1).visualize(palette=['red'])

try:
    url = img.getThumbURL({"region": geom.bounds(), "dimensions": 800, "crs": "EPSG:4326", "format": "png"})
    print("Thumb URL Global:", url)
except Exception as e:
    print("Thumb URL Global Failed:", e)
