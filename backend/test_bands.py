from gee.auth import initialize_gee
import ee

initialize_gee()
coll = ee.ImageCollection("LARSE/GEDI/GEDI02_A_002_MONTHLY")
print("Bands:", coll.first().bandNames().getInfo())
