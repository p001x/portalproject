import os
import sys
import ee
import requests
import time
from tempfile import NamedTemporaryFile

sys.path.append(os.path.abspath('backend'))
from gee.auth import initialize_gee
from gee.rusle import _build_rusle_images

try:
    from huggingface_hub import HfApi
except ImportError:
    print("Please install huggingface_hub: pip install huggingface_hub")
    sys.exit(1)

def run_direct_gee_to_hf_pipeline(start_year=1980, end_year=2024):
    """
    Directly downloads RUSLE data from Google Earth Engine and uploads it
    to a Hugging Face dataset, completely bypassing Google Drive.
    """
    print("[+] Initializing Google Earth Engine...")
    try:
        initialize_gee()
    except Exception as e:
        print(f"Failed to initialize Earth Engine: {e}")
        print("\nPlease run: earthengine authenticate")
        return
        
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        print("[!] HF_TOKEN environment variable is not set. Please set it before running.")
        return
        
    repo_id = os.environ.get("HF_REPO_ID", "pi0texy/blacportal-datasets")
    api = HfApi(token=hf_token)
    
    # Global Bounding Box
    world_geom = ee.Geometry.BBox(-180, -60, 180, 85)
    aoi_config = {"type": "world"}
    
    # We use a 10km scale (10000 meters) so the image fits in GEE's direct download memory limits (~30MB)
    scale_m = 10000 
    
    print(f"[+] Starting Direct GEE -> Hugging Face pipeline ({start_year} to {end_year})")
    print(f"[+] Target HF Dataset: {repo_id}")
    
    for year in range(start_year, end_year + 1):
        print(f"\n--- Processing Year {year} ---")
        try:
            res = _build_rusle_images(
                aoi_config=aoi_config,
                start_year=year,
                end_year=year
            )
            A_image = res["factor_images"]["A"]
            
            print(f"[*] Requesting download URL from GEE for year {year}...")
            url = A_image.getDownloadURL(dict(
                region=world_geom,
                scale=scale_m,
                format='GEO_TIFF',
                crs='EPSG:4326'
            ))
            
            print("[*] Downloading from GEE...")
            resp = requests.get(url, stream=True)
            resp.raise_for_status()
            
            filename = f"rusle_global_{year}.tif"
            
            with NamedTemporaryFile(delete=False, suffix=".tif") as tmp:
                for chunk in resp.iter_content(chunk_size=1024*1024):
                    if chunk:
                        tmp.write(chunk)
                tmp_path = tmp.name
                
            file_size_mb = os.path.getsize(tmp_path) / (1024 * 1024)
            print(f"[*] Downloaded {file_size_mb:.2f} MB. Uploading to Hugging Face...")
            
            api.upload_file(
                path_or_fileobj=tmp_path,
                path_in_repo=filename,
                repo_id=repo_id,
                repo_type="dataset",
                commit_message=f"Upload Global RUSLE for {year}"
            )
            
            os.remove(tmp_path)
            print(f"[+] Successfully pushed {filename} to Hugging Face!")
            
            # Sleep briefly to avoid hitting rate limits
            time.sleep(2)
            
        except Exception as e:
            print(f"[!] Failed to process year {year}: {e}")

if __name__ == "__main__":
    run_direct_gee_to_hf_pipeline(1980, 2024)
