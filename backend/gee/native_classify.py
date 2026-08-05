import json
import rasterio
from rasterio.mask import mask
from shapely.geometry import shape, Point
import numpy as np
import uuid
import joblib
import os
import tempfile
from sklearn.ensemble import RandomForestClassifier
import logging

logger = logging.getLogger(__name__)
CACHE_DIR = tempfile.gettempdir()

def train_and_classify_native(samples, custom_asset_id):
    url = custom_asset_id
    
    unique_classes = []
    class_colors = {}
    for s in samples:
        cls = s.get("class_label")
        if cls and cls not in unique_classes:
            unique_classes.append(cls)
            class_colors[cls] = s.get("color", "#000000")

    if len(unique_classes) < 2:
        found_name = unique_classes[0] if unique_classes else 'None'
        raise ValueError(
            f"Supervised classification requires at least 2 distinct land cover classes. "
            f"Currently you only have 1 class ('{found_name}')."
        )
        
    X_train = []
    y_train = []
    
    logger.info(f"Training native model using {len(samples)} samples on COG: {url}")
    
    if not url.startswith("http://") and not url.startswith("https://"):
        from storage.dataset_storage import download_dataset_bytes
        cache_key = url.replace('/', '_').replace(':', '_')
        temp_path = os.path.join(tempfile.gettempdir(), f"cache_{cache_key}")
        if not os.path.exists(temp_path):
            file_bytes = download_dataset_bytes(url)
            with open(temp_path, "wb") as f:
                f.write(file_bytes)
        url = temp_path

    with rasterio.open(url) as src:
        nodata = src.nodata
        
        from rasterio.warp import transform_geom
        
        for s in samples:
            geom = s.get("geometry")
            if not geom: continue
            cls = s.get("class_label")
            cls_id = unique_classes.index(cls)
            
            try:
                # Reproject geometry from EPSG:4326 to raster CRS
                if src.crs and str(src.crs).upper() != "EPSG:4326":
                    geom_proj = transform_geom("EPSG:4326", src.crs, geom)
                else:
                    geom_proj = geom
                    
                s_geom = shape(geom_proj)
                if isinstance(s_geom, Point):
                    # Buffer point depending on unit (meters vs degrees)
                    buf = 50.0 if src.crs and src.crs.is_projected else 0.0005
                    s_geom = s_geom.buffer(buf)
                    
                out_image, out_transform = mask(src, [s_geom], crop=True)
                # Reshape to (pixels, bands)
                pixels = out_image.transpose(1, 2, 0).reshape(-1, src.count)
                
                # Filter nodata
                if nodata is not None:
                    valid = np.all(pixels != nodata, axis=1)
                else:
                    valid = np.all(pixels > 0, axis=1)
                    
                valid_pixels = pixels[valid]
                if len(valid_pixels) > 0:
                    # Limit pixels per polygon to keep it fast
                    if len(valid_pixels) > 500:
                        idxs = np.random.choice(len(valid_pixels), 500, replace=False)
                        valid_pixels = valid_pixels[idxs]
                        
                    X_train.append(valid_pixels)
                    y_train.extend([cls_id] * len(valid_pixels))
            except Exception as e:
                logger.warning(f"Failed to extract pixels for a geometry: {e}")
                continue

    if not X_train:
        raise ValueError("No valid training pixels found inside the image bounds. Make sure your polygons overlap the image data.")
        
    X_train = np.vstack(X_train)
    y_train = np.array(y_train)
    
    logger.info(f"Training RandomForest with {len(X_train)} total pixels.")
    clf = RandomForestClassifier(n_estimators=50, max_depth=10, random_state=42, n_jobs=-1)
    clf.fit(X_train, y_train)
    
    model_id = str(uuid.uuid4())
    model_path = os.path.join(CACHE_DIR, f"rf_model_{model_id}.joblib")
    joblib.dump({
        "model": clf,
        "classes": unique_classes,
        "colors": class_colors
    }, model_path)
    
    # We return 0 for areas since calculating full raster area natively is slow
    areas = {c: 0 for c in unique_classes}
    
    return {
        "tile_url": f"/api/native_classify/tiles/{{z}}/{{x}}/{{y}}?url={url}&model_id={model_id}",
        "classes": unique_classes,
        "colors": class_colors,
        "areas": areas
    }
