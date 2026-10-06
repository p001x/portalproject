import ee
import os
from gee.auth import initialize_gee

os.environ["GEE_SERVICE_ACCOUNT_KEY"] = open("gee_key.json").read().strip()
initialize_gee()

print("EE Initialized")

from gee.drought import compute_drought_map

aoi_config = {"type": "country", "name": "Rwanda"}
try:
    print("Computing drought map...")
    result = compute_drought_map(
        aoi_config=aoi_config,
        start_year=2024,
        end_year=2024,
        season="season_b"
    )
    print("Success!")
    print("Thumb URL:", result.get("thumb_url"))
except Exception as e:
    print("Error:", e)
