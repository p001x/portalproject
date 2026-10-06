import sys
import os
import json
from pprint import pprint

sys.path.append(os.path.abspath("backend"))

from gee.ndvi import compute_ndvi
from gee.auth import init_gee

def test_canada_ndvi():
    init_gee()
    
    aoi_config = {"type": "gaul0", "country": "Canada"}
    print("Testing NDVI for Canada...")
    
    # We use 2020 to be safe (no historical 1990 Landsat complexities)
    res = compute_ndvi(aoi_config, "2020-01-01", "2020-12-31")
    
    print("Result keys:", res.keys())
    print("NDVI MapId url:", res.get("ndvi_url"))
    print("NDVI Download url:", res.get("ndvi_download_url"))
    print("Classified panels length:", len(res.get("classified", {}).get("panels", [])))
    
    # Also verify Russia since it spans 11 time zones
    print("\nTesting NDVI for Russia...")
    res2 = compute_ndvi({"type": "gaul0", "country": "Russian Federation"}, "2020-01-01", "2020-12-31")
    print("Result keys:", res2.keys())
    print("NDVI MapId url:", res2.get("ndvi_url"))
    print("Classified panels length:", len(res2.get("classified", {}).get("panels", [])))

if __name__ == "__main__":
    test_canada_ndvi()
