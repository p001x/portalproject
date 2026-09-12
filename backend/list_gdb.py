import geopandas as gpd
import fiona
try:
    layers = fiona.listlayers('../dataset vector/CROM_Vector.gdb')
    print("GDB Layers:", layers)
except Exception as e:
    print("Error:", e)
