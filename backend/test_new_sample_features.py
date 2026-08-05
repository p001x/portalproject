import urllib.request
import json
import time

BASE_URL = "http://127.0.0.1:8001"

def test_endpoint(name, url, method="GET", data=None):
    print(f"--- Testing {name}: {method} {url} ---")
    try:
        req = urllib.request.Request(url, method=method)
        if data:
            body = json.dumps(data).encode("utf-8")
            req.add_header("Content-Type", "application/json")
            res = urllib.request.urlopen(req, data=body, timeout=30)
        else:
            res = urllib.request.urlopen(req, timeout=30)
        
        status = res.status
        content = res.read().decode("utf-8", errors="ignore")
        print(f"Status: {status}")
        print(f"Response (first 300 chars): {content[:300]}")
        return True, json.loads(content)
    except Exception as e:
        print(f"ERROR: {e}")
        return False, str(e)

print("Testing New Sample Digitization & RARE DATA Features...\n")

# 1. Test Supervised Classification Endpoint
ok1, res1 = test_endpoint("Supervised Classification", f"{BASE_URL}/api/classify/supervised", method="POST", data={})

# 2. Test Ingest Link URL Endpoint
ok2, res2 = test_endpoint("Ingest Link URL", f"{BASE_URL}/api/samples/ingest-url", method="POST", data={
    "url": "https://raw.githubusercontent.com/datasets/geo-boundaries/master/data/rwanda.geojson",
    "class_label": "Rwanda_Boundary"
})

# 3. Test RARE DATA List & Import
ok_list, list_res = test_endpoint("List Datasets", f"{BASE_URL}/api/datasets?source=admin")
if ok_list and list_res.get("records"):
    ds_id = list_res["records"][0]["id"]
    ok3, res3 = test_endpoint("Preview Dataset", f"{BASE_URL}/api/datasets/{ds_id}/preview?source=admin")
    ok4, res4 = test_endpoint("Import Dataset into Samples", f"{BASE_URL}/api/samples/import-from-dataset", method="POST", data={
        "dataset_id": ds_id,
        "source": "admin",
        "class_label": "RareData_Import"
    })
else:
    ok3, ok4 = False, False

print("\n--- SUMMARY OF NEW FEATURES ---")
print(f"Supervised Classification: {'PASS' if ok1 else 'FAIL'}")
print(f"Ingest Link URL:           {'PASS' if ok2 else 'FAIL'}")
print(f"Preview Dataset:           {'PASS' if ok3 else 'FAIL'}")
print(f"Import Dataset to Samples: {'PASS' if ok4 else 'FAIL'}")
