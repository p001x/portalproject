import geopandas as gpd
import sys

shp = gpd.read_file(r"C:\Users\user\Documents\blacportal\dataset vector\Schools_primary.shp")
print("CRS:", shp.crs)
print("Columns:", shp.columns)
print("Size:", len(shp))
