import urllib.request
import json
import time

BASE_URL = "http://127.0.0.1:8001"

def test_module(name, endpoint, payload):
    print(f"\n==========================================")
    print(f"Testing {name} ({endpoint})...")
    print(f"==========================================")
    t0 = time.time()
    try:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(f"{BASE_URL}{endpoint}", data=body, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=120) as res:
            elapsed = time.time() - t0
            data = json.loads(res.read().decode("utf-8"))
            print(f"SUCCESS in {elapsed:.1f} seconds! Status: {res.status}")
            print(f"Keys returned: {list(data.keys())}")
            if "tile_url" in data:
                print(f"tile_url: {data['tile_url'][:60]}...")
            elif "lsi_tile_url" in data:
                print(f"lsi_tile_url: {data['lsi_tile_url'][:60]}...")
            elif "lst_tile_url" in data:
                print(f"lst_tile_url: {data['lst_tile_url'][:60]}...")
            return True
    except Exception as e:
        elapsed = time.time() - t0
        print(f"FAILED after {elapsed:.1f} seconds: {e}")
        return False

print("Starting individual deep verification of GEE modules...")

m1 = test_module("RUSLE (Soil Erosion)", "/api/rusle", {"district": "Huye", "year": 2023, "n_classes": 5})
m2 = test_module("Landfill Siting", "/api/landfill", {"district": "Nyagatare", "n_classes": 5})
m3 = test_module("Air Pollution (NO2)", "/api/air-pollution", {"district": "Nyarugenge", "start_date": "2023-01-01", "end_date": "2023-12-31", "n_classes": 5})
m4 = test_module("Landslide Susceptibility", "/api/landslide", {"district": "Musanze", "start_year": 2018, "end_year": 2023, "n_classes": 5})
m5 = test_module("Urban Heat Island (UHI)", "/api/uhi", {"district": "Kicukiro", "start_date": "2024-01-01", "end_date": "2024-06-30", "grid_size": 6})

print("\n==========================================")
print("FINAL DEEP VERIFICATION RESULTS:")
print(f"RUSLE:               {'PASS' if m1 else 'FAIL'}")
print(f"Landfill Siting:     {'PASS' if m2 else 'FAIL'}")
print(f"Air Pollution (NO2): {'PASS' if m3 else 'FAIL'}")
print(f"Landslide:           {'PASS' if m4 else 'FAIL'}")
print(f"UHI:                 {'PASS' if m5 else 'FAIL'}")
print("==========================================")
