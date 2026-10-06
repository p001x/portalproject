import ee
import os
from backend.gee.auth import initialize_gee

os.environ["GEE_SERVICE_ACCOUNT_KEY"] = open("gee_key.json").read().strip()
initialize_gee()

from backend.gee.drought import compute_drought_classify

aoi_config = {"type": "country", "name": "Rwanda"}
try:
    print("Computing drought classify...")
    result = compute_drought_classify(
        aoi_config=aoi_config,
        start_year=2024,
        end_year=2024,
        season="season_b",
        n_classes=5
    )
    print("Success!")
    print("Thumb URL (Classified):", result.get("dvi_class_thumb_url"))
except Exception as e:
    print("Error:", e)
