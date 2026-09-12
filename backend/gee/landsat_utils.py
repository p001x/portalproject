import ee

def mask_l8_clouds(image):
    qa = image.select('QA_PIXEL')
    # Bits 1, 2, 3 and 4 are dilated cloud, cirrus, cloud, and cloud shadow respectively.
    cloud_shadow_bit_mask = (1 << 4)
    clouds_bit_mask = (1 << 3)
    cirrus_bit_mask = (1 << 2)
    dilated_cloud_bit_mask = (1 << 1)

    mask = qa.bitwiseAnd(cloud_shadow_bit_mask).eq(0) \
        .And(qa.bitwiseAnd(clouds_bit_mask).eq(0)) \
        .And(qa.bitwiseAnd(cirrus_bit_mask).eq(0)) \
        .And(qa.bitwiseAnd(dilated_cloud_bit_mask).eq(0))

    return image.updateMask(mask)

def mask_l457_clouds(image):
    qa = image.select('QA_PIXEL')
    # Bits 1, 2, 3 and 4 are dilated cloud, cirrus, cloud, and cloud shadow respectively. 
    cloud_shadow_bit_mask = (1 << 4)
    clouds_bit_mask = (1 << 3)
    dilated_cloud_bit_mask = (1 << 1)

    mask = qa.bitwiseAnd(cloud_shadow_bit_mask).eq(0) \
        .And(qa.bitwiseAnd(clouds_bit_mask).eq(0)) \
        .And(qa.bitwiseAnd(dilated_cloud_bit_mask).eq(0))

    return image.updateMask(mask)


def get_harmonized_landsat_collection(start_date: str, end_date: str, aoi: ee.Geometry, max_cloud_cover: int = 20) -> ee.ImageCollection:
    """
    Returns a harmonized ImageCollection combining Landsat 4, 5, 7, 8, and 9.
    Bands from Landsat 4/5/7 are renamed to match Landsat 8/9 names (e.g. SR_B4, SR_B5, ST_B10).
    It also applies a strict QA_PIXEL-based cloud mask to ensure cloud-free pixels.
    """
    
    # Landsat 8 and 9 (already have SR_B4, SR_B5, ST_B10, etc.)
    l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') \
        .filterDate(start_date, end_date).filterBounds(aoi) \
        .filter(ee.Filter.lt("CLOUD_COVER", max_cloud_cover)) \
        .map(mask_l8_clouds)
        
    l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2') \
        .filterDate(start_date, end_date).filterBounds(aoi) \
        .filter(ee.Filter.lt("CLOUD_COVER", max_cloud_cover)) \
        .map(mask_l8_clouds)

    l89 = l8.merge(l9)

    # Landsat 4, 5, 7 need band renaming to match L8/9
    def rename_l457(image):
        return image.select(
            ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7', 'ST_B6', 'QA_PIXEL'],
            ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7', 'ST_B10', 'QA_PIXEL']
        ).copyProperties(image, ['system:time_start'])

    l7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2') \
        .filterDate(start_date, end_date).filterBounds(aoi) \
        .filter(ee.Filter.lt("CLOUD_COVER", max_cloud_cover)) \
        .map(mask_l457_clouds).map(rename_l457)
        
    l5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2') \
        .filterDate(start_date, end_date).filterBounds(aoi) \
        .filter(ee.Filter.lt("CLOUD_COVER", max_cloud_cover)) \
        .map(mask_l457_clouds).map(rename_l457)
        
    l4 = ee.ImageCollection('LANDSAT/LT04/C02/T1_L2') \
        .filterDate(start_date, end_date).filterBounds(aoi) \
        .filter(ee.Filter.lt("CLOUD_COVER", max_cloud_cover)) \
        .map(mask_l457_clouds).map(rename_l457)

    return l89.merge(l7).merge(l5).merge(l4)

def gap_fill(image: ee.Image) -> ee.Image:
    """
    Fills gaps (e.g. Landsat 7 SLC-off stripes) in the image using focal mean.
    Radius is set in METERS to prevent massive blurring when zoomed out.
    A radius of 250 meters easily covers the maximum 14-pixel (420m) gap.
    """
    # 1. Fill the gaps using a large radius
    filled = image.focalMean(radius=250, kernelType='square', units='meters')
    unmasked = image.unmask(filled)
    
    # 2. Apply a global smoothing to unify the texture. 
    # Adjusted to 110 meters per user request to balance smoothness and detail.
    return unmasked.focalMean(radius=110, kernelType='circle', units='meters')
