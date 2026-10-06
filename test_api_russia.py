import time
import requests

url = "http://127.0.0.1:8003/api/wellscope/map"
payload = {
    "aoi": {
        "type": "gaul0",
        "country": "Russian Federation"
    },
    "custom_weights": None
}

print("Sending request to /api/wellscope/map for Russia on port 8003...")
t0 = time.time()
try:
    response = requests.post(url, json=payload, timeout=600)
    print(f"Status Code: {response.status_code}")
    print(f"Time: {time.time() - t0:.2f}s")
    if response.status_code != 200:
        print(f"Response: {response.text[:500]}")
    else:
        print("Success! Response received.")
except Exception as e:
    print(f"Error: {e}. Time: {time.time() - t0:.2f}s")
