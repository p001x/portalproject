import urllib.request
import json

BASE_URL = "http://127.0.0.1:8001"

def post_json(endpoint, payload):
    url = f"{BASE_URL}{endpoint}"
    print(f"--- Testing {endpoint} ---")
    try:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=30) as res:
            data = json.loads(res.read().decode("utf-8"))
            print(f"Status: {res.status}")
            print("Keys returned:", list(data.keys()))
            if "tile_url" in data:
                print("tile_url present:", data["tile_url"][:60] + "...")
            return True, data
    except Exception as e:
        print(f"ERROR on {endpoint}: {e}")
        return False, str(e)

print("Evaluating all 8 Analysis Module Endpoints...\n")

tests = [
    ("/api/ndvi", {"district": "Gasabo", "start_date": "2024-01-01", "end_date": "2024-06-30", "n_classes": 5}),
    ("/api/lst", {"district": "Gasabo", "start_date": "2024-01-01", "end_date": "2024-06-30", "n_classes": 5}),
    ("/api/rusle", {"district": "Huye", "year": 2023, "n_classes": 5}),
    ("/api/slope", {"district": "Musanze", "n_classes": 5}),
    ("/api/landfill", {"district": "Nyagatare", "n_classes": 5}),
    ("/api/air-pollution", {"district": "Nyarugenge", "start_date": "2023-01-01", "end_date": "2023-12-31", "n_classes": 5}),
    ("/api/landslide", {"district": "Musanze", "start_year": 2018, "end_year": 2023, "n_classes": 5}),
    ("/api/uhi", {"district": "Kicukiro", "start_date": "2024-01-01", "end_date": "2024-06-30", "grid_size": 6}),
]

results = {}
for ep, body in tests:
    ok, resp = post_json(ep, body)
    results[ep] = ok

print("\n--- ALL MODULES TEST SUMMARY ---")
for ep, ok in results.items():
    print(f"{ep:20s}: {'PASS' if ok else 'FAIL'}")
