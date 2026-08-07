import geopandas as gpd
import os

base_dir = os.path.dirname(os.path.abspath(__file__))
shp_path = os.path.join(base_dir, "sectrstu", "sector.shp")
gdf = gpd.read_file(shp_path)
print("Columns:", gdf.columns)
print("Provinces:", gdf["REGION"].unique())
print("Example District:", gdf["DISTR"].iloc[0])
print("Example Sector:", gdf["NOMSECT"].iloc[0])
