import sys
import json
from gee.auth import initialize_gee
from gee.habitat import compute_habitat, get_habitat_config

def main():
    print("Initializing GEE...")
    initialize_gee()

    print("\n1. Testing config endpoint logic...")
    config = get_habitat_config()
    print("Config returned successfully:")
    print("  Factors:", config["factors"])
    print("  Years:", config["available_years"])

    print("\n2. Testing habitat computation...")
    aoi_config = {"type": "rwanda", "country": "Rwanda", "province": "Kigali City", "district": "Gasabo", "name": "Gasabo"}
    try:
        res = compute_habitat(
            aoi_config=aoi_config,
            reverse_flags={},
            n_classes=5,
            custom_weights=None,
            method="natural_breaks",
            custom_labels=None,
            year=2021,
            landcover_scores=None
        )
        print("Success! Computation returned:")
        print("  Center:", res["center"])
        print("  Tile URL:", bool(res["tile_url"]))
        print("  Stats:", res.get("class_areas_km2"))
        print("  Factors found:", list(res.get("factors", {}).keys()))
    except Exception as e:
        print("Error during computation:")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
