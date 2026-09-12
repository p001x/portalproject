import os
from osgeo import ogr

gdb_path = r'C:\Users\user\Documents\blacportal\dataset vector\CROM_Vector.gdb'
ds = ogr.Open(gdb_path)

if not ds:
    print(f"Could not open {gdb_path}")
    exit(1)

print(f"Opened {gdb_path}. Found {ds.GetLayerCount()} layers.")

hospital_keywords = ['hospital', 'clinic', 'health', 'dispensary', 'medical']

found_something = False

for i in range(ds.GetLayerCount()):
    layer = ds.GetLayerByIndex(i)
    layer_name = layer.GetName().lower()
    
    # Check if the layer name itself has any keyword
    if any(k in layer_name for k in hospital_keywords):
        print(f"MATCHING LAYER NAME: {layer.GetName()}")
        found_something = True
        
    # Check column names
    layer_defn = layer.GetLayerDefn()
    col_names = [layer_defn.GetFieldDefn(j).GetName().lower() for j in range(layer_defn.GetFieldCount())]
    
    if any(any(k in c for k in hospital_keywords) for c in col_names):
        print(f"MATCHING COLUMNS IN LAYER {layer.GetName()}: {col_names}")
        found_something = True

if not found_something:
    print("NO HOSPITALS OR HEALTH FACILITIES FOUND IN ANY LAYER OR COLUMN.")
