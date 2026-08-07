import geopandas as gpd
import os

shp_path = r"C:\Users\user\Documents\blacportal\dataset vector\Schools_primary.shp"
if os.path.exists(shp_path):
    gdf = gpd.read_file(shp_path)
    print("Primary columns:", gdf.columns.tolist())

shp_path = r"C:\Users\user\Documents\blacportal\dataset vector\Markets.shp"
if os.path.exists(shp_path):
    gdf = gpd.read_file(shp_path)
    print("Markets columns:", gdf.columns.tolist())
