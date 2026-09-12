import concurrent.futures
import time
from gee.auth import initialize_gee
from gee.habitat import compute_habitat_map, compute_habitat_stats, compute_habitat_classify, compute_habitat_export

initialize_gee()

aoi_config = {"type": "rwanda", "country": "Rwanda", "province": "VILLE DE K", "district": "GASABO", "name": "Gasabo"}

def run_map():
    from gee.aoi_utils import get_aoi_geometry
    import json
    aoi = get_aoi_geometry(aoi_config)
    
    # We will test reducing each raw band manually
    res = compute_habitat_map(aoi_config, {}, None)
    return res

def run_stats():
    start = time.time()
    res = compute_habitat_stats(aoi_config, {}, None)
    print(f"Stats done in {time.time()-start:.2f}s")
    return res

def run_classify():
    start = time.time()
    res = compute_habitat_classify(aoi_config, {}, 5, None, "natural_breaks")
    print(f"Classify done in {time.time()-start:.2f}s")
    return res

def run_export():
    start = time.time()
    res = compute_habitat_export(aoi_config, {}, 5, None, "natural_breaks")
    print(f"Export done in {time.time()-start:.2f}s")
    return res

print("Starting single test...")
try:
    run_map()
except Exception as e:
    import traceback
    traceback.print_exc()
print("Done")
