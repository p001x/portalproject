import sys
sys.path.append('.')
from main import app
from fastapi.testclient import TestClient

client = TestClient(app)
resp = client.post('/api/drought', json={
    "aoi": {"type": "rwanda", "country": "Rwanda", "name": "Rwanda", "start_year": 1980, "end_year": 2024},
    "district": "Custom Study Area",
    "start_year": 2024,
    "end_year": 2024,
    "season": "season_b",
    "n_classes": 5,
    "custom_weights": {"sm": 0.5, "rf": 0.5}
})
print("STATUS:", resp.status_code)
if resp.status_code == 200:
    data = resp.json()
    print("KEYS:", data.keys())
    if "factor_maps" in data:
        print("FACTOR MAPS:", data["factor_maps"].keys())
    print("WEIGHTS USED:", data.get("weights_used"))
else:
    print("ERROR:", resp.text)
