from gee.persistent_cache import with_cache
import json
import ee
from gee.persistent_cache import PersistentCache
from threading import Lock
import concurrent.futures

_cache = PersistentCache(ttl=3600)
_lock = Lock()


from gee.aoi_utils import get_dynamic_scale


def mask_s2_clouds(image):
    """Mask Sentinel-2 clouds and cloud shadows using SCL and QA60."""
    scl = image.select("SCL")
    # 3: Cloud shadow, 8: Cloud med prob, 9: Cloud high prob, 10: Cirrus, 11: Snow
    scl_clear = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)).And(scl.neq(11))
    
    qa = image.select("QA60")
    qa_clear = qa.bitwiseAnd(1 << 10).eq(0).And(qa.bitwiseAnd(1 << 11).eq(0))
    
    return image.updateMask(scl_clear.And(qa_clear))


def mask_l8_clouds(image):
    """Mask Landsat 8/9 clouds and shadows using QA_PIXEL."""
    qa = image.select("QA_PIXEL")
    dilated_cloud = qa.bitwiseAnd(1 << 1).eq(0)
    cirrus = qa.bitwiseAnd(1 << 2).eq(0)
    cloud = qa.bitwiseAnd(1 << 3).eq(0)
    shadow = qa.bitwiseAnd(1 << 4).eq(0)
    return image.updateMask(dilated_cloud.And(cirrus).And(cloud).And(shadow))


def get_harmonized_composite(aoi, start_date: str, end_date: str):
    """
    Produce a clean, cloud-free optical composite (B2, B3, B4, B8, B11, B12)
    using Sentinel-2 SR (2016-present) or Landsat 8/9 with seamless fallback.
    Reflectance is normalized to 0.0 - 1.0.
    """
    year = int(start_date[:4])
    
    if year >= 2016:
        s2_col = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 75))
            .map(mask_s2_clouds)
            .select(["B2", "B3", "B4", "B8", "B11", "B12"])
        )
        
        # Scale 10000 -> 1.0
        s2_median = s2_col.median().multiply(0.0001)
        
        # Fallback to wider 2-year composite if user picked a short cloudy period
        fallback_col = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterDate(f"{max(2016, year-1)}-01-01", f"{year+1}-12-31")
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
            .map(mask_s2_clouds)
            .select(["B2", "B3", "B4", "B8", "B11", "B12"])
            .median()
            .multiply(0.0001)
        )
        composite = s2_median.unmask(fallback_col)
    elif year >= 2013:
        l8_col = (
            ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", 75))
            .map(mask_l8_clouds)
            .select(
                ["SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B6", "SR_B7"],
                ["B2", "B3", "B4", "B8", "B11", "B12"]
            )
        )
        l8_median = l8_col.median().multiply(0.0000275).add(-0.2)
        fallback_l8 = (
            ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
            .filterDate(f"{year-1}-01-01", f"{year+1}-12-31")
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", 40))
            .map(mask_l8_clouds)
            .select(
                ["SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B6", "SR_B7"],
                ["B2", "B3", "B4", "B8", "B11", "B12"]
            )
            .median()
            .multiply(0.0000275).add(-0.2)
        )
        composite = l8_median.unmask(fallback_l8)
    elif year >= 1999:
        l7_col = (
            ee.ImageCollection("LANDSAT/LE07/C02/T1_L2")
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", 75))
            .map(mask_l8_clouds)
            .select(
                ["SR_B1", "SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B7"],
                ["B2", "B3", "B4", "B8", "B11", "B12"]
            )
        )
        l7_median = l7_col.median().multiply(0.0000275).add(-0.2)
        fallback_l7 = (
            ee.ImageCollection("LANDSAT/LE07/C02/T1_L2")
            .filterDate(f"{year-1}-01-01", f"{year+1}-12-31")
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", 40))
            .map(mask_l8_clouds)
            .select(
                ["SR_B1", "SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B7"],
                ["B2", "B3", "B4", "B8", "B11", "B12"]
            )
            .median()
            .multiply(0.0000275).add(-0.2)
        )
        composite = l7_median.unmask(fallback_l7)
    else:
        # Landsat 5 TM (1984-2012) and Landsat 4 (1982-1993)
        l5_col = (
            ee.ImageCollection("LANDSAT/LT05/C02/T1_L2")
            .merge(ee.ImageCollection("LANDSAT/LT05/C02/T2_L2"))
            if year >= 1984 else
            ee.ImageCollection("LANDSAT/LT04/C02/T1_L2")
            .merge(ee.ImageCollection("LANDSAT/LT05/C02/T1_L2"))
        )
        l5_filtered = (
            l5_col
            .filterDate(start_date, end_date)
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", 75))
            .map(mask_l8_clouds)
            .select(
                ["SR_B1", "SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B7"],
                ["B2", "B3", "B4", "B8", "B11", "B12"]
            )
        )
        l5_median = l5_filtered.median().multiply(0.0000275).add(-0.2)
        fallback_l5 = (
            l5_col
            .filterDate(f"{year-1}-01-01", f"{year+1}-12-31")
            .filterBounds(aoi)
            .filter(ee.Filter.lt("CLOUD_COVER", 60))
            .map(mask_l8_clouds)
            .select(
                ["SR_B1", "SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B7"],
                ["B2", "B3", "B4", "B8", "B11", "B12"]
            )
            .median()
            .multiply(0.0000275).add(-0.2)
        )
        composite = l5_median.unmask(fallback_l5)
        
    return composite.clip(aoi)


