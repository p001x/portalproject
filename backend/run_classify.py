import time
import ee

from gee.auth import initialize_gee
initialize_gee()

aoi = ee.FeatureCollection("projects/ee-petersonyang87/assets/rwanda").filter(ee.Filter.eq("ADM2_EN", "Musanze")).geometry()
dynamic_scale = 1000
n_classes = 5

s5p_no2 = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2").filterDate("2023-01-01", "2023-12-31").filterBounds(aoi).select("tropospheric_NO2_column_number_density").map(lambda img: img.multiply(1e6).rename("NO2_umol_m2"))
comp_no2 = s5p_no2.mean()

from gee.classify_utils import quantile_classify

print("Testing f_classify sequentially...")
t0 = time.time()
try:
    classify = quantile_classify(
        layers=[
            {"name": "NO2_umol_m2", "image": comp_no2, "title": "NO₂ Column (µmol/m²)"},
        ],
        aoi=aoi, scale=dynamic_scale, n_classes=n_classes,
    )
    print(f"Classify done in {time.time()-t0:.2f}s")
except Exception as e:
    import traceback
    traceback.print_exc()
