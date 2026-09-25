import ee
from gee.auth import initialize_gee
from gee.aoi_utils import get_aoi_geometry
from gee.habitat import get_dynamic_scale

initialize_gee()
aoi_config = {"type": "rwanda", "country": "Rwanda", "province": "Kigali City", "district": "Gasabo"}
aoi = get_aoi_geometry(aoi_config)
scale = get_dynamic_scale(aoi)

lc = ee.Image("ESA/WorldCover/v200/2021").select("Map").clip(aoi)
water_mask = lc.eq(80)

print("Starting reduceToVectors...")
water_fc = water_mask.updateMask(water_mask).reduceToVectors(
    geometry=aoi, scale=scale, maxPixels=1e9
)

print("Starting distance computation...")
water_dist = water_fc.distance(50000, 50)
mean_dist = water_dist.reduceRegion(ee.Reducer.mean(), aoi, scale).getInfo()
print("Success! Mean distance:", mean_dist)
