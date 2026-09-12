import ee
import sys
sys.path.append('c:\\Users\\user\\Documents\\blacportal\\backend')
from gee.auth import initialize_gee

def run_test():
    initialize_gee()
    
    aoi = ee.FeatureCollection("FAO/GAUL/2015/level2")\
        .filter(ee.Filter.eq('ADM2_NAME', 'Gasabo'))\
        .first().geometry()
    
    print("Testing rasterization method...")
    try:
        buildings = ee.FeatureCollection("GOOGLE/Research/open-buildings/v3/polygons").filterBounds(aoi)
        
        # Create a mask image where buildings = 1
        building_img = ee.Image().paint(buildings, 1).unmask(0).clip(aoi)
        
        # Calculate area in square meters for the building pixels
        area_img = building_img.multiply(ee.Image.pixelArea())
        
        # Reduce region
        res = area_img.reduceRegion(
            reducer=ee.Reducer.sum(),
            geometry=aoi,
            scale=10,
            maxPixels=1e13
        ).getInfo()
        
        print("Rasterization area:", res)
    except Exception as e:
        print("Rasterization failed:", e)

if __name__ == "__main__":
    run_test()
