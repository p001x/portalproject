import time
import ee

try:
    ee.Initialize()
except Exception:
    import urllib.request
    urllib.request.urlopen("http://127.0.0.1:8001/api/air-pollution", timeout=1) # dummy

from gee.air_pollution import compute_air_pollution

print("Starting computation locally...")
t0 = time.time()
try:
    res = compute_air_pollution({"district": "Musanze"}, "2023-01-01", "2023-12-31", 5)
    print(f"Finished in {time.time()-t0:.2f} seconds")
except Exception as e:
    import traceback
    traceback.print_exc()
