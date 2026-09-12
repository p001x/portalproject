import time
import ee

from gee.auth import initialize_gee
initialize_gee()

aoi = ee.FeatureCollection("projects/ee-petersonyang87/assets/rwanda").filter(ee.Filter.eq("ADM2_EN", "Musanze")).geometry()
dynamic_scale = 1000

s5p_no2 = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2").filterDate("2023-01-01", "2023-12-31").filterBounds(aoi).select("tropospheric_NO2_column_number_density").map(lambda img: img.multiply(1e6).rename("NO2_umol_m2"))

def _month_range(start, end):
    from datetime import date
    start = date.fromisoformat(start)
    end = date.fromisoformat(end)
    months = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        months.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months

months = _month_range("2023-01-01", "2023-12-31")

def _get_monthly_mean(col, start_m, end_m, band_name, orig_band):
    month_col = col.filterDate(start_m, end_m)
    dummy = ee.Image.constant(0).rename(orig_band).updateMask(0)
    return ee.ImageCollection.fromImages([dummy, month_col.mean()]).mean().rename(band_name)

month_images = []
for i, (y, m) in enumerate(months):
    start_m = ee.Date.fromYMD(y, m, 1)
    end_m = start_m.advance(1, "month")
    
    img_no2 = _get_monthly_mean(s5p_no2, start_m, end_m, f"NO2_m{i}", "NO2_umol_m2")
    # Just NO2 to see if it works. Air pollution does all 4. Let's do 4 bands:
    img = ee.Image.cat([
        img_no2
    ])
    month_images.append(img)

monthly_img = ee.Image.cat(month_images)

print("Testing f_monthly sequentially...")
t0 = time.time()
try:
    monthly_dict = monthly_img.reduceRegion(
        reducer=ee.Reducer.mean(), geometry=aoi, scale=dynamic_scale, maxPixels=1e10, tileScale=4,
    ).getInfo()
    print(f"Monthly done in {time.time()-t0:.2f}s: {list(monthly_dict.keys())}")
except Exception as e:
    print(f"Error in monthly: {e}")
