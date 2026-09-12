import geopandas as gpd
import glob

for shp in glob.glob("../dataset vector/*.shp"):
    try:
        gdf = gpd.read_file(shp, rows=1)
        print(f"\n{shp}:")
        print(list(gdf.columns))
    except Exception as e:
        print(f"Error reading {shp}: {e}")
