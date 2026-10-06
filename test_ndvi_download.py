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
import requests

from gee.ndvi import compute_ndvi

# Run NDVI for Russia with quantiles (Classified)
aoi_config = {"type": "gaul0", "country": "Russian Federation"}
print("Computing NDVI...")
res = compute_ndvi(
    aoi_config=aoi_config,
    start_date="2023-01-01",
    end_date="2023-12-31",
    method="quantiles",
    n_classes=5,
    custom_labels=None
)

thumb_url = res.get("thumb_url")
print("Thumb URL:")
print(thumb_url)

if thumb_url:
    print("Downloading thumb_url...")
    r = requests.get(thumb_url)
    with open("russia_thumb_classified.png", "wb") as f:
        f.write(r.content)
    print("Saved russia_thumb_classified.png")
