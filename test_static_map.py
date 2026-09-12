import requests

url = "http://127.0.0.1:5000/api/static-map"
payload = {
    "district": "Musanze",
    "title": "A — Annual Soil Loss",
    "url": "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png", # Dummy image just to test the endpoint
    "class_areas": {"Class 1": 10, "Class 2": 20},
    "show_frame": True,
    "show_legend": True,
    "show_scale": False,
    "show_compass": False,
    "output_format": "PNG"
}

try:
    r = requests.post(url, json=payload)
    print(f"Status Code: {r.status_code}")
    if r.status_code != 200:
        print(r.text)
    else:
        print(f"Success! Downloaded {len(r.content)} bytes.")
except Exception as e:
    print(f"Error: {e}")
