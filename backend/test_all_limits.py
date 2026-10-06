import sys
sys.path.append(".")

import ee
import os
from gee.auth import initialize_gee

os.environ["GEE_SERVICE_ACCOUNT_KEY"] = open("gee_key.json").read().strip()
initialize_gee()

print("EE Initialized")

from gee.drought import compute_drought_map, compute_drought_classify

aoi_config = {"type": "country", "name": "Rwanda"}
try:
    print("Computing drought map...")
    result = compute_drought_map(
        aoi_config=aoi_config,
        start_year=2024,
        end_year=2024,
        season="season_b"
    )
    print("Success Map!")
    print("Thumb URL:", result.get("thumb_url"))

    print("Computing classify map...")
    result2 = compute_drought_classify(
        aoi_config=aoi_config,
        start_year=2024,
        end_year=2024,
        season="season_b",
        n_classes=5
    )
    print("Success Classify!")
    print("Thumb URL:", result2.get("dvi_class_thumb_url"))

except Exception as e:
    print("Error:", e)
