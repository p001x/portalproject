import urllib.request
import urllib.parse
import json

query = """[out:json][timeout:25];(node["amenity"~"hospital|clinic|health"](-2.5,29.5,-1.9,30.1);way["amenity"~"hospital|clinic|health"](-2.5,29.5,-1.9,30.1););out center;"""
url = "https://overpass-api.de/api/interpreter"
data = urllib.parse.urlencode({"data": query}).encode("utf-8")
req = urllib.request.Request(url, data=data)
req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36')
try:
    with urllib.request.urlopen(req) as response:
        html = response.read()
        res = json.loads(html.decode('utf-8'))
        print("Found with urllib:", len(res.get("elements", [])))
except Exception as e:
    print("Error urllib:", e)
