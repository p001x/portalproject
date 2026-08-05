import urllib.request
import urllib.parse
import json
import io

BASE_URL = "http://127.0.0.1:8001"

def test_endpoint(name, url, method="GET", data=None, headers=None):
    print(f"--- Testing {name}: {method} {url} ---")
    try:
        req = urllib.request.Request(url, method=method)
        if headers:
            for k, v in headers.items():
                req.add_header(k, v)
        if data:
            if isinstance(data, dict):
                body = json.dumps(data).encode("utf-8")
                req.add_header("Content-Type", "application/json")
            elif isinstance(data, bytes):
                body = data
            else:
                body = str(data).encode("utf-8")
            res = urllib.request.urlopen(req, data=body, timeout=10)
        else:
            res = urllib.request.urlopen(req, timeout=10)
        
        status = res.status
        content = res.read().decode("utf-8", errors="ignore")
        print(f"Status: {status}")
        print(f"Response (first 300 chars): {content[:300]}")
        return True, content
    except Exception as e:
        print(f"ERROR: {e}")
        return False, str(e)

print("Starting evaluation of RARE DATA & Sample Digitization APIs...\n")

# 1. RARE DATA List
ok1, res1 = test_endpoint("List Admin Datasets", f"{BASE_URL}/api/datasets?source=admin")
ok2, res2 = test_endpoint("List Community Datasets", f"{BASE_URL}/api/datasets?source=community")

# 2. RARE DATA Link
link_data = {
    "url": "https://example.com/rwanda_forest.geojson",
    "name": "Rwanda Forest Cover Sample",
    "description": "Test dataset link",
    "source": "community",
    "contributor": "Test User"
}
ok3, res3 = test_endpoint("Add Dataset Link", f"{BASE_URL}/api/datasets/link", method="POST", data=link_data)

# 3. Samples List
ok4, res4 = test_endpoint("List Samples", f"{BASE_URL}/api/samples")

# 4. Create Sample
sample_data = {
    "geometry": {
        "type": "Polygon",
        "coordinates": [[[29.8, -1.9], [29.9, -1.9], [29.9, -2.0], [29.8, -2.0], [29.8, -1.9]]]
    },
    "class_label": "Forest",
    "creator": "Tester",
    "color": "#0F6E4F"
}
ok5, res5 = test_endpoint("Create Sample", f"{BASE_URL}/api/samples", method="POST", data=sample_data)

# 5. Export GeoJSON
ok6, res6 = test_endpoint("Export GeoJSON", f"{BASE_URL}/api/samples/export/geojson")

print("\n--- TEST SUMMARY ---")
print(f"Admin Datasets: {'PASS' if ok1 else 'FAIL'}")
print(f"Community Datasets: {'PASS' if ok2 else 'FAIL'}")
print(f"Add Dataset Link: {'PASS' if ok3 else 'FAIL'}")
print(f"List Samples: {'PASS' if ok4 else 'FAIL'}")
print(f"Create Sample: {'PASS' if ok5 else 'FAIL'}")
print(f"Export GeoJSON: {'PASS' if ok6 else 'FAIL'}")
