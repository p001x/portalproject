import urllib.request
import json
import time

BASE_URL = "http://127.0.0.1:8001"

print(f"\n==========================================")
print(f"Testing Air Pollution...")
print(f"==========================================")
t0 = time.time()
try:
    payload = {"district": "Musanze", "start_date": "2023-01-01", "end_date": "2023-12-31", "n_classes": 5}
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/api/air-pollution", data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as res:
        elapsed = time.time() - t0
        data = json.loads(res.read().decode("utf-8"))
        print(f"SUCCESS in {elapsed:.1f} seconds! Status: {res.status}")
except urllib.error.HTTPError as e:
    elapsed = time.time() - t0
    print(f"FAILED after {elapsed:.1f} seconds: HTTP {e.code}")
    print(e.read().decode("utf-8"))
except Exception as e:
    elapsed = time.time() - t0
    print(f"FAILED after {elapsed:.1f} seconds: {e}")
