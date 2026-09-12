import os

utils_file = r'c:\Users\user\Documents\blacportal\backend\gee\aoi_utils.py'
with open(utils_file, 'r', encoding='utf-8') as f:
    content = f.read()

helper = '''
def get_historical_ndvi(aoi, year: int, start_date: str = None, end_date: str = None, cloud_limit=30):
    import ee
    
    if not start_date: start_date = f"{year}-01-01"
    if not end_date: end_date = f"{year}-12-31"
    
    if year >= 2016:
        col = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", cloud_limit))
            .map(lambda img: img.normalizedDifference(["B8", "B4"]).rename("NDVI"))
        )
    elif year >= 2014:
        col = (
            ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", cloud_limit))
            .map(lambda img: img.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI"))
        )
    else:
        col = (
            ee.ImageCollection("LANDSAT/LE07/C02/T1_L2")
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", cloud_limit))
            .map(lambda img: img.normalizedDifference(["SR_B4", "SR_B3"]).rename("NDVI"))
        )
    return col.median().rename("NDVI").clip(aoi)
'''

if 'def get_historical_ndvi' not in content:
    with open(utils_file, 'w', encoding='utf-8') as f:
        f.write(content + '\n' + helper)
    print('Added get_historical_ndvi to aoi_utils.py')
