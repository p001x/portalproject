import ee
from gee.auth import initialize_gee
import json
from gee.habitat import _build_habitat_images, DEFAULT_WEIGHTS

initialize_gee()
aoi_config = {"type": "rwanda", "country": "Rwanda", "province": "Kigali City", "district": "Gasabo"}

reverse_flags = {}
print("Starting full habitat build test...")
try:
    aoi, suitability, score_images, raw_images, weights, actual_breaks, scale = _build_habitat_images(aoi_config, reverse_flags, DEFAULT_WEIGHTS, year=2021)
    
    # Force evaluation by getting some info
    mean_val = suitability.reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=aoi,
        scale=500,
        maxPixels=1e9
    ).getInfo()
    
    print("SUCCESS! Mean habitat score:", mean_val)
except Exception as e:
    print("ERROR:", e)
