import json
"""NDBI (Normalized Difference Built-up Index) helper — used by UHI module."""
import ee


def ndbi_image_and_aoi(aoi_config: dict, start_date: str, end_date: str):
    """Build a median NDBI image from Landsat 9 SR and return (ndbi_image, aoi)."""
    from gee.aoi_utils import get_aoi_geometry
    aoi = get_aoi_geometry(aoi_config)
    # Calculate dynamic scale based on geometry size (sq km)
    from gee.aoi_utils import get_dynamic_scale
    dynamic_scale = get_dynamic_scale(aoi)    # Sector or small polygon


    from gee.landsat_utils import get_harmonized_landsat_collection, gap_fill

    def apply_scale_factors(image):
        optical = image.select("SR_B.").multiply(0.0000275).add(-0.2)
        return image.addBands(optical, None, True)

    def compute_ndbi(image):
        # NDBI = (SWIR1 - NIR) / (SWIR1 + NIR)  →  Landsat9: SR_B6 / SR_B5
        ndbi = image.normalizedDifference(["SR_B6", "SR_B5"]).rename("NDBI")
        return ndbi.copyProperties(image, ["system:time_start"])

    collection = get_harmonized_landsat_collection(start_date, end_date, aoi, max_cloud_cover=80) \
        .map(apply_scale_factors) \
        .map(compute_ndbi)
    
    if collection.size().getInfo() == 0:
        raise ValueError("No satellite imagery (Landsat 4-9) found for this area and date range with <20% cloud cover. Try expanding the date range or choosing a different area.")

    ndbi_median = gap_fill(collection.median()).clip(aoi)
    return ndbi_median, aoi
