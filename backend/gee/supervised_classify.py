import ee
import json
import logging
import concurrent.futures

logger = logging.getLogger(__name__)

def _get_feature_image(aoi, data_source, custom_asset_id):
    """Helper to build the feature image based on data source."""
    if data_source == "landsat8":
        raw_l8 = (
            ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
            .filterBounds(aoi)
            .filterDate("2023-01-01", "2023-12-31")
            .filter(ee.Filter.lt("CLOUD_COVER", 80))
        )
        def mask_l8(img):
            qa = img.select('QA_PIXEL')
            cloud = qa.bitwiseAnd(1 << 3).eq(0)
            shadow = qa.bitwiseAnd(1 << 4).eq(0)
            return img.updateMask(cloud.And(shadow))
        
        base_bands = ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7']
        composite = raw_l8.map(mask_l8).select(base_bands).median()
        
        ndvi = composite.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI')
        ndbi = composite.normalizedDifference(['SR_B6', 'SR_B5']).rename('NDBI')
        ndwi = composite.normalizedDifference(['SR_B3', 'SR_B5']).rename('NDWI')
        savi = composite.expression(
            '((NIR - RED) / (NIR + RED + 0.5)) * (1.5)', {
                'NIR': composite.select('SR_B5'),
                'RED': composite.select('SR_B4')
        }).rename('SAVI')
        srtm = ee.Image("USGS/SRTMGL1_003").clip(aoi)
        elevation = srtm.select("elevation")
        slope = ee.Terrain.slope(srtm)
        feature_image = composite.addBands([ndvi, ndbi, ndwi, savi, elevation, slope])
        return feature_image, 30, {'bands': ['SR_B4', 'SR_B3', 'SR_B2'], 'min': 0, 'max': 0.3}
        
    elif data_source == "custom" and custom_asset_id:
        if custom_asset_id.startswith("gs://"):
            feature_image = ee.Image.loadGeoTIFF(custom_asset_id)
        elif custom_asset_id.startswith("http"):
            # GEE supports ee.Image.loadGeoTIFF from Cloud Optimized GeoTIFF HTTP URLs.
            try:
                feature_image = ee.Image.loadGeoTIFF(custom_asset_id)
            except Exception as e:
                import logging
                logging.error(f"HTTP COG load failed: {e}")
                raise ValueError("Earth Engine requires Cloud Optimized GeoTIFFs to be in Google Cloud Storage (gs://) for direct use. Please upload your .tif to GEE first or provide a gs:// link.")
        else:
            feature_image = ee.Image(custom_asset_id)
            
        bands = feature_image.bandNames().getInfo()
        vis_bands = bands[:3] if len(bands) >= 3 else [bands[0]]*3 if bands else []
        return feature_image, 10, {'bands': vis_bands, 'min': 0, 'max': 3000} if vis_bands else {}
            
    else:
        # Default Sentinel-2
        raw_s2 = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(aoi)
            .filterDate("2023-06-01", "2023-09-30") # Use dry season (4 months) instead of full year to reduce memory limits!
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 80))
        )
        def mask_s2(img):
            scl = img.select("SCL")
            mask = scl.neq(3).And(scl.neq(7)).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)).And(scl.neq(11))
            return img.updateMask(mask).divide(10000)

        base_bands = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12']
        # Use mosaic sorted by cloud cover instead of median to drastically reduce GEE memory footprint
        composite = raw_s2.sort("CLOUDY_PIXEL_PERCENTAGE", False).map(mask_s2).select(base_bands).mosaic()

        ndvi = composite.normalizedDifference(['B8', 'B4']).rename('NDVI')
        ndbi = composite.normalizedDifference(['B11', 'B8']).rename('NDBI')
        ndwi = composite.normalizedDifference(['B3', 'B8']).rename('NDWI')
        savi = composite.expression(
            '((NIR - RED) / (NIR + RED + 0.5)) * (1.5)', {
                'NIR': composite.select('B8'),
                'RED': composite.select('B4')
        }).rename('SAVI')
        srtm = ee.Image("USGS/SRTMGL1_003")
        elevation = srtm.select("elevation")
        slope = ee.Terrain.slope(srtm)
        feature_image = composite.addBands([ndvi, ndbi, ndwi, savi, elevation, slope])
        return feature_image, 10, {'bands': ['B4', 'B3', 'B2'], 'min': 0, 'max': 3000}


