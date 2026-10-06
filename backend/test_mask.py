import ee

ee.Initialize(project='blac-portal')

# Point in Vologodskaya Oblast
pt = ee.Geometry.Point([40.0, 60.0])
aoi = pt.buffer(1000)

print("Testing rain...")
era = ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR").select("total_precipitation_sum")
rain = era.filterDate("2020-01-01", "2020-12-31").sum().multiply(1000).clip(aoi).rename("bio12")
print("Rain:", rain.reduceRegion(ee.Reducer.mean(), aoi, 100).getInfo())

print("Testing DEM...")
dem = ee.Image("USGS/SRTMGL1_003").select("elevation").unmask(ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").mosaic(), False).unmask(0).clip(aoi)
print("DEM:", dem.reduceRegion(ee.Reducer.mean(), aoi, 100).getInfo())

print("Testing flow_acc...")
merit_upa = ee.Image("MERIT/Hydro/v1_0_1").select('upa')
flow_acc = merit_upa.unmask(1).clip(aoi)
print("Flow ACC:", flow_acc.reduceRegion(ee.Reducer.mean(), aoi, 100).getInfo())

print("Testing clay/sand...")
clay = ee.Image("OpenLandMap/SOL/SOL_CLAY-WFRACTION_USDA-3A1A1A_M/v02").select("b0").clip(aoi)
sand = ee.Image("OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02").select("b0").clip(aoi)
print("Clay:", clay.reduceRegion(ee.Reducer.mean(), aoi, 100).getInfo())
print("Sand:", sand.reduceRegion(ee.Reducer.mean(), aoi, 100).getInfo())
