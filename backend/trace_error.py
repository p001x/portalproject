import requests
import json

url = "http://127.0.0.1:8000/api/aoi/drought/classify"
payload = {
    "aoi_config": {"type": "gaul0", "country": "China"},
    "year": 2023
}

try:
    response = requests.post(url, json=payload, timeout=600)
    print(f"Status: {response.status_code}")
    print(response.text)
except Exception as e:
    print(f"Request failed: {e}")
