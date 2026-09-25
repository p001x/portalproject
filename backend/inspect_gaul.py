import ee
from gee.auth import initialize_gee

initialize_gee()
rwanda = ee.FeatureCollection("FAO/GAUL/2015/level1").filter(ee.Filter.eq("ADM0_NAME", "Rwanda"))
print("GAUL provinces:", rwanda.aggregate_array("ADM1_NAME").getInfo())
