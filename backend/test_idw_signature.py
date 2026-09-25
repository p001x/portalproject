import ee
from gee.auth import initialize_gee

initialize_gee()
fc = ee.FeatureCollection([ee.Feature(None, {"val": 1})])
try:
    print(dir(fc))
    help(fc.inverseDistance)
except Exception as e:
    print("Error:", e)