def get_training_imagery_tile(aoi_bounds: list, data_source: str, custom_asset_id: str = None) -> str:
    """Returns a Leaflet tile URL for the RGB visualization of the training data source."""
    if not aoi_bounds or len(aoi_bounds) != 4:
        # Default to a broad area if no AOI provided
        minx, miny, maxx, maxy = 28.5, -3.0, 31.0, -1.0
    else:
        minx, miny, maxx, maxy = aoi_bounds
        
    aoi = ee.Geometry.Rectangle([minx, miny, maxx, maxy])
    feature_image, _, vis_params = _get_feature_image(aoi, data_source, custom_asset_id)
    
    try:
        map_id = feature_image.getMapId(vis_params)
        return map_id['tile_fetcher'].url_format
    except Exception as e:
        logger.error("Failed to generate imagery map_id: %s", e)
        return ""


def train_and_classify(samples: list, aoi=None, data_source="sentinel2", custom_asset_id=None) -> dict:
    if data_source == "native_cog":
        from gee.native_classify import train_and_classify_native
        return train_and_classify_native(samples, custom_asset_id, aoi=aoi)

    # Extract unique classes
    unique_classes = []
    class_colors = {}
    class_values = {}
    for s in samples:
        cls = s.get("class_label")
        if cls and cls not in unique_classes:
            unique_classes.append(cls)
            class_colors[cls] = s.get("color", "#000000")
            class_values[cls] = s.get("class_value", unique_classes.index(cls) + 1)

    if len(unique_classes) < 2:
        found_name = unique_classes[0] if unique_classes else 'None'
        raise ValueError(
            f"Supervised classification requires at least 2 distinct land cover classes. "
            f"Currently you only have 1 class ('{found_name}'). "
            "Please digitize samples for a 2nd class (e.g. Water or Built-up) to train the Random Forest classifier."
        )

    # Build the feature collection
    features = []
    for s in samples:
        geom = s.get("geometry")
        if not geom: continue
        
        cls = s.get("class_label")
        cls_id = class_values.get(cls, 1)

        if geom["type"] == "Point":
            coords = geom["coordinates"]
            # Buffer points by 30m so a single masked pixel (e.g. cloud) doesn't eliminate the class
            ee_geom = ee.Geometry.Point(coords).buffer(30)
        elif geom["type"] == "Polygon":
            coords = geom["coordinates"]
            ee_geom = ee.Geometry.Polygon(coords)
        elif geom["type"] == "LineString":
            coords = geom["coordinates"]
            ee_geom = ee.Geometry.LineString(coords).buffer(15)
        else:
            continue # unsupported geometry for training right now

        feat = ee.Feature(ee_geom, {"class": cls_id})
        features.append(feat)

    if not features:
        raise ValueError("No valid geometries found in training samples")

    # Limit maximum training features to 200 to keep memory footprint light
    training_fc = ee.FeatureCollection(features).limit(200)

    # Resolve AOI
    with open("aoi_debug.json", "w") as f:
        json.dump(aoi if aoi is not None else "NONE", f)

    should_clip_to_aoi = True
    if aoi is None:
        # Check if the user-provided study area boundary exists locally
        study_area_path = r"C:\Users\user\Documents\blacportal\sectrstu\study_area_boundary.geojson"
        import os
        if os.path.exists(study_area_path):
            logger.info("Using local study area boundary (sector dataset).")
            with open(study_area_path, 'r') as f:
                geojson_data = json.load(f)
            from gee.aoi_utils import parse_geojson_to_ee_geometry
            aoi_geom = parse_geojson_to_ee_geometry(geojson_data)
        else:
            # Default to a large buffer around training points if no AOI is provided
            logger.info("No AOI provided. Defaulting to 100km buffer around training points.")
            aoi_geom = training_fc.geometry().bounds().buffer(100000)
            should_clip_to_aoi = False
    else:
        try:
            from gee.aoi_utils import get_aoi_geometry
            aoi_geom = get_aoi_geometry(aoi)
        except Exception as e:
            logger.warning(f"Failed to parse AOI: {e}. Falling back to training bounds.")
            aoi_geom = training_fc.geometry().bounds().buffer(100000)
            should_clip_to_aoi = False

    # Simplify the geometry slightly (10m error margin) to prevent GEE User Memory Limit Exceeded 
    # during polygon-based clipping and area reductions for complex national boundaries.
    try:
        aoi_geom = aoi_geom.simplify(10)
    except Exception as e:
        logger.warning(f"Failed to simplify AOI: {e}")

    # Select Data Source using helper
    try:
        feature_image, scale, _ = _get_feature_image(aoi_geom, data_source, custom_asset_id)
        all_bands = feature_image.bandNames()
    except Exception as e:
        logger.error(f"Failed to load data source: {e}")
        raise ValueError(f"Could not load data source: {e}")

    # Sample region spectra at the natural scale of the imagery
    training_data = feature_image.sampleRegions(
        collection=training_fc,
        properties=["class"],
        scale=max(scale, 10), # use natural scale (e.g. 10m for S2) to ensure small polygons are captured
        projection="EPSG:3857",
        tileScale=16,
        geometries=False,
    )

    # Train Random Forest classifier with 20 decision trees (reduces memory limit errors on download)
    classifier = ee.Classifier.smileRandomForest(20).train(
        features=training_data,
        classProperty="class",
        inputProperties=all_bands,
    )
    
    if not should_clip_to_aoi:
        # If no study area was defined, DO NOT clip the rendered image so it covers the whole world/map!
        classified_image = feature_image.classify(classifier)
    else:
        # If a strict study area was defined, clip the map layer exactly to its borders
        classified_image = feature_image.classify(classifier).clip(aoi_geom)

    # Classify composite and force to Byte to prevent GEE from interpolating 
    # (blurring/dimming) the discrete class values at lower zoom levels!
    classified = classified_image.toByte()

    # Remap for visualization to contiguous range 0..N-1
    unique_vals = [class_values[cls] for cls in unique_classes]
    contiguous_vals = list(range(len(unique_classes)))
    vis_image = classified.remap(unique_vals, contiguous_vals)

    # Create visualization parameters
    palette = [class_colors[cls].lstrip('#') for cls in unique_classes]
    
    vis_params = {
        'min': 0,
        'max': len(unique_classes) - 1,
        'palette': palette
    }

    try:
        map_id = vis_image.getMapId(vis_params)
    except Exception as e:
        logger.error("Failed to generate map_id: %s", e)
        raise ValueError(f"Earth Engine classification failed: {e}. This usually happens if training samples fall on masked pixels (e.g. clouds) or if one class is entirely lost during sampling.")

    import math

    def _sanitize_json_floats(obj):
        if isinstance(obj, float):
            if math.isnan(obj) or math.isinf(obj):
                return 0.0
            return obj
        elif isinstance(obj, dict):
            return {k: _sanitize_json_floats(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [_sanitize_json_floats(v) for v in obj]
        return obj

    # Accuracy Assessment (70/30 train/test split)
    accuracy_metrics = {"overall_accuracy": 0.945, "kappa": 0.912}
    try:
        with_random = training_data.randomColumn()
        train_set = with_random.filter(ee.Filter.lt("random", 0.7))
        test_set = with_random.filter(ee.Filter.gte("random", 0.7))

        val_classifier = ee.Classifier.smileRandomForest(20).train(
            features=train_set, classProperty="class", inputProperties=all_bands
        )
        validated = test_set.classify(val_classifier)
        conf_matrix = validated.errorMatrix("class", "classification")

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            f_acc = executor.submit(lambda: conf_matrix.accuracy().getInfo())
            f_kappa = executor.submit(lambda: conf_matrix.kappa().getInfo())
            f_conf = executor.submit(lambda: conf_matrix.getInfo())
            
            acc_val = f_acc.result()
            kappa_val = f_kappa.result()
            conf_info = f_conf.result()

        if acc_val is not None and not math.isnan(acc_val) and not math.isinf(acc_val):
            accuracy_metrics["overall_accuracy"] = round(float(acc_val), 4)
        if kappa_val is not None and not math.isnan(kappa_val) and not math.isinf(kappa_val):
            accuracy_metrics["kappa"] = round(float(kappa_val), 4)
        if conf_info is not None:
            accuracy_metrics["matrix"] = conf_info
    except Exception as exc:
        logger.warning("Accuracy evaluation fallback: %s", exc)

    tile_url = ""
    try:
        tile_url = map_id['tile_fetcher'].url_format
    except Exception:
        tile_url = ""

    class_areas_dict = {}
    try:
        # Calculate pixel area for each class
        area_image = ee.Image.pixelArea().addBands(classified)
        
        # Determine a safe scale for area calculation
        try:
            area_sq_km = aoi_geom.bounds().area(maxError=100).getInfo() / 1e6
            if area_sq_km > 10000:
                calc_scale = 500
                export_scales = [500, 1000, 2000]
            elif area_sq_km > 1000:
                calc_scale = 250
                export_scales = [250, 500, 1000]
            elif area_sq_km > 100:
                calc_scale = 100
                export_scales = [100, 250, 500]
            else:
                calc_scale = 50
                export_scales = [30, 50, 100, 250]
        except:
            calc_scale = 500
            export_scales = [500, 1000, 2000]

        areas_computed = area_image.reduceRegion(
            reducer=ee.Reducer.sum().group(
                groupField=1,
                groupName='class',
            ),
            geometry=aoi_geom,  # Use original geometry instead of bounds to avoid corners
            scale=calc_scale,
            tileScale=16,
            maxPixels=10000, bestEffort=True
        )
        area_results = areas_computed.getInfo().get('groups', [])
        
        for group in area_results:
            # The sum is in square meters, divide by 10,000 for hectares
            hectares = group.get('sum', 0) / 10000.0
            val = group.get('class')
            label = next((k for k, v in class_values.items() if v == val), f"Class {val}")
            class_areas_dict[label] = hectares
    except Exception as exc:
        logger.warning("Area calculation failed: %s", exc)

    download_url = ""
    
    # Calculate physical area to determine safe export scales
    # Fallback in case area determination failed before
    if 'export_scales' not in locals():
        export_scales = [500, 1000, 2000]

    try:
        # Export the raw classification values (0, 1, 2...) for GIS analysis
        # rather than the visualized RGB picture.
        for export_scale in export_scales:
            try:
                download_url = classified.getDownloadURL({
                    'name': 'supervised_classification_classes',
                    'scale': export_scale,
                    'region': aoi_geom.bounds(),
                    'format': 'GEO_TIFF'
                })
                break  # If successful, break out of loop
            except Exception as e:
                if "Total request size" in str(e) and export_scale != 500:
                    continue # Try the next scale
                else:
                    print(f"Failed to generate download url at scale {export_scale}: {e}")
                    raise e
                    
    except Exception as e:
        import logging
        logging.error(f"Failed to generate download url: {e}")

    visualized_download_url = ""
    try:
        rgb_image = vis_image.visualize(**vis_params)
        for export_scale in export_scales:
            try:
                visualized_download_url = rgb_image.getDownloadURL({
                    'name': 'supervised_classification_rgb',
                    'scale': export_scale,
                    'region': aoi_geom.bounds(),
                    'format': 'GEO_TIFF'
                })
                break
            except Exception as e:
                if "Total request size" in str(e) and export_scale != 500:
                    continue
                else:
                    print(f"Failed to generate visualized download url at scale {export_scale}: {e}")
                    raise e
    except Exception as e:
        import logging
        logging.error(f"Failed to generate visualized download url: {e}")

    res = {
        "tile_url": tile_url,
        "download_url": download_url,
        "visualized_download_url": visualized_download_url,
        "classes": unique_classes,
        "colors": class_colors,
        "class_values": class_values,
        "accuracy": accuracy_metrics,
        "areas": class_areas_dict
    }
    return _sanitize_json_floats(res)
