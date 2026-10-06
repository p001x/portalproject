import sys
import os

try:
    import ee
except ImportError:
    print("Please run this with the correct python env")
    sys.exit(1)

sys.path.append(r"c:\Users\user\Documents\blacportal\backend")
from gee.auth import initialize_gee
initialize_gee()
import ee

from gee.aoi_utils import get_aoi_geometry, get_bounds_and_center
from gee.ndvi import compute_ndvi

# Run NDVI for Russia with quantiles (Classified)
aoi_config = {"type": "gaul0", "country": "Russian Federation"}
res = compute_ndvi(
    aoi_config=aoi_config,
    start_date="2023-01-01",
    end_date="2023-12-31",
    method="quantiles",
    n_classes=5,
    custom_labels=None
)

print("Thumb URL:")
print(res.get("thumb_url"))
print("Tile URL:")
print(res.get("tile_url"))
