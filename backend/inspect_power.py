import ee
from gee.auth import initialize_gee
initialize_gee()
fc = ee.FeatureCollection("projects/ee-petersonyang87/assets/POWER_Regional_Daily_20240101_20241001")
print("Size:", fc.size().getInfo())
print("First feature:", fc.first().getInfo())
