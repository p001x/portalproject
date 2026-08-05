import geopandas as gpd
import json
import os

dir_path = r"C:\Users\user\Documents\blacportal\sectrstu"
shp_path = os.path.join(dir_path, "sector.shp")

# Read the shapefile
gdf = gpd.read_file(shp_path)

# Ensure CRS is EPSG:4326 for Earth Engine (currently it's EPSG:21036 Arc_1960_Transverse_Mercator based on my check)
# Let's dynamically project it
gdf = gdf.to_crs("EPSG:4326")

# Compute the unary union (the single outer boundary)
boundary = gdf.geometry.unary_union

# Save to GeoJSON
# Geopandas needs a GeoDataFrame to export to geojson
boundary_gdf = gpd.GeoDataFrame(geometry=[boundary], crs="EPSG:4326")
boundary_gdf.to_file(os.path.join(dir_path, "study_area_boundary.geojson"), driver="GeoJSON")

print("Created study_area_boundary.geojson successfully!")
