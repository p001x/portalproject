import sys
sys.path.append(r"c:\Users\user\Documents\blacportal\backend")
import ee
ee.Initialize(project='test-project')

from gee.aoi_utils import get_dynamic_scale

# Massive box over Russia
geojson = {
    "type": "Polygon",
    "coordinates": [
        [
            [20.0, 40.0],
            [180.0, 40.0],
            [180.0, 80.0],
            [20.0, 80.0],
            [20.0, 40.0]
        ]
    ]
}

geom = ee.Geometry(geojson)
scale = get_dynamic_scale(geom)
print("Dynamic scale is:", scale)
