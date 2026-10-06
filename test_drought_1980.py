import sys
import os
import json
from pprint import pprint

sys.path.append(os.path.abspath("backend"))
from gee.auth import initialize_gee
from gee.drought import compute_drought

def test_1980_drought():
    initialize_gee()
    
    aoi_config = {"type": "gaul0", "country": "Rwanda"}
    
    print("Testing Drought 1980 for Rwanda...")
    res = compute_drought(aoi_config, start_year=1980, end_year=1980, season="season_b")
    
    print("Result keys:", res.keys())
    print("DVI map url:", res.get("dvi_url"))
    print("Precip map url:", res.get("precip_url"))
    print("Panels count:", len(res.get("classified", {}).get("panels", [])))
    
    print("\nTesting Drought 1995 (Landsat 5 + AVHRR active)...")
    res2 = compute_drought(aoi_config, start_year=1995, end_year=1995, season="season_b")
    print("Result keys:", res2.keys())
    print("DVI map url:", res2.get("dvi_url"))

if __name__ == "__main__":
    test_1980_drought()
