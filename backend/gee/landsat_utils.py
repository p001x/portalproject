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
        .And(qa.bitwiseAnd(cirrus_bit_mask).eq(0))

    return image.updateMask(mask)

def mask_l457_clouds(image):
    qa = image.select('QA_PIXEL')
    # Bits 1, 2, 3 and 4 are dilated cloud, cirrus, cloud, and cloud shadow respectively. 
    cloud_shadow_bit_mask = (1 << 4)
    clouds_bit_mask = (1 << 3)
    dilated_cloud_bit_mask = (1 << 1)

    mask = qa.bitwiseAnd(cloud_shadow_bit_mask).eq(0) \
        .And(qa.bitwiseAnd(clouds_bit_mask).eq(0))

    return image.updateMask(mask)


def get_harmonized_landsat_collection(start_date: str, end_date: str, aoi: ee.Geometry, max_cloud_cover: int = 20) -> ee.ImageCollection:
    """
    Returns a harmonized ImageCollection combining Landsat 4, 5, 7, 8, and 9.
    Bands from Landsat 4/5/7 are renamed to match Landsat 8/9 names (e.g. SR_B4, SR_B5, ST_B10).
    It also applies a strict QA_PIXEL-based cloud mask to ensure cloud-free pixels.
    """
    
    # Landsat 8 and 9 (already have SR_B4, SR_B5, ST_B10, etc.)
    l8_t1 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').filterDate(start_date, end_date).filterBounds(aoi).map(mask_l8_clouds)
    l8_t2 = ee.ImageCollection('LANDSAT/LC08/C02/T2_L2').filterDate(start_date, end_date).filterBounds(aoi).map(mask_l8_clouds)
    l8 = l8_t1.merge(l8_t2)
        
    l9_t1 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2').filterDate(start_date, end_date).filterBounds(aoi).map(mask_l8_clouds)
    l9_t2 = ee.ImageCollection('LANDSAT/LC09/C02/T2_L2').filterDate(start_date, end_date).filterBounds(aoi).map(mask_l8_clouds)
    l9 = l9_t1.merge(l9_t2)

    l89 = l8.merge(l9)

    # Landsat 4, 5, 7 need band renaming to match L8/9
    def rename_l457(image):
        return image.select(
            ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7', 'ST_B6', 'QA_PIXEL'],
            ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7', 'ST_B10', 'QA_PIXEL']
        ).copyProperties(image, ['system:time_start'])

    l7_t1 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2').filterDate(start_date, end_date).filterBounds(aoi).map(mask_l457_clouds).map(rename_l457)
    l7_t2 = ee.ImageCollection('LANDSAT/LE07/C02/T2_L2').filterDate(start_date, end_date).filterBounds(aoi).map(mask_l457_clouds).map(rename_l457)
    l7 = l7_t1.merge(l7_t2)
        
    l5_t1 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2').filterDate(start_date, end_date).filterBounds(aoi).map(mask_l457_clouds).map(rename_l457)
    l5_t2 = ee.ImageCollection('LANDSAT/LT05/C02/T2_L2').filterDate(start_date, end_date).filterBounds(aoi).map(mask_l457_clouds).map(rename_l457)
    l5 = l5_t1.merge(l5_t2)
        
    l4_t1 = ee.ImageCollection('LANDSAT/LT04/C02/T1_L2').filterDate(start_date, end_date).filterBounds(aoi).map(mask_l457_clouds).map(rename_l457)
    l4_t2 = ee.ImageCollection('LANDSAT/LT04/C02/T2_L2').filterDate(start_date, end_date).filterBounds(aoi).map(mask_l457_clouds).map(rename_l457)
    l4 = l4_t1.merge(l4_t2)

    return l89.merge(l7).merge(l5).merge(l4)


