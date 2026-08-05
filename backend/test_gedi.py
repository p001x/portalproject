import ee
import os

os.environ["GEE_PROJECT_ID"] = "ee-petersonyang87"
import gee.auth
gee.auth.initialize_gee()

roi = ee.Geometry.Rectangle([29.0, -2.8, 30.8, -1.0]) # Approx Rwanda
start = "2022-01-01"
end = "2024-12-31"

coll = (ee.ImageCollection("LARSE/GEDI/GEDI02_A_002_MONTHLY")
        .filterDate(start, end)
        .filterBounds(roi)
        .select("rh98"))

print("Checking focal_max...")
img = coll.mean().focal_max(radius=1.5, units='kilometers')
print(f"Bands after focal_max: {img.bandNames().getInfo()}")

print(f"Size with limit 1: {size}")

if size > 0:
    print("There is data!")
else:
    print("No data found!")
