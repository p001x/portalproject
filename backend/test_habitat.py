import json
import traceback
from gee.habitat import compute_habitat_suitability

if __name__ == "__main__":
    try:
        import ee
        ee.Initialize(project="test-project") # Mock or user's project
    except Exception as e:
        print("Earth Engine initialization failed:", e)

    aoi = {"type": "kigali"}
    try:
        print("Testing Habitat Suitability Module...")
        result = compute_habitat_suitability(aoi, reverse_flags={}, n_classes=5, custom_weights=None)
        print("Success! Keys returned:", result.keys())
    except Exception as e:
        print("Error encountered:")
        traceback.print_exc()
