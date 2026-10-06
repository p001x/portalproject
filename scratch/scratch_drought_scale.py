import sys
import os

sys.path.append(r"c:\Users\user\Documents\blacportal\backend")
import ee
ee.Initialize(project="test")

from gee.aoi_utils import get_dynamic_scale

china = ee.FeatureCollection("FAO/GAUL/2015/level0").filter(ee.Filter.eq("ADM0_NAME", "China")).geometry()
try:
    scale = get_dynamic_scale(china)
    print("China scale:", scale)
except Exception as e:
    print("China scale error:", e)

world = ee.Geometry.Polygon(
    [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]], None, False
)
try:
    scale = get_dynamic_scale(world)
    print("World scale:", scale)
except Exception as e:
    print("World scale error:", e)
