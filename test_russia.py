import os
import sys
import time

sys.path.append(r"c:\Users\user\Documents\blacportal\backend")

import ee
from gee.wellscope import compute_wellscope_stats

try:
    ee.Initialize(project='test-project') # Add a dummy init or use the one that works in the project
except Exception as e:
    print(f"Failed to initialize EE: {e}")

# Russia FeatureCollection
russia_fc = ee.FeatureCollection("FAO/GAUL/2015/level0").filter(ee.Filter.eq('ADM0_NAME', 'Russian Federation'))
russia_geom = russia_fc.geometry()

aoi_config = {
    "type": "custom",
    "geojson": russia_geom.getInfo()
}

print("Starting wellscope stats for Russia...")
t0 = time.time()
try:
    stats = compute_wellscope_stats(aoi_config)
    print(f"Finished in {time.time() - t0:.2f} seconds")
    print(stats)
except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"Failed: {e}")
