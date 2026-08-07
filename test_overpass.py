import requests

amenities = ["school"]
miny, minx, maxy, maxx = -1.97, 29.9, -1.93, 30.1 # Approximate Kigali
overpass_bbox = f"{miny:.6f},{minx:.6f},{maxy:.6f},{maxx:.6f}"

query = f"""
[out:json][timeout:90];
(
  node["amenity"~"^{'$|^'.join(amenities)}$"]({overpass_bbox});
  way["amenity"~"^{'$|^'.join(amenities)}$"]({overpass_bbox});
  relation["amenity"~"^{'$|^'.join(amenities)}$"]({overpass_bbox});
);
out center;
"""
with open("test_overpass_output.txt", "w") as f:
    f.write("Querying Overpass:\n" + query + "\n")
    headers = {"User-Agent": "RwandaGeoPortal/1.0"}
    try:
        response = requests.post("https://overpass-api.de/api/interpreter", data=query.encode('utf-8'), headers=headers)
        response.raise_for_status()
        data = response.json()
        f.write(f"Found elements: {len(data.get('elements', []))}\n")
        if data.get('elements'):
            f.write(str(data['elements'][0]) + "\n")
    except Exception as e:
        f.write(f"Error: {e}\n")
        if hasattr(e, 'response') and e.response:
            f.write(e.response.text + "\n")
