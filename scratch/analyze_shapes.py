import geopandas as gpd
import os
import sys

dataset_dir = r"C:\Users\user\Documents\blacportal\sectrstu"
shapefiles = [f for f in os.listdir(dataset_dir) if f.endswith('.shp')]

for shp in shapefiles:
    file_path = os.path.join(dataset_dir, shp)
    print(f"\n{'='*50}")
    print(f"ANALYZING: {shp}")
    print(f"{'='*50}")
    
    try:
        gdf = gpd.read_file(file_path)
        print(f"Geometry type(s): {gdf.geom_type.unique()}")
        print(f"CRS: {gdf.crs}")
        print(f"Number of rows: {len(gdf)}")
        print(f"Number of columns: {len(gdf.columns)}")
        print("\nColumns and Data Types:")
        print(gdf.dtypes)
        print("\nFirst 3 rows:")
        print(gdf.head(3).drop(columns='geometry', errors='ignore'))
        
        # Identify numeric columns to get summary stats
        numeric_cols = gdf.select_dtypes(include=['number']).columns
        if len(numeric_cols) > 0:
            print("\nSummary statistics for numeric columns:")
            print(gdf[numeric_cols].describe())
            
        print("\nMissing values:")
        print(gdf.isnull().sum())
    except Exception as e:
        print(f"Error reading {shp}: {e}")
