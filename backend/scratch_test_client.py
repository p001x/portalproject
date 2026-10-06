from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

req = {
    "aoi": {"type": "rwanda", "country": "Rwanda", "name": "Rwanda"},
    "start_year": 2024,
    "end_year": 2024,
    "season": "season_b"
}

print("Testing /api/drought/map")
response = client.post("/api/drought/map", json=req)
print("Status Code:", response.status_code)
if response.status_code == 200:
    print("Response keys:", list(response.json().keys()))
    print("dvi_tile_url:", response.json().get("dvi_tile_url"))
else:
    print("Error:", response.text)
