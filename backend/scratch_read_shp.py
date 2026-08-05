import geopandas as gpd
import os
import sys

def read_shapefile_info(filepath):
    print(f"--- Info for {filepath} ---")
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return
    
    try:
        gdf = gpd.read_file(filepath)
        print(f"CRS: {gdf.crs}")
        print(f"Total features: {len(gdf)}")
        print(f"Geometry type: {gdf.geom_type.unique()}")
        print(f"Bounds: {gdf.total_bounds}")
        print("\nColumns:")
        print(gdf.dtypes)
        print("\nFirst 3 rows:")
        print(gdf.head(3))
        print("-" * 40 + "\n")
    except Exception as e:
        print(f"Error reading file: {e}")

if __name__ == "__main__":
    dir_path = r"C:\Users\user\Documents\blacportal\sectrstu"
    read_shapefile_info(os.path.join(dir_path, "cells.shp"))
    read_shapefile_info(os.path.join(dir_path, "sector.shp"))
