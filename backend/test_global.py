import ee
from gee.auth import initialize_gee
import os

os.environ["GEE_SERVICE_ACCOUNT_KEY"] = open("gee_key.json").read().strip()
initialize_gee()

geom = ee.Geometry.Rectangle([-180, -90, 180, 90], "EPSG:4326", False)
print("Original area:", geom.area().getInfo())
try:
    buf = geom.buffer(500, maxError=5000)
    print("Buffered area:", buf.area().getInfo())
except Exception as e:
    print("Buffer failed:", e)

try:
    area = geom.bounds().area(maxError=1000).getInfo()
    print("Bounds Area:", area)
except Exception as e:
    print("Bounds Area failed:", e)
