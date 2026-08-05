import os
import json
import io
import tempfile
import zipfile
from pathlib import Path
from typing import Any

def clip_dataset_by_mask(record: dict[str, Any], file_bytes: bytes, mask_geojson: dict) -> tuple[bytes, str]:
    file_type = record.get("file_type")
    original_filename = record.get("original_filename", "dataset")
    
    try:
        from shapely.geometry import shape as shapely_shape
        mask_geom = shapely_shape(mask_geojson)
    except Exception as e:
        raise ValueError(f"Invalid mask GeoJSON: {e}")
        
    if file_type == "tiff":
        import rasterio
        from rasterio.mask import mask
        with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp.flush()
            tmp_name = tmp.name
            
        try:
            with rasterio.open(tmp_name) as src:
                if src.crs is not None and str(src.crs) != "EPSG:4326":
                    import geopandas as gpd
                    mask_gdf = gpd.GeoDataFrame(index=[0], crs="EPSG:4326", geometry=[mask_geom])
                    mask_gdf = mask_gdf.to_crs(src.crs)
                    mask_geom_crs = mask_gdf.geometry.iloc[0]
                else:
                    mask_geom_crs = mask_geom
                    
                out_image, out_transform = mask(src, [mask_geom_crs], crop=True)
                out_meta = src.meta.copy()
                out_meta.update({
                    "driver": "GTiff",
                    "height": out_image.shape[1],
                    "width": out_image.shape[2],
                    "transform": out_transform
                })
                
                with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as out_tmp:
                    out_tmp_name = out_tmp.name
                    
                with rasterio.open(out_tmp_name, "w", **out_meta) as dest:
                    dest.write(out_image)
                    
                with open(out_tmp_name, "rb") as f:
                    out_bytes = f.read()
                    
                os.unlink(tmp_name)
                os.unlink(out_tmp_name)
                return out_bytes, f"clipped_{original_filename}"
        except Exception as e:
            if os.path.exists(tmp_name): os.unlink(tmp_name)
            raise ValueError(f"Failed to clip TIFF: {e}")
            
    elif file_type == "shapefile":
        import geopandas as gpd
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_zip = Path(tmpdir) / "upload.zip"
            tmp_zip.write_bytes(file_bytes)
            with zipfile.ZipFile(tmp_zip) as zf:
                zf.extractall(tmpdir)
            shp_files = list(Path(tmpdir).rglob("*.shp"))
            if not shp_files:
                raise ValueError("No .shp file found inside the zip.")
            
            gdf = gpd.read_file(shp_files[0])
            mask_gdf = gpd.GeoDataFrame(index=[0], crs="EPSG:4326", geometry=[mask_geom])
            
            if gdf.crs is not None:
                mask_gdf = mask_gdf.to_crs(gdf.crs)
            else:
                gdf.set_crs(epsg=4326, inplace=True)
                mask_gdf.set_crs(epsg=4326, inplace=True)
                
            clipped = gpd.clip(gdf, mask_gdf)
            if clipped.empty:
                raise ValueError("Clipping resulted in empty geometry.")
                
            out_dir = Path(tmpdir) / "clipped"
            out_dir.mkdir()
            clipped.to_file(out_dir / "clipped.shp")
            
            out_buf = io.BytesIO()
            with zipfile.ZipFile(out_buf, "w", zipfile.ZIP_DEFLATED) as out_zf:
                for f in out_dir.rglob("*"):
                    if f.is_file():
                        out_zf.write(f, arcname=f.name)
                        
            return out_buf.getvalue(), f"clipped_{original_filename}"
            
    elif file_type == "geojson":
        import geopandas as gpd
        gdf = gpd.read_file(io.BytesIO(file_bytes))
        mask_gdf = gpd.GeoDataFrame(index=[0], crs="EPSG:4326", geometry=[mask_geom])
        if gdf.crs is None:
            gdf.set_crs(epsg=4326, inplace=True)
        else:
            mask_gdf = mask_gdf.to_crs(gdf.crs)
        clipped = gpd.clip(gdf, mask_gdf)
        if clipped.empty:
            raise ValueError("Clipping resulted in empty geometry.")
        return clipped.to_json().encode('utf-8'), f"clipped_{original_filename}"
        
    elif file_type == "csv":
        import pandas as pd
        df = pd.read_csv(io.BytesIO(file_bytes))
        cols_lower = {c.lower(): c for c in df.columns}
        lat_col = next((cols_lower[n] for n in ["lat", "latitude", "y"] if n in cols_lower), None)
        lon_col = next((cols_lower[n] for n in ["lon", "lng", "longitude", "x"] if n in cols_lower), None)
        
        if not lat_col or not lon_col:
            raise ValueError("Cannot clip CSV without lat/lon columns.")
            
        import geopandas as gpd
        gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df[lon_col], df[lat_col]), crs="EPSG:4326")
        mask_gdf = gpd.GeoDataFrame(index=[0], crs="EPSG:4326", geometry=[mask_geom])
        clipped = gpd.clip(gdf, mask_gdf)
        if clipped.empty:
            raise ValueError("Clipping resulted in empty geometry.")
            
        out_df = pd.DataFrame(clipped.drop(columns=['geometry']))
        out_buf = io.StringIO()
        out_df.to_csv(out_buf, index=False)
        return out_buf.getvalue().encode('utf-8'), f"clipped_{original_filename}"
        
    else:
        raise ValueError(f"Clipping is not supported for file type: {file_type}")

