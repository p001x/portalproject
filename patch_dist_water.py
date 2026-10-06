import re

path = r"c:\Users\user\Documents\blacportal\backend\gee\wellscope.py"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace rivers.distance with fastDistanceTransform on streams
old_dist_water = """        rivers = ee.FeatureCollection("WWF/HydroSHEDS/v1/FreeFlowingRivers").filterBounds(aoi)
        dist_water = rivers.distance(searchRadius=20000, maxError=500).unmask(20000).clip(aoi).rename("dist_water")"""

new_dist_water = """        # Use fastDistanceTransform on raster streams instead of FeatureCollection.distance to prevent GEE timeouts on massive AOIs
        # fastDistanceTransform computes distance to 0, so we use streams.Not() (where rivers are 1 -> 0, background 0 -> 1)
        # Max 256 pixels distance. Multiplied by pixel resolution to get meters.
        dist_water = streams.Not().fastDistanceTransform(256).multiply(ee.Image.pixelArea().sqrt()).clip(aoi).rename("dist_water")"""

content = content.replace(old_dist_water, new_dist_water)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Replaced dist_water successfully!")
