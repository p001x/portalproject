import geopandas as gpd
try:
    gdf = gpd.read_file(r"C:\Users\user\Documents\blacportal\dataset vector\Schools_primary.shp", bbox=(-1.6, 29.4, -1.3, 29.7))
    print("Success")
except Exception as e:
    import traceback
    traceback.print_exc()
    print("Error:", type(e), e)
