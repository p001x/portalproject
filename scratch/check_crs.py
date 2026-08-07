import geopandas as gpd
import os

dataset_dir = r"C:\Users\user\Documents\blacportal\dataset vector"
shp_path = os.path.join(dataset_dir, "Schools_primary.shp")
if not os.path.exists(shp_path):
    print("NOT FOUND:", shp_path)
    # Let's list files
    print("Files:", [f for f in os.listdir(dataset_dir) if 'school' in f.lower() or 'market' in f.lower()])
else:
    gdf = gpd.read_file(shp_path)
    print("CRS:", gdf.crs)
    print("Bounds:", gdf.total_bounds)
    print("Count:", len(gdf))
