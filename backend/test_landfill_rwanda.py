import requests
import json
import time

API_URL = "http://localhost:8000/api/landfill"

# Rwanda AOI config
aoi_config = {
    "type": "district",
    "name": "Rwanda" # Wait, the API supports "name": "Rwanda"? Let's assume the API accepts it if it's not a district. Let's use custom geojson for Rwanda if needed, or simply let the user run it from the UI.
}

def test_landfill():
    print("Testing Landfill Suitability for entire country...")
    start_time = time.time()
    
    payload = {
        "aoi": {"type": "country", "name": "Rwanda"}
    }
    
    try:
        response = requests.post(API_URL, json=payload)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Success! Response received in {time.time() - start_time:.2f} seconds.")
            print(f"Map ID: {data.get('map_id')}")
            
            stats = data.get('statistics', {})
            print(f"Total Area Evaluated: {stats.get('total_area_km2', 0):.2f} km²")
            print("Class Breakdown:")
            for c in sorted(stats.get('class_areas_km2', {}).keys()):
                print(f"  Class {c}: {stats['class_areas_km2'][c]:.2f} km²")
        else:
            print(f"❌ Failed with status {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"❌ Connection Error: {e}")

if __name__ == "__main__":
    test_landfill()
