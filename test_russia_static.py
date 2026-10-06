import ee
import json
from pprint import pprint

ee.Initialize(project='ee-test')

import sys
sys.path.append(r'c:\Users\user\Documents\blacportal\backend')

from gee.aoi_utils import get_aoi_config, get_bounds_and_center
from gee.classify_utils import add_classification_to_image
from gee.ndvi import calculate_ndvi, mask_clouds

aoi_cfg = {"type": "global", "country": "Russian Federation"}
aoi = get_aoi_config(aoi_cfg)

# Calculate NDVI
dataset = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(aoi.geometry()).filterDate('2026-04-02', '2026-10-02')
dataset = dataset.map(mask_clouds)
ndvi_coll = dataset.map(calculate_ndvi)
image = ndvi_coll.median().clip(aoi.geometry())

# Apply classification
classified = add_classification_to_image(image, 'NDVI', aoi, 5, 'natural_breaks', scale=50000)

palette = ["#a50026", "#d73027", "#f46d43", "#fdae61", "#fee08b", "#ffffbf", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850"]
vis_params = {
    'min': 1,
    'max': 5,
    'palette': palette[:5]
}
class_image = classified.select('NDVI_class')

# Generate static map URL
bounds_info = get_bounds_and_center(aoi.geometry())
region = bounds_info['bounds']

print("Requesting static map URL...")
try:
    url = class_image.visualize(**vis_params).getThumbURL({
        'region': region,
        'dimensions': '800',
        'format': 'png'
    })
    print(url)
except Exception as e:
    print("FAILED:", str(e))