def get_dataset_preview(record: dict[str, Any], file_bytes: bytes) -> dict:
    file_type = record.get("file_type")
    
    if file_type in ["geojson", "shapefile"]:
        import geopandas as gpd
        import json
        
        if file_type == "shapefile":
            with tempfile.TemporaryDirectory() as tmpdir:
                with zipfile.ZipFile(io.BytesIO(file_bytes), 'r') as zf:
                    zf.extractall(tmpdir)
                shp_files = list(Path(tmpdir).rglob("*.shp"))
                if not shp_files:
                    raise ValueError("No .shp file found inside the zip.")
                gdf = gpd.read_file(shp_files[0])
        else:
            gdf = gpd.read_file(io.BytesIO(file_bytes))
            
        if gdf.crs is None:
            gdf.set_crs(epsg=4326, inplace=True)
        elif str(gdf.crs) != "EPSG:4326":
            gdf = gdf.to_crs(epsg=4326)
            
        return json.loads(gdf.to_json())
        
    elif file_type == "csv":
        import pandas as pd
        import geopandas as gpd
        import json
        
        df = pd.read_csv(io.BytesIO(file_bytes))
        cols_lower = {c.lower(): c for c in df.columns}
        lat_col = next((cols_lower[n] for n in ["lat", "latitude", "y"] if n in cols_lower), None)
        lon_col = next((cols_lower[n] for n in ["lon", "lng", "longitude", "x"] if n in cols_lower), None)
        
        if not lat_col or not lon_col:
            raise ValueError("Cannot preview CSV without lat/lon columns.")
            
        gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df[lon_col], df[lat_col]), crs="EPSG:4326")
        return json.loads(gdf.to_json())
        
    elif file_type == "tiff":
        import rasterio
        from rasterio.enums import Resampling
        import numpy as np
        from PIL import Image
        import base64
        
        with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp.flush()
            tmp_name = tmp.name
            
        try:
            with rasterio.open(tmp_name) as src:
                max_dim = 800
                scale = min(1.0, max_dim / max(src.width, src.height))
                
                out_shape = (
                    src.count,
                    int(src.height * scale),
                    int(src.width * scale)
                )
                
                data = src.read(
                    out_shape=out_shape,
                    resampling=Resampling.bilinear
                )
                
                bounds = src.bounds
                if src.crs is not None and str(src.crs) != "EPSG:4326":
                    from rasterio.warp import transform_bounds
                    bounds = transform_bounds(src.crs, "EPSG:4326", *bounds)
                    
                latlng_bounds = [[bounds[1], bounds[0]], [bounds[3], bounds[2]]]
                
                if src.count >= 3:
                    data = data[:3]
                else:
                    data = np.stack([data[0], data[0], data[0]])
                
                img_array = np.zeros((data.shape[1], data.shape[2], 4), dtype=np.uint8)
                img_array[:, :, 3] = 255
                
                for i in range(3):
                    band = data[i]
                    nodata = src.nodata if src.nodata is not None else 0
                    valid_mask = (band != nodata) & np.isfinite(band)
                    if valid_mask.any():
                        b_min, b_max = band[valid_mask].min(), band[valid_mask].max()
                        if b_max > b_min:
                            scaled = ((band - b_min) / (b_max - b_min) * 255)
                            img_array[:, :, i] = np.clip(scaled, 0, 255)
                        else:
                            img_array[:, :, i] = 0
                    
                    img_array[:, :, 3] = np.where(valid_mask, img_array[:, :, 3], 0)
                
                img = Image.fromarray(img_array, mode="RGBA")
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
                
                return {
                    "type": "raster",
                    "url": f"data:image/png;base64,{b64}",
                    "bounds": latlng_bounds
                }
        finally:
            Path(tmp_name).unlink(missing_ok=True)
            
    else:
        raise ValueError(f"Preview is not supported for file type: {file_type}")
