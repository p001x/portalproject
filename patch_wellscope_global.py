import re

path = r"c:\Users\user\Documents\blacportal\backend\gee\wellscope.py"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Fix Lithology to unmask(0) before remap, so areas outside Rwanda get default score 3
content = content.replace(
    'lith = ee.Image("projects/ee-petersonyang87/assets/litodoloy").clip(aoi)',
    'lith = ee.Image("projects/ee-petersonyang87/assets/litodoloy").unmask(0).clip(aoi)'
)

# 2. Fix HydroSHEDS flow_acc (missing above 60N, e.g. Russia) to unmask(1)
content = content.replace(
    'flow_acc = ee.Image("WWF/HydroSHEDS/15ACC").select(\'b1\').clip(aoi)',
    'flow_acc = ee.Image("WWF/HydroSHEDS/15ACC").select(\'b1\').unmask(1).clip(aoi)'
)

# 3. Fix distance to rivers masking beyond 20km
content = content.replace(
    'dist_water = rivers.distance(searchRadius=20000, maxError=500).clip(aoi).rename("dist_water")',
    'dist_water = rivers.distance(searchRadius=20000, maxError=500).unmask(20000).clip(aoi).rename("dist_water")'
)

# 4. Fix soil permeability
content = content.replace(
    'permeability = sand.subtract(clay).rename("soil_perm")',
    'permeability = sand.subtract(clay).unmask(0).rename("soil_perm")'
)

# 5. Fix DEM unmasking fallback
content = content.replace(
    'dem = ee.Image("USGS/SRTMGL1_003").select("elevation").unmask(ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").mosaic(), False).clip(aoi)',
    'dem = ee.Image("USGS/SRTMGL1_003").select("elevation").unmask(ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").mosaic(), False).unmask(0).clip(aoi)'
)

# 6. Fix LULC masking
content = content.replace(
    'lulc = ee.ImageCollection("ESA/WorldCover/v200").first().select(\'Map\').clip(aoi)',
    'lulc = ee.ImageCollection("ESA/WorldCover/v200").first().select(\'Map\').unmask(0).clip(aoi)'
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched wellscope.py successfully!")
