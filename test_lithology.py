import sys
sys.path.append(r"c:\Users\user\Documents\blacportal\backend")
import ee
ee.Initialize(project='test-project')

try:
    img = ee.Image("CSP/ERGo/1_0/Global/ALOS_lithology")
    print("Found:", img.getInfo()['id'])
except Exception as e:
    print("ALOS_lithology failed:", e)

try:
    img = ee.Image("CSP/ERGo/1_0/Global/SRTM_lithology")
    print("Found:", img.getInfo()['id'])
except Exception as e:
    print("SRTM_lithology failed:", e)
    
try:
    img = ee.Image("OpenLandMap/PNV/PNV_BIOME-TYPE_BIOME00K_C/v01")
    print("Found:", img.getInfo()['id'])
except Exception as e:
    print("OpenLandMap PNV failed:", e)
