import logging
import math
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

SENTINEL2_BANDS = [
    {"band": "B2", "name": "Blue", "wavelength": 490, "desc": "Water penetration & aerosol scattering"},
    {"band": "B3", "name": "Green", "wavelength": 560, "desc": "Peak vegetation green reflectance"},
    {"band": "B4", "name": "Red", "wavelength": 665, "desc": "Chlorophyll absorption (photosynthesis)"},
    {"band": "B5", "name": "Red Edge 1", "wavelength": 705, "desc": "Vegetation stress & red-edge slope"},
    {"band": "B6", "name": "Red Edge 2", "wavelength": 740, "desc": "Canopy chlorophyll content"},
    {"band": "B7", "name": "Red Edge 3", "wavelength": 783, "desc": "Leaf structure indicator"},
    {"band": "B8", "name": "NIR", "wavelength": 842, "desc": "Internal leaf structure & biomass"},
    {"band": "B8A", "name": "Narrow NIR", "wavelength": 865, "desc": "Water vapor & atmospheric baseline"},
    {"band": "B11", "name": "SWIR 1", "wavelength": 1610, "desc": "Leaf water content & moisture"},
    {"band": "B12", "name": "SWIR 2", "wavelength": 2190, "desc": "Soil/mineral geology & dry matter"}
]

BAND_KEYS = [b["band"] for b in SENTINEL2_BANDS]