def get_harmonized_landsat_toa_collection(start_date: str, end_date: str, aoi: ee.Geometry) -> ee.ImageCollection:
    """
    Returns a harmonized Top-of-Atmosphere (TOA) ImageCollection (Landsat 4, 5, 7, 8, 9).
    Provides native 30-meter at-sensor brightness temperature (B10 in Kelvin) without
    any dependency on the USGS ASTER GED auxiliary dataset. Covers 100% of Eastern Rwanda.
    All bands are harmonized to: ['B2', 'B3', 'B4', 'B5', 'B10', 'QA_PIXEL'].
    """
    def mask_clouds(img):
        qa = img.select('QA_PIXEL')
        # Mask clouds (bit 3), cloud shadow (bit 4), cirrus (bit 2)
        mask = (
            qa.bitwiseAnd(1 << 4).eq(0)
            .And(qa.bitwiseAnd(1 << 3).eq(0))
            .And(qa.bitwiseAnd(1 << 2).eq(0))
        )
        return img.updateMask(mask)

    # Landsat 8 and 9 (B2=Blue, B3=Green, B4=Red, B5=NIR, B10=Thermal in Kelvin)
    l9_t1 = ee.ImageCollection('LANDSAT/LC09/C02/T1_TOA').filterDate(start_date, end_date).filterBounds(aoi).map(mask_clouds)
    l9_t2 = ee.ImageCollection('LANDSAT/LC09/C02/T2_TOA').filterDate(start_date, end_date).filterBounds(aoi).map(mask_clouds)
    l9 = l9_t1.merge(l9_t2).select(['B2', 'B3', 'B4', 'B5', 'B10', 'QA_PIXEL'])

    l8_t1 = ee.ImageCollection('LANDSAT/LC08/C02/T1_TOA').filterDate(start_date, end_date).filterBounds(aoi).map(mask_clouds)
    l8_t2 = ee.ImageCollection('LANDSAT/LC08/C02/T2_TOA').filterDate(start_date, end_date).filterBounds(aoi).map(mask_clouds)
    l8 = l8_t1.merge(l8_t2).select(['B2', 'B3', 'B4', 'B5', 'B10', 'QA_PIXEL'])

    l89 = l9.merge(l8)

    # Landsat 7: B1=Blue, B2=Green, B3=Red, B4=NIR, B6_VCID_1=Thermal (Kelvin)
    def rename_l7(img):
        return img.select(
            ['B1', 'B2', 'B3', 'B4', 'B6_VCID_1', 'QA_PIXEL'],
            ['B2', 'B3', 'B4', 'B5', 'B10', 'QA_PIXEL']
        ).copyProperties(img, ['system:time_start'])

    l7_t1 = ee.ImageCollection('LANDSAT/LE07/C02/T1_TOA').filterDate(start_date, end_date).filterBounds(aoi).map(mask_clouds).map(rename_l7)
    l7_t2 = ee.ImageCollection('LANDSAT/LE07/C02/T2_TOA').filterDate(start_date, end_date).filterBounds(aoi).map(mask_clouds).map(rename_l7)
    l7 = l7_t1.merge(l7_t2)

    # Landsat 5: B1=Blue, B2=Green, B3=Red, B4=NIR, B6=Thermal (Kelvin)
    def rename_l5(img):
        return img.select(
            ['B1', 'B2', 'B3', 'B4', 'B6', 'QA_PIXEL'],
            ['B2', 'B3', 'B4', 'B5', 'B10', 'QA_PIXEL']
        ).copyProperties(img, ['system:time_start'])

    l5_t1 = ee.ImageCollection('LANDSAT/LT05/C02/T1_TOA').filterDate(start_date, end_date).filterBounds(aoi).map(mask_clouds).map(rename_l5)
    l5_t2 = ee.ImageCollection('LANDSAT/LT05/C02/T2_TOA').filterDate(start_date, end_date).filterBounds(aoi).map(mask_clouds).map(rename_l5)
    l5 = l5_t1.merge(l5_t2)

    return l89.merge(l7).merge(l5)

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
