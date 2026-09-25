import geopandas as gpd
gdf = gpd.read_file(r"c:\Users\user\Documents\blacportal\sectrstu\villages.shp")
print("NAME_1 values:", gdf["NAME_1"].unique()[:10])
print("NAME_2 values:", gdf["NAME_2"].unique()[:10])
