import sys
import os
import requests
import zipfile
import io

# Add the backend directory to Python's path so we can import your GEE modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from gee.auth import initialize_gee
from gee.rusle import _build_rusle_images
from storage.dataset_storage import push_to_storage
import ee

def precompute_rwanda_rusle():
    print("[+] Initializing Google Earth Engine...")
    initialize_gee()
    
    print("[+] Defining Rwanda study area...")
    # This config tells your RUSLE script to use the exact Rwanda equations (Roose 1977, terracing)
    aoi_config = {
        "type": "rwanda"
    }
    
    print("[1/3] Asking Google Earth Engine to calculate RUSLE for Rwanda for 2024...")
    # We call your exact core RUSLE math function!
    res = _build_rusle_images(
        aoi_config=aoi_config,
        start_year=2024,
        end_year=2024
    )
    
    # Get the "A" (Annual Soil Loss) factor image and the geometry
    A_image = res["factor_images"]["A"]
    rwanda_geom = res["aoi"]
    
    print("[2/3] Math finished! Asking Google to package the Master Map...")
    try:
        # Ask Google for a direct download URL. We start at a safe 100m resolution 
        # to ensure it fits perfectly inside the direct download limits.
        url = A_image.getDownloadURL({
            "region": rwanda_geom.bounds(),
            "scale": 250, 
            "format": "GEO_TIFF",
            "crs": "EPSG:4326"
        })
    except Exception as e:
        print(f"Error getting URL: {e}")
        return
        
    print(f"Downloading from Google Servers: {url}")
    response = requests.get(url, stream=True)
    try:
        response.raise_for_status()
    except requests.exceptions.HTTPError as e:
        print(f"Error: {e}")
        print(f"Response body: {response.text}")
        return
    
    file_bytes = response.content
    
    # Earth Engine often packages the .tif inside a .zip file. 
    # We will automatically unzip it in memory!
    if file_bytes[:4] == b'PK\x03\x04':
        print("Extracting Map from Google's ZIP file...")
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            tif_name = [n for n in z.namelist() if n.endswith('.tif') or n.endswith('.tiff')][0]
            file_bytes = z.read(tif_name)
            
    print(f"Downloaded {len(file_bytes) / (1024*1024):.2f} MB map to server memory.")
    
    print("[3/3] Uploading Master Map to Hugging Face...")
    hf_key = "rusle/rwanda_2024.tif"
    
    def progress(read_bytes, total):
        print(f"Uploading... {read_bytes / (1024*1024):.1f} MB / {total / (1024*1024):.1f} MB", end="\r")
        
    final_url = push_to_storage(hf_key, file_bytes, name="RUSLE Rwanda 2024", progress_callback=progress)
    
    print(f"\nSUCCESS: Your master map is now live at: {final_url}")

if __name__ == "__main__":
    precompute_rwanda_rusle()
