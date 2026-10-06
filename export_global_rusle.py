import sys
import ee
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))
from gee.auth import initialize_gee
# 1. Import your exact, perfectly working RUSLE logic
from gee.rusle import _build_rusle_images

def run_global_export():
    """
    Exports the RUSLE calculation for the entire world to a Google Earth Engine Asset.
    This runs in the background and will not hit any concurrency limits.
    """
    print("Initializing Google Earth Engine...")
    try:
        initialize_gee()
    except Exception as e:
        print(f"Failed to initialize Earth Engine: {e}")
        return

    # 2. Define the configuration for the WHOLE WORLD
    # Your aoi_utils.py already supports 'type': 'world'!
    aoi_config = {"type": "world"}
    
    # Define the years for the analysis (e.g., last year)
    start_year = 2023
    end_year = 2023

    print(f"Building RUSLE logic for the whole world for {start_year}-{end_year}...")
    
    # 3. Call your exact logic. We use _build_rusle_images directly to get the raw ee.Image
    res = _build_rusle_images(
        aoi_config=aoi_config,
        start_year=start_year,
        end_year=end_year
    )
    
    # Get the final Annual Soil Loss (A) image and the global geometry
    rusle_image = res["factor_images"]["A"]
    global_geometry = res["aoi"]

    # --- CRITICAL EXPORT SETTINGS FOR GLOBAL SCALE ---
    # We must use a scale of at least 1000 (1km) or 5000 (5km) for the whole world. 
    # If you try 30 meters for the whole world, even Google's supercomputers will reject it 
    # for exceeding maxPixels (there are too many 30m pixels on Earth!)
    export_scale = 2000 
    
    # IMPORTANT: Change this to YOUR Earth Engine project ID!
    # Example: 'projects/my-earth-engine-project/assets/global_rusle_2023'
    my_project_asset_id = 'projects/ee-petersonyang87/assets/global_rusle_2023'
    
    print(f"Submitting background export task to: {my_project_asset_id}")
    print(f"Using a safe global resolution of {export_scale} meters per pixel.")

    # 4. Create the background task
    export_task = ee.batch.Export.image.toAsset(
        image=rusle_image,
        description='Global_RUSLE_Background_Export',
        assetId=my_project_asset_id,
        scale=export_scale,
        region=global_geometry,
        maxPixels=1e13 # Extremely high pixel limit to allow global scale
    )

    # 5. Start the task!
    export_task.start()
    
    print("\n✅ Success! The global task has been sent to Google Earth Engine.")
    print("It is now running safely in the background.")
    print("You can check its progress by going to: https://code.earthengine.google.com/tasks")
    print("Don't forget to edit this script to replace 'PLACEHOLDER_PROJECT_ID' with your real project name!")

if __name__ == "__main__":
    run_global_export()
