import ee
import time
from gee.auth import initialize_gee

initialize_gee()

aoi = ee.Geometry.Point([30.0, -1.9]).buffer(10000)

s5p_no2 = (
    ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2")
    .filterDate("2023-01-01", "2023-12-31")
    .filterBounds(aoi)
    .select("tropospheric_NO2_column_number_density")
    .map(lambda img: img.multiply(1e6).rename("NO2_umol_m2"))
)

print("Testing pre_info...")
pre_info = ee.Dictionary({
    "area_sqkm": aoi.area().divide(1e6),
    "collection_size": s5p_no2.size(),
    "bounds": aoi.bounds().coordinates().get(0)
}).getInfo()
print("pre_info:", pre_info)

print("Testing monthly mean trick...")
start_m = ee.Date.fromYMD(2023, 1, 1)
end_m = start_m.advance(1, "month")
month_col = s5p_no2.filterDate(start_m, end_m)

# test empty
empty_col = s5p_no2.filterDate("2010-01-01", "2010-02-01")

def _get_monthly_mean(col, start_m, end_m, band_name, orig_band):
    m_col = col.filterDate(start_m, end_m)
    dummy = ee.Image.constant(0).rename(orig_band).updateMask(0)
    return ee.ImageCollection.fromImages([dummy, m_col.mean()]).mean().rename(band_name)

img_normal = _get_monthly_mean(s5p_no2, start_m, end_m, "NO2_m0", "NO2_umol_m2")
img_empty = _get_monthly_mean(s5p_no2, ee.Date("2010-01-01"), ee.Date("2010-02-01"), "NO2_m0", "NO2_umol_m2")

print("Reducing normal...")
val1 = img_normal.reduceRegion(ee.Reducer.mean(), aoi, 1000).getInfo()
print("Normal:", val1)

print("Reducing empty...")
try:
    val2 = img_empty.reduceRegion(ee.Reducer.mean(), aoi, 1000).getInfo()
    print("Empty:", val2)
except Exception as e:
    print("Error on empty:", e)

print("Done.")
