import sys
import os
import ee
import time

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from gee.auth import initialize_gee
from gee.rusle import _build_rusle_images

def submit_global_rusle_tasks(start_year=1980, end_year=2024):
    """
    Submits Google Earth Engine tasks to export global RUSLE maps
    for each year to Google Drive (or Cloud Storage).
    """
    print("[+] Initializing Google Earth Engine...")
    initialize_gee()
    
    print("[+] Defining Global study area...")
    # Global Bounding Box (excluding extreme poles to avoid projection issues)
    world_geom = ee.Geometry.BBox(-180, -60, 180, 85)
    
    aoi_config = {
        "type": "custom",
        "name": "Global"
    }

    print(f"[+] Starting batch export tasks from {start_year} to {end_year}...")
    
    for year in range(start_year, end_year + 1):
        print(f"\n--- Preparing Year {year} ---")
        try:
            res = _build_rusle_images(
                aoi_config=aoi_config,
                start_year=year,
                end_year=year
            )
            
            A_image = res["factor_images"]["A"]
            
            # Export to Google Drive
            task_name = f"Global_RUSLE_Soil_Loss_{year}"
            
            # For global exports at 250m, the image is very large.
            # maxPixels needs to be extremely high.
            task = ee.batch.Export.image.toDrive(
                image=A_image,
                description=task_name,
                folder="BLAC_Portal_Global_RUSLE",
                fileNamePrefix=f"rusle_global_{year}",
                region=world_geom,
                scale=1000, # Start at 1km for global scale to save space (or use 250m for higher res)
                crs="EPSG:4326",
                maxPixels=1e13
            )
            
            task.start()
            print(f"[*] Successfully submitted GEE Export Task: {task_name}")
            
            # Sleep briefly to avoid overwhelming the Earth Engine task queue API
            time.sleep(2)
            
        except Exception as e:
            print(f"[!] Failed to submit task for {year}: {e}")

    print("\n[+] All tasks submitted!")
    print("You can monitor the progress at: https://code.earthengine.google.com/tasks")
    print("Once they finish, you can upload them to your Hugging Face dataset (rusle_global_YYYY.tif)!")

if __name__ == "__main__":
    submit_global_rusle_tasks(1980, 2024)
