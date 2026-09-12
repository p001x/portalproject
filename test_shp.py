import geopandas as gpd
gdf = gpd.read_file(r'C:\Users\user\Documents\blacportal\dataset vector\Schools_primary.shp', rows=5)
for col in gdf.columns:
    print(col, list(gdf[col].values))
