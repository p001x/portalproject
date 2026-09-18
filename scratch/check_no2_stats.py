import ee
import json
import sys
from gee.auth import init_ee
from gee.aoi_utils import get_aoi_geometry

def main():
    init_ee()
    aoi_config = {"type": "rwanda", "country": "Rwanda", "name": "Rwanda"}
    aoi = get_aoi_geometry(aoi_config)
    
    # NO2 (µmol/m2)
    s5p_no2 = (
        ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2")
        .filterDate("2023-01-01", "2023-12-31")
        .filterBounds(aoi)
        .select("tropospheric_NO2_column_number_density")
        .map(lambda img: img.multiply(1e6).rename("NO2_umol_m2"))
    )
    
    comp_no2 = s5p_no2.median().clip(aoi)
    
    # Calculate min and max
    stats = comp_no2.reduceRegion(
        reducer=ee.Reducer.minMax(),
        geometry=aoi,
        scale=2000,
        maxPixels=1e9
    ).getInfo()
    
    print("NO2 Stats:")
    print(json.dumps(stats, indent=2))

if __name__ == "__main__":
    main()