def compute_spectral_profiles(
    samples: List[Dict[str, Any]], 
    year: int = 2024, 
    aoi: Optional[Dict[str, Any]] = None,
    data_source: str = "sentinel2"
) -> Dict[str, Any]:
    """
    Extracts multi-spectral surface reflectance profiles across Sentinel-2 bands
    for all digitized sample classes. Computes mean, standard deviation, and
    pairwise class separability diagnostics (spectral Euclidean distance).
    """
    import ee

    if not samples:
        raise ValueError("No training samples provided for spectral profile analysis.")

    # 1. Filter valid geometries and build class groupings
    class_colors: Dict[str, str] = {}
    valid_samples = []
    for s in samples:
        geom = s.get("geometry")
        label = s.get("class_label") or s.get("label") or "Unclassified"
        color = s.get("color") or "#3b82f6"
        if not geom or not isinstance(geom, dict):
            continue
        if label not in class_colors:
            class_colors[label] = color
        valid_samples.append({
            "geometry": geom,
            "class_label": label
        })

    if not valid_samples:
        raise ValueError("No valid GeoJSON geometries found in the provided samples.")

    # 2. Build Earth Engine Feature Collection
    ee_features = []
    for s in valid_samples:
        try:
            g = ee.Geometry(s["geometry"])
            # Buffer points and lines slightly to encompass at least one 10m pixel
            g_type = s["geometry"].get("type", "")
            if g_type == "Point":
                g = g.buffer(15)
            elif g_type in ("LineString", "MultiLineString"):
                g = g.buffer(10)
            feat = ee.Feature(g, {"class_label": s["class_label"]})
            ee_features.append(feat)
        except Exception as e:
            logger.warning(f"Skipping invalid sample geometry: {e}")
            continue

    if not ee_features:
        raise ValueError("Could not convert sample geometries to Earth Engine features.")

    fc = ee.FeatureCollection(ee_features)

    # 3. Build Cloud-Masked Sentinel-2 Surface Reflectance Composite
    start_date = f"{year}-01-01"
    end_date = f"{year}-12-31"

    def mask_s2(img):
        qa = img.select('QA60')
        cloud_bit_mask = 1 << 10
        cirrus_bit_mask = 1 << 11
        mask = qa.bitwiseAnd(cloud_bit_mask).eq(0).And(qa.bitwiseAnd(cirrus_bit_mask).eq(0))
        return img.updateMask(mask)

    s2_coll = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterDate(start_date, end_date)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30))
        .map(mask_s2)
        .select(BAND_KEYS)
    )

    if aoi:
        try:
            from gee.aoi_utils import get_aoi_geometry
            aoi_geom = get_aoi_geometry(aoi)
            s2_coll = s2_coll.filterBounds(aoi_geom)
        except Exception as e:
            logger.warning(f"Could not filter bounds by AOI: {e}")
            s2_coll = s2_coll.filterBounds(fc.geometry().bounds())
    else:
        s2_coll = s2_coll.filterBounds(fc.geometry().bounds())

    # Median composite divided by 10,000 for standard 0.0 - 1.0 reflectance fraction
    median_img = s2_coll.median().divide(10000.0)

    # 4. Sample pixel spectra
    sampled_fc = median_img.sampleRegions(
        collection=fc,
        properties=["class_label"],
        scale=10,
        projection="EPSG:3857",
        tileScale=16,
        geometries=False
    )

    from gee.aoi_utils import safe_get_info
    info = safe_get_info(sampled_fc) or {}
    features = info.get("features", [])
    if not features:
        raise ValueError(
            "No valid pixel values returned from imagery. This usually occurs if sample points fall entirely outside the satellite coverage or on masked cloudy pixels."
        )

    # 5. Aggregate band stats by class
    class_data: Dict[str, Dict[str, List[float]]] = {}
    for f in features:
        props = f.get("properties", {})
        c_label = props.get("class_label", "Unknown")
        if c_label not in class_data:
            class_data[c_label] = {b: [] for b in BAND_KEYS}
        
        for b in BAND_KEYS:
            val = props.get(b)
            if val is not None and not (math.isnan(val) or math.isinf(val)):
                # clamp reasonable reflectance between 0.0 and 1.2
                clamped_val = max(0.0, min(1.2, float(val)))
                class_data[c_label][b].append(clamped_val)

    # Compute statistics per class
    profiles_by_class: Dict[str, Any] = {}
    for c_label, bands_dict in class_data.items():
        sample_size = max(len(vals) for vals in bands_dict.values()) if bands_dict else 0
        means: Dict[str, float] = {}
        stds: Dict[str, float] = {}
        mins: Dict[str, float] = {}
        maxs: Dict[str, float] = {}

        for b in BAND_KEYS:
            vals = bands_dict.get(b, [])
            if vals:
                mean_val = sum(vals) / len(vals)
                variance = sum((x - mean_val) ** 2 for x in vals) / len(vals)
                std_val = math.sqrt(variance)
                means[b] = round(mean_val, 4)
                stds[b] = round(std_val, 4)
                mins[b] = round(min(vals), 4)
                maxs[b] = round(max(vals), 4)
            else:
                means[b] = 0.0
                stds[b] = 0.0
                mins[b] = 0.0
                maxs[b] = 0.0

        profiles_by_class[c_label] = {
            "class_name": c_label,
            "color": class_colors.get(c_label, "#3b82f6"),
            "pixel_count": sample_size,
            "means": means,
            "stds": stds,
            "mins": mins,
            "maxs": maxs
        }

    # 6. Pairwise Separability Diagnostics (Spectral Euclidean Distance & Overlap Warning)
    separability_matrix = []
    class_names = list(profiles_by_class.keys())
    for i in range(len(class_names)):
        for j in range(i + 1, len(class_names)):
            c1 = class_names[i]
            c2 = class_names[j]
            m1 = profiles_by_class[c1]["means"]
            m2 = profiles_by_class[c2]["means"]

            # Euclidean distance across all 10 bands
            sq_diffs = sum((m1.get(b, 0.0) - m2.get(b, 0.0)) ** 2 for b in BAND_KEYS)
            dist = round(math.sqrt(sq_diffs), 4)

            # Specific NIR vs Red contrast (Vegetation indicator)
            veg_contrast_1 = m1.get("B8", 0.0) - m1.get("B4", 0.0)
            veg_contrast_2 = m2.get("B8", 0.0) - m2.get("B4", 0.0)

            if dist < 0.08:
                status = "confused"
                note = f"Severe spectral overlap between '{c1}' and '{c2}' (distance: {dist}). The classifier will likely confuse these classes without radar (SAR) or seasonal indices."
            elif dist < 0.16:
                status = "moderate"
                note = f"Moderate separability between '{c1}' and '{c2}' (distance: {dist}). Good differentiation in NIR/SWIR."
            else:
                status = "separable"
                note = f"Excellent separability between '{c1}' and '{c2}' (distance: {dist}). Distinct spectral signatures."

            separability_matrix.append({
                "class_a": c1,
                "class_b": c2,
                "distance": dist,
                "status": status,
                "note": note
            })

    return {
        "bands": SENTINEL2_BANDS,
        "classes": profiles_by_class,
        "separability": separability_matrix,
        "year": year,
        "total_pixels_sampled": sum(p["pixel_count"] for p in profiles_by_class.values())
    }
