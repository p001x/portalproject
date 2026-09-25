import os
import sys

# Set up paths
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gee.auth import initialize_gee
import ee

try:
    initialize_gee()
except Exception as e:
    print("Auth failed:", e)
    sys.exit(1)

from gee.lst import compute_lst

aoi_config = {
    "type": "Polygon",
    "coordinates": [[
        [30.0, -1.9],
        [30.1, -1.9],
        [30.1, -2.0],
        [30.0, -2.0],
        [30.0, -1.9]
    ]]
}

try:
    print("Running compute_lst...")
    res = compute_lst(aoi_config, "2023-01-01", "2023-12-31")
    print("Success! Keys:", res.keys())
    print("Stats:", res["stats"])
except Exception as e:
    import traceback
    traceback.print_exc()
