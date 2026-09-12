import time
import ee

from gee.auth import initialize_gee
initialize_gee()

aoi = ee.FeatureCollection("projects/ee-petersonyang87/assets/rwanda").filter(ee.Filter.eq("ADM2_EN", "Musanze")).geometry()
dynamic_scale = 1000

s5p_no2 = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2").filterDate("2023-01-01", "2023-12-31").filterBounds(aoi).select("tropospheric_NO2_column_number_density").map(lambda img: img.multiply(1e6).rename("NO2_umol_m2"))
s5p_co = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_CO").filterDate("2023-01-01", "2023-12-31").filterBounds(aoi).select("CO_column_number_density").map(lambda img: img.rename("CO_mol_m2"))
s5p_so2 = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_SO2").filterDate("2023-01-01", "2023-12-31").filterBounds(aoi).select("SO2_column_number_density").map(lambda img: img.multiply(1e6).rename("SO2_umol_m2"))
s5p_aer = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_AER_AI").filterDate("2023-01-01", "2023-12-31").filterBounds(aoi).select("absorbing_aerosol_index").map(lambda img: img.rename("AER_AI"))

comp_no2 = s5p_no2.mean()
comp_co  = s5p_co.mean()
comp_so2 = s5p_so2.mean()
comp_aer = s5p_aer.mean()

composite = ee.Image.cat([comp_no2, comp_co, comp_so2, comp_aer])

print("Testing f_stats sequentially...")
t0 = time.time()
try:
    stats = composite.reduceRegion(
        reducer=ee.Reducer.mean()
        .combine(ee.Reducer.max(), sharedInputs=True)
        .combine(ee.Reducer.percentile([90]), sharedInputs=True),
        geometry=aoi, scale=dynamic_scale, maxPixels=1e10, tileScale=4,
    ).getInfo()
    print(f"Stats done in {time.time()-t0:.2f}s: {stats}")
except Exception as e:
    print(f"Error in stats: {e}")
