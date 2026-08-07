import geopandas as gpd
import os

shp_path = r"C:\Users\user\Documents\blacportal\dataset vector\Schools_primary.shp"
try:
    gdf = gpd.read_file(shp_path)
    if gdf.crs and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)
    
    minx, miny, maxx, maxy = 30.07, -1.54, 30.74, -1.04
    filtered = gdf.cx[minx:maxx, miny:maxy]
    
    print("Total schools:", len(gdf))
    print("Filtered schools:", len(filtered))
    print("Total bounds WGS84:", gdf.total_bounds)
    print("Filtered bounds:", filtered.total_bounds if not filtered.empty else "Empty")
    
except Exception as e:
    import traceback
    traceback.print_exc()
