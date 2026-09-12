import ee
ee.Initialize(project="test-project")
col = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_CO").filterDate("2025-01-01", "2025-01-02").select(["CO_column_number_density"])
dummy = ee.Image.constant(0).rename(["CO_column_number_density"]).updateMask(0)
mean_img = col.mean()

try:
    combined = ee.ImageCollection.fromImages([dummy, mean_img]).mean().getInfo()
    print("Combined OK")
except Exception as e:
    print("Error:", e)

dummy2 = ee.Image.constant(0).toFloat().rename(["CO_column_number_density"]).updateMask(0)
try:
    combined2 = ee.ImageCollection.fromImages([dummy2, mean_img.toFloat()]).mean().getInfo()
    print("Combined2 OK")
except Exception as e:
    print("Error2:", e)
