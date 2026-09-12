import os
os.environ["HTTP_PROXY"] = ""
os.environ["HTTPS_PROXY"] = ""
import ee
ee.Initialize()

from backend.gee.water_harvesting import _build_water_harvesting_images, apply_natural_breaks
from backend.gee.aoi_utils import get_aoi_geometry

aoi_config = {"type": "rwanda", "country": "Rwanda", "province": "VILLE DE K", "district": "GASABO", "name": "Gasabo"}
aoi, annual_precip, monthly_precip = _build_water_harvesting_images(aoi_config, 2023)
hist = monthly_precip.reduceRegion(
    reducer=ee.Reducer.autoHistogram(maxBuckets=100),
    geometry=aoi, scale=250, maxPixels=10000, bestEffort=True
).getInfo()

print("HIST:", hist)

try:
    scale = 250
    classified_precip, breaks = apply_natural_breaks(monthly_precip, aoi, scale, 5)
    _PRECIP_VIS = {"min": 1, "max": 5, "palette": ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"]}
    map_id = classified_precip.getMapId(_PRECIP_VIS)
    print("URL:", map_id["tile_fetcher"].url_format)
except Exception as e:
    print("ERROR:", e)
