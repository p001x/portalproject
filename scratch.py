import requests
resp = requests.post("http://127.0.0.1:8000/api/accessibility/map", json={
    "aoi": {"type": "rwanda", "country": "Rwanda", "name": "Rwanda"},
    "amenities": ["primary_school"],
    "dest_amenities": [],
    "proposed_facilities": None
})
print("Status Code:", resp.status_code)
print("Response:", resp.text)
