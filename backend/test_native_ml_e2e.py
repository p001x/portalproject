import requests
import json
import sys
import rasterio

BASE_URL = "http://127.0.0.1:8000"

print("--- AUTOMATED END-TO-END VERIFICATION ---")

# 1. Check if backend is alive
try:
    r = requests.get(f"{BASE_URL}/api/datasets?source=admin", timeout=5)
    print(f"[1] Backend Status: {r.status_code} OK")
except Exception as e:
    print(f"[ERR] Backend is NOT running on port 8000! Exception: {e}")
    # Try port 8001
    BASE_URL = "http://127.0.0.1:8001"
    try:
        r = requests.get(f"{BASE_URL}/api/datasets?source=admin", timeout=5)
        print(f"[1] Backend Status on 8001: {r.status_code} OK")
    except Exception as e2:
        print(f"[CRITICAL ERROR] Backend server is not running at 8000 or 8001. Please start it with uvicorn main:app")
        sys.exit(1)

# 2. Test URL
test_cog_url = "https://raw.githubusercontent.com/mapbox/rasterio/master/tests/data/RGB.byte.tif"

# 3. Test Bounds Endpoint
print(f"[2] Testing Native Imagery Bounds for COG...")
try:
    r = requests.get(f"{BASE_URL}/api/native/imagery/bounds", params={"url": test_cog_url})
    if r.status_code == 200:
        bounds = r.json().get("bbox")
        print(f"    SUCCESS! Extracted Bounding Box: {bounds}")
    else:
        print(f"    FAILED bounds check: {r.status_code} - {r.text}")
except Exception as e:
        print(f"    ERROR bounds check: {e}")

# 4. Test Tile Rendering Endpoint
print(f"[3] Testing Native Imagery Tile Server...")
try:
    # Get bounds
    r_b = requests.get(f"{BASE_URL}/api/native/imagery/bounds", params={"url": test_cog_url})
    bbox = r_b.json().get("bbox")
    print(f"    COG Bounds: {bbox}")
    
    # Calculate tile Z/X/Y using mercantile
    import mercantile
    # Transform bbox left/bottom to lat/lon for tile calculation
    from rasterio.warp import transform_bounds
    with rasterio.open(test_cog_url) as s:
        wgs_bounds = transform_bounds(s.crs, "EPSG:4326", *s.bounds)
    print(f"    WGS84 Bounds: {wgs_bounds}")
    
    tile = mercantile.tile((wgs_bounds[0] + wgs_bounds[2])/2, (wgs_bounds[1] + wgs_bounds[3])/2, 10)
    print(f"    Testing Tile Z/X/Y: {tile.z}/{tile.x}/{tile.y}")
    
    r = requests.get(f"{BASE_URL}/api/native/imagery/tiles/{tile.z}/{tile.x}/{tile.y}", params={"url": test_cog_url})
    if r.status_code == 200 and len(r.content) > 100:
        print(f"    SUCCESS! Received valid PNG tile of size {len(r.content)} bytes.")
    else:
        print(f"    FAILED tile render: {r.status_code} - {r.text}")
except Exception as e:
    print(f"    ERROR tile render: {e}")

# 5. Test Native Supervised Classification Endpoint
print(f"[4] Testing Supervised Random Forest Training & Tile Generation...")
mid_lng = -77.9
mid_lat = 24.5

test_samples = [
    {
        "class_label": "Water",
        "color": "#0000FF",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[-77.9, 24.5], [-77.85, 24.5], [-77.85, 24.55], [-77.9, 24.55], [-77.9, 24.5]]]
        }
    },
    {
        "class_label": "Forest",
        "color": "#00FF00",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[-77.8, 24.5], [-77.75, 24.5], [-77.75, 24.55], [-77.8, 24.55], [-77.8, 24.5]]]
        }
    }
]

payload = {
    "data_source": "native_cog",
    "custom_asset_id": test_cog_url,
    "samples": test_samples
}

try:
    r = requests.post(f"{BASE_URL}/api/classify/supervised", json=payload)
    if r.status_code == 200:
        result = r.json()
        tile_url = result.get("tile_url")
        print(f"    SUCCESS! Trained Random Forest Model!")
        print(f"    Generated Classified Tile URL: {tile_url}")
        
        # Test fetching one classified tile
        if tile_url:
            full_tile_url = f"{BASE_URL}{tile_url.format(z=tile.z, x=tile.x, y=tile.y)}"
            print(f"[5] Fetching Classified Output Tile from: {full_tile_url}")
            r_tile = requests.get(full_tile_url)
            if r_tile.status_code == 200 and len(r_tile.content) > 100:
                print(f"    SUCCESS! Classified PNG Tile received! ({len(r_tile.content)} bytes)")
            else:
                print(f"    FAILED fetching classified tile: {r_tile.status_code} - {r_tile.text}")
    else:
        print(f"    FAILED classification: {r.status_code} - {r.text}")
except Exception as e:
    print(f"    ERROR classification: {e}")

print("--- END-TO-END VERIFICATION COMPLETE ---")
