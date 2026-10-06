import json
from fastapi.testclient import TestClient
from backend.main import app
import os
from backend.gee.auth import initialize_gee

os.environ["GEE_SERVICE_ACCOUNT_KEY"] = open("backend/gee_key.json").read().strip()
initialize_gee()

client = TestClient(app)

req_data = {
    "aoi": {"type": "rwanda_district", "district": "Gasabo", "name": "Gasabo"},
    "start_year": 2023,
    "end_year": 2023,
    "season": "season_b",
    "n_classes": 5
}

resp = client.post("/api/drought/classify", json=req_data)
print(resp.status_code)
try:
    print(json.dumps(resp.json(), indent=2))
except:
    print(resp.text)
