import os
from osgeo import ogr

gdb_path = r'C:\Users\user\Documents\blacportal\dataset vector\CROM_Vector.gdb'
ds = ogr.Open(gdb_path)
layer = ds.GetLayerByName("Health_facilities")
if layer:
    layer_defn = layer.GetLayerDefn()
    col_names = [layer_defn.GetFieldDefn(j).GetName() for j in range(layer_defn.GetFieldCount())]
    print("Columns:", col_names)
    
    # print first 3 features
    for i in range(min(3, layer.GetFeatureCount())):
        feat = layer.GetNextFeature()
        print(f"Feature {i}:", feat.items())
else:
    print("Layer not found")