def calculate_index(composite: ee.Image, index_type: str = "NDVI") -> ee.Image:
    """Calculate normalized difference spectral index."""
    idx = (index_type or "NDVI").upper()
    if idx == "NDBI":
        # Built-up Index: (SWIR1 - NIR) / (SWIR1 + NIR)
        return composite.normalizedDifference(["B11", "B8"]).rename("index")
    elif idx == "NDWI":
        # Water Index: (Green - NIR) / (Green + NIR)
        return composite.normalizedDifference(["B3", "B8"]).rename("index")
    elif idx == "BSI":
        # Bare Soil Index: ((SWIR1 + Red) - (NIR + Blue)) / ((SWIR1 + Red) + (NIR + Blue))
        swir_red = composite.select("B11").add(composite.select("B4"))
        nir_blue = composite.select("B8").add(composite.select("B2"))
        return swir_red.subtract(nir_blue).divide(swir_red.add(nir_blue)).rename("index")
    else:
        # Default NDVI: (NIR - Red) / (NIR + Red)
        return composite.normalizedDifference(["B8", "B4"]).rename("index")


@with_cache
def compute_change_detection(
    aoi_config: dict,
    before_start: str,
    before_end: str,
    after_start: str,
    after_end: str,
    index_type: str = "NDVI",
    mask_water: bool = True,
    threshold: float = None,
    n_classes: int = 5,
    method: str = "threshold",
    custom_labels: list = None,
) -> dict:
    """
    Compute high-resolution change detection between two periods.
    Supports NDVI (Vegetation), NDBI (Urban), NDWI (Water), and BSI (Bare Soil).
    Generates difference layer, Before/After Index & True-Color RGB tiles, and statistics.
    """
    cache_key = (
        json.dumps(aoi_config, sort_keys=True),
        before_start,
        before_end,
        after_start,
        after_end,
        index_type,
        mask_water,
        threshold,
        n_classes,
        method,
        tuple(custom_labels) if custom_labels else None,
    )

    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    from gee.aoi_utils import get_aoi_geometry
    from gee.classify_utils import quantile_classify
    aoi = get_aoi_geometry(aoi_config)
    dynamic_scale = get_dynamic_scale(aoi)

    # 1. Optical Composites for Both Periods
    before_comp = get_harmonized_composite(aoi, before_start, before_end)
    after_comp = get_harmonized_composite(aoi, after_start, after_end)

    # 2. Spectral Indices
    before_idx = calculate_index(before_comp, index_type)
    after_idx = calculate_index(after_comp, index_type)

    # Difference: positive = increase, negative = decrease
    diff_raw = after_idx.subtract(before_idx).rename("Change")

    # 3. Permanent Water Masking (prevents false alerts on lakes)
    jrc_water = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence").gt(50)
    is_water = jrc_water.clip(aoi)

    if mask_water and index_type.upper() in ("NDVI", "NDBI", "BSI"):
        diff = diff_raw.updateMask(is_water.Not())
    else:
        diff = diff_raw

    # 4. Color Palettes and Classes based on Index Type
    idx_upper = index_type.upper()
    if idx_upper == "NDBI":
        # Urban Expansion: red = expansion, blue = vegetation recovery/decrease
        t_high = threshold if threshold else 0.12
        t_low = t_high * 0.4
        classes = {
            f"Significant Urban Expansion (> +{t_high:.2f})": diff.gt(t_high),
            f"Moderate Urban Growth (+{t_low:.2f} to +{t_high:.2f})": diff.gt(t_low).And(diff.lte(t_high)),
            f"Stable (-{t_low:.2f} to +{t_low:.2f})": diff.gte(-t_low).And(diff.lte(t_low)),
            f"Minor Built-up Reduction (-{t_high:.2f} to -{t_low:.2f})": diff.lt(-t_low).And(diff.gte(-t_high)),
            f"Significant Reduction (< -{t_high:.2f})": diff.lt(-t_high),
        }
        palette = ["#2166ac", "#67a9cf", "#f7f7f7", "#f4a582", "#b2182b"]
        vis_min, vis_max = -0.25, 0.25
        class_colors = ["#b2182b", "#f4a582", "#f7f7f7", "#67a9cf", "#2166ac"]
    elif idx_upper == "NDWI":
        # Water/Flooding: blue = water gain/flood, brown/orange = water loss/drought
        t_high = threshold if threshold else 0.15
        t_low = t_high * 0.35
        classes = {
            f"Water Inundation / Flood (> +{t_high:.2f})": diff.gt(t_high),
            f"Minor Water Gain (+{t_low:.2f} to +{t_high:.2f})": diff.gt(t_low).And(diff.lte(t_high)),
            f"Stable (-{t_low:.2f} to +{t_low:.2f})": diff.gte(-t_low).And(diff.lte(t_low)),
            f"Minor Water Loss (-{t_high:.2f} to -{t_low:.2f})": diff.lt(-t_low).And(diff.gte(-t_high)),
            f"Significant Desiccation (< -{t_high:.2f})": diff.lt(-t_high),
        }
        palette = ["#8c510a", "#d8b365", "#f5f5f5", "#80cdc1", "#01665e"]
        vis_min, vis_max = -0.3, 0.3
        class_colors = ["#01665e", "#80cdc1", "#f5f5f5", "#d8b365", "#8c510a"]
    elif idx_upper == "BSI":
        # Bare Soil: red = soil exposure / clearing, green = vegetation recovery
        t_high = threshold if threshold else 0.12
        t_low = t_high * 0.4
        classes = {
            f"Severe Land Clearing / Erosion (> +{t_high:.2f})": diff.gt(t_high),
            f"Moderate Soil Exposure (+{t_low:.2f} to +{t_high:.2f})": diff.gt(t_low).And(diff.lte(t_high)),
            f"Stable (-{t_low:.2f} to +{t_low:.2f})": diff.gte(-t_low).And(diff.lte(t_low)),
            f"Vegetation Regrowth (-{t_high:.2f} to -{t_low:.2f})": diff.lt(-t_low).And(diff.gte(-t_high)),
            f"Significant Greening (< -{t_high:.2f})": diff.lt(-t_high),
        }
        palette = ["#1a9850", "#91cf60", "#ffffbf", "#fee08b", "#d73027"]
        vis_min, vis_max = -0.25, 0.25
        class_colors = ["#d73027", "#fee08b", "#ffffbf", "#91cf60", "#1a9850"]
    else:
        # NDVI: green = gain/growth, red = loss/deforestation
        t_high = threshold if threshold else 0.15
        t_low = t_high * 0.35
        classes = {
            f"Significant Loss (< -{t_high:.2f})": diff.lt(-t_high),
            f"Minor Loss (-{t_high:.2f} to -{t_low:.2f})": diff.gte(-t_high).And(diff.lt(-t_low)),
            f"Stable (-{t_low:.2f} to +{t_low:.2f})": diff.gte(-t_low).And(diff.lte(t_low)),
            f"Minor Gain (+{t_low:.2f} to +{t_high:.2f})": diff.gt(t_low).And(diff.lte(t_high)),
            f"Significant Gain (> +{t_high:.2f})": diff.gt(t_high),
        }
        palette = ["#d73027", "#f46d43", "#fee08b", "#d9ef8b", "#1a9850"]
        vis_min, vis_max = -0.3, 0.3
        class_colors = ["#d73027", "#f46d43", "#fee08b", "#d9ef8b", "#1a9850"]

    # 5. Visualizations & Map IDs
    diff_vis = {"min": vis_min, "max": vis_max, "palette": palette}
    
    # If water masked, overlay water in subtle dark blue
    if mask_water and idx_upper in ("NDVI", "NDBI", "BSI"):
        diff_rgb = diff.visualize(**diff_vis)
        water_rgb = is_water.updateMask(is_water).visualize(palette=["#08306b"])
        diff_final_viz = ee.ImageCollection([diff_rgb, water_rgb]).mosaic().clip(aoi)
    else:
        diff_final_viz = diff.visualize(**diff_vis).clip(aoi)

    diff_map_id = diff_final_viz.getMapId()

    # Before & After Index Visualizations
    idx_vis = {"min": -0.1, "max": 0.8, "palette": ["#a50026", "#fee08b", "#1a9850"]}
    before_idx_map_id = before_idx.visualize(**idx_vis).clip(aoi).getMapId()
    after_idx_map_id = after_idx.visualize(**idx_vis).clip(aoi).getMapId()

    # Before & After True-Color Satellite RGB Visualizations
    rgb_vis = {"bands": ["B4", "B3", "B2"], "min": 0.02, "max": 0.22, "gamma": 1.2}
    before_rgb_map_id = before_comp.visualize(**rgb_vis).clip(aoi).getMapId()
    after_rgb_map_id = after_comp.visualize(**rgb_vis).clip(aoi).getMapId()

    labels = list(classes.keys())
    area_img = ee.Image.cat(
        [classes[lbl].multiply(ee.Image.pixelArea()).rename(f"c{i}") for i, lbl in enumerate(labels)]
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        f_stats = executor.submit(
            lambda: diff.reduceRegion(
                reducer=ee.Reducer.mean()
                .combine(ee.Reducer.min(), sharedInputs=True)
                .combine(ee.Reducer.max(), sharedInputs=True)
                .combine(ee.Reducer.stdDev(), sharedInputs=True),
                geometry=aoi.bounds(maxError=1000),
                scale=dynamic_scale,
                maxPixels=1e10,
                tileScale=4,
            ).getInfo()
        )

        f_area = executor.submit(
            lambda: area_img.reduceRegion(
                reducer=ee.Reducer.sum(), geometry=aoi.bounds(maxError=1000), scale=dynamic_scale, maxPixels=1e10, tileScale=4
            ).getInfo() if method == "threshold" else {}
        )
        
        f_classify = executor.submit(
            lambda: quantile_classify(
                layers=[{"name": "Change", "image": diff, "title": f"{idx_upper} Change Index"}],
                aoi=aoi,
                scale=dynamic_scale,
                n_classes=n_classes,
                method=method,
                custom_labels=custom_labels,
                custom_palette=class_colors if n_classes == 5 else None,
            ) if method != "threshold" else {}
        )

        f_thumb = executor.submit(
            lambda: diff_final_viz.getThumbURL({"region": aoi.bounds(), "dimensions": 512, "crs": "EPSG:4326", "format": "png"})
        )

        f_download = executor.submit(
            lambda: diff.getDownloadURL({
                "name": f"{idx_upper}_Change",
                "region": aoi.bounds(),
                "scale": 30,
                "format": "GEO_TIFF",
                "maxPixels": 1e9,
            })
        )

        try:
            stats = f_stats.result()
        except Exception:
            stats = {}

        try:
            area_dict = f_area.result()
        except Exception:
            area_dict = {}
            
        try:
            classify_res = f_classify.result()
        except Exception:
            classify_res = {}

        try:
            bounds = aoi.bounds().getInfo().get("coordinates", [[[0,0]]])[0]
        except Exception:
            bounds = [[0, 0], [0, 0], [0, 0], [0, 0]]

        try:
            thumb_url = f_thumb.result()
        except Exception:
            thumb_url = ""

        try:
            download_url = f_download.result()
        except Exception:
            download_url = None

    if method == "threshold":
        class_areas = {
            lbl: round((area_dict.get(f"c{i}", 0) or 0) / 1e6, 2)
            for i, lbl in enumerate(labels)
        }
    else:
        # Use dynamic classify results
        class_areas = classify_res.get("panels", [{}])[0].get("areas", {})
        labels = list(class_areas.keys())
        class_colors = classify_res.get("panels", [{}])[0].get("palette", class_colors)

    # Net change calculation
    area_vals = list(class_areas.values())
    if method == "threshold":
        # Index 0 & 1 are loss/decrease, Index 2 is stable, Index 3 & 4 are gain/increase
        loss_km2 = round((area_vals[0] + area_vals[1]) if len(area_vals) >= 2 else 0, 2)
        stable_km2 = round(area_vals[2] if len(area_vals) >= 3 else 0, 2)
        gain_km2 = round((area_vals[3] + area_vals[4]) if len(area_vals) >= 5 else 0, 2)
    else:
        # Generic approach for dynamic classes: assume lower half is loss, middle is stable, upper half is gain
        mid = len(area_vals) // 2
        loss_km2 = round(sum(area_vals[:mid]), 2)
        stable_km2 = round(area_vals[mid], 2) if len(area_vals) % 2 != 0 else 0
        gain_km2 = round(sum(area_vals[mid+1 if len(area_vals) % 2 != 0 else mid:]), 2)
        
    net_km2 = round(gain_km2 - loss_km2, 2)
    total_km2 = loss_km2 + stable_km2 + gain_km2
    pct_changed = round(((loss_km2 + gain_km2) / total_km2 * 100) if total_km2 > 0 else 0, 1)

    net_change = {
        "loss_km2": loss_km2,
        "stable_km2": stable_km2,
        "gain_km2": gain_km2,
        "net_km2": net_km2,
        "pct_changed": pct_changed,
        "total_analyzed_km2": round(total_km2, 2),
    }

    try:
        from gee.aoi_utils import get_bounds_and_center

        bounds, center = get_bounds_and_center(aoi)

        center_lat, center_lon = center[0], center[1]
    except Exception:
        center_lon, center_lat = 29.87, -1.94

    result = {
        "tile_url": diff_map_id["tile_fetcher"].url_format,
        "before_tile_url": before_idx_map_id["tile_fetcher"].url_format,
        "after_tile_url": after_idx_map_id["tile_fetcher"].url_format,
        "before_rgb_tile_url": before_rgb_map_id["tile_fetcher"].url_format,
        "after_rgb_tile_url": after_rgb_map_id["tile_fetcher"].url_format,
        "thumb_url": thumb_url,
        "download_url": download_url,
        "index_type": idx_upper,
        "stats": {
            f"Mean {idx_upper} Change": round(stats.get("Change_mean") or 0, 4),
            "Max Loss": round(stats.get("Change_min") or 0, 4),
            "Max Gain": round(stats.get("Change_max") or 0, 4),
            "Std Dev": round(stats.get("Change_stdDev") or 0, 4),
        },
        "net_change": net_change,
        "class_areas_km2": class_areas,
        "class_colors": class_colors,
        "classify": classify_res if method != "threshold" else None,
        "method": method,
        "n_classes": n_classes,
        "center": [center_lat, center_lon],
        "district": aoi_config.get("district", aoi_config.get("name", "Custom AOI")),
        "bbox": bounds,
        "before_start": before_start,
        "before_end": before_end,
        "after_start": after_start,
        "after_end": after_end,
    }

    with _lock:
        _cache[cache_key] = result

    return result


def inspect_change_point(
    aoi_config: dict,
    before_start: str,
    before_end: str,
    after_start: str,
    after_end: str,
    lat: float,
    lng: float,
    index_type: str = "NDVI",
) -> dict:
    """Extract before, after, and change values at a single point coordinate."""
    from gee.aoi_utils import get_aoi_geometry
    from gee.classify_utils import quantile_classify
    aoi = get_aoi_geometry(aoi_config)
    point = ee.Geometry.Point([lng, lat])

    before_comp = get_harmonized_composite(aoi, before_start, before_end)
    after_comp = get_harmonized_composite(aoi, after_start, after_end)

    before_idx = calculate_index(before_comp, index_type).rename("before")
    after_idx = calculate_index(after_comp, index_type).rename("after")
    diff = after_idx.subtract(before_idx).rename("delta")

    combined = ee.Image.cat([before_idx, after_idx, diff])
    sampled = combined.reduceRegion(
        reducer=ee.Reducer.first(),
        geometry=point,
        scale=30,
    ).getInfo()

    b_val = sampled.get("before")
    a_val = sampled.get("after")
    d_val = sampled.get("delta")

    b_num = round(b_val, 4) if b_val is not None else None
    a_num = round(a_val, 4) if a_val is not None else None
    d_num = round(d_val, 4) if d_val is not None else None

    # Classification interpretation
    idx_upper = index_type.upper()
    if d_num is None:
        status = "No Data"
        color = "#888888"
    elif d_num > 0.15:
        status = "Significant Gain / Growth" if idx_upper == "NDVI" else "Rapid Urbanization" if idx_upper == "NDBI" else "Flood / Inundation" if idx_upper == "NDWI" else "Severe Soil Clearing"
        color = "#1a9850" if idx_upper == "NDVI" else "#b2182b" if idx_upper == "NDBI" else "#01665e" if idx_upper == "NDWI" else "#d73027"
    elif d_num > 0.05:
        status = "Moderate Gain" if idx_upper == "NDVI" else "Moderate Urban Growth" if idx_upper == "NDBI" else "Water Expansion" if idx_upper == "NDWI" else "Soil Exposure"
        color = "#91cf60" if idx_upper == "NDVI" else "#f4a582" if idx_upper == "NDBI" else "#80cdc1" if idx_upper == "NDWI" else "#fee08b"
    elif d_num >= -0.05:
        status = "Stable (No Significant Change)"
        color = "#fee08b"
    elif d_num >= -0.15:
        status = "Minor Loss" if idx_upper == "NDVI" else "Built-up Reduction" if idx_upper == "NDBI" else "Water Receding" if idx_upper == "NDWI" else "Vegetation Regrowth"
        color = "#f46d43" if idx_upper == "NDVI" else "#67a9cf" if idx_upper == "NDBI" else "#d8b365" if idx_upper == "NDWI" else "#91cf60"
    else:
        status = "Significant Loss / Deforestation" if idx_upper == "NDVI" else "Major Structural Loss" if idx_upper == "NDBI" else "Severe Drying / Drought" if idx_upper == "NDWI" else "Significant Greening"
        color = "#d73027" if idx_upper == "NDVI" else "#2166ac" if idx_upper == "NDBI" else "#8c510a" if idx_upper == "NDWI" else "#1a9850"

    return {
        "lat": lat,
        "lng": lng,
        "index_type": idx_upper,
        "before_value": b_num,
        "after_value": a_num,
        "delta": d_num,
        "status": status,
        "color": color,
    }
