import requests

payload = {
  "aoi_config": {
    "type": "gaul2",
    "country": "Rwanda",
    "level1": "North/Amajyaruguru",
    "level2": "Musanze",
    "name": "Musanze"
  },
  "start_year": 2019,
  "end_year": 2024
}

res = requests.post("http://localhost:8002/api/landslide/map", json=payload)
data = res.json()
print(f"Status Code: {res.status_code}")
if res.status_code == 200:
    print("Success! Keys in response:")
    print(list(data.keys()))
    if "factor_maps" in data:
        print("factor_maps:")
        for factor, d in data["factor_maps"].items():
            print(f"  {factor}: {d.get('tile_url', 'No tile url')}")
    else:
        print("Missing factor_maps in response!")
else:
    print(data)
