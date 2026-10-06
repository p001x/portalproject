import ee
import os
from gee.auth import initialize_gee

os.environ["GEE_SERVICE_ACCOUNT_KEY"] = open("gee_key.json").read().strip()
initialize_gee()

img = ee.Image(0.5)
bps = [0.2, 0.4, 0.6, 0.8]

# Method 1
cls1 = ee.Image(1)
for i, bp in enumerate(bps):
    cls1 = cls1.where(img.gt(bp), i + 2)

# Method 2
thresholds = ee.Image.constant(bps)
cls2 = img.gt(thresholds).reduce(ee.Reducer.sum()).add(1)

print("Method 1:", cls1.getInfo())
print("Method 2:", cls2.getInfo())
