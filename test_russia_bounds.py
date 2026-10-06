import sys
import os

try:
    import ee
except ImportError:
    print("Please run this with the correct python env")
    sys.exit(1)

sys.path.append(r"c:\Users\user\Documents\blacportal\backend")
from main import _require_gee
_require_gee()

from gee.aoi_utils import get_aoi_geometry, get_bounds_and_center

aoi = get_aoi_geometry({"type": "gaul0", "country": "Russian Federation"})
bounds, center = get_bounds_and_center(aoi)

# Create region for Continuous
region_continuous = ee.Geometry.Polygon(bounds, "EPSG:4326", False)
# Create region for Classified
region_classified = ee.Geometry.Polygon([bounds], "EPSG:4326", False)

print("Continuous Region Bounds:")
print(region_continuous.bounds().getInfo())

print("Classified Region Bounds:")
print(region_classified.bounds().getInfo())
