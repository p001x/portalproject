"""
RARE DATA — Dataset Repository storage layer (FastAPI backend version).
Adapted from rwanda-geoportal/utils/dataset_storage.py — Streamlit-free.
"""
from __future__ import annotations
import io, json, os, tempfile, uuid, zipfile
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import requests
from shapely.geometry import box, shape as shapely_shape

MAX_UPLOAD_MB = 50000
MAX_LINK_MB = 50000
LINK_KEY_PREFIX = "url::"

METADATA_KEYS = {"admin": "datasets_metadata.json", "community": "community_datasets_metadata.json"}
DATA_PREFIXES  = {"admin": "rare_data/files/",       "community": "rare_data/community_files/"}

_client: Optional[Any] = None

class LocalClient:
    def __init__(self, storage_dir: str):
        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)

    def _resolve_path(self, key: str) -> str:
        # 1. Try resolving directly inside storage_dir (e.g. backend/data/files/datasets_metadata.json)
        cleaned = key.replace('/', '_')
        p_direct = os.path.join(self.storage_dir, key)
        if os.path.exists(p_direct):
            return p_direct

        p_flat = os.path.join(self.storage_dir, cleaned)
        if os.path.exists(p_flat):
            return p_flat

        # 2. Try resolving relative to parent directory
        p_parent = os.path.normpath(os.path.join(self.storage_dir, "..", key))
        if os.path.exists(p_parent):
            return p_parent

        p_parent_flat = os.path.normpath(os.path.join(self.storage_dir, "..", cleaned))
        if os.path.exists(p_parent_flat):
            return p_parent_flat

        # 3. Try alt directory (metadata/files swap)
        alt_dir = os.path.abspath(os.path.join(self.storage_dir, "..", "files") if "metadata" in self.storage_dir else os.path.join(self.storage_dir, "..", "metadata"))
        p_alt = os.path.join(alt_dir, cleaned)
        if os.path.exists(p_alt):
            return p_alt

        return p_flat

    def upload_from_bytes(self, key: str, data: bytes) -> None:
        path = os.path.join(self.storage_dir, key.replace('/', '_'))
        with open(path, 'wb') as f:
            f.write(data)

    def upload_from_text(self, key: str, text: str) -> None:
        path = os.path.join(self.storage_dir, key.replace('/', '_'))
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)

    def download_as_bytes(self, key: str) -> bytes:
        path = self._resolve_path(key)
        with open(path, 'rb') as f:
            return f.read()

    def download_as_text(self, key: str) -> str:
        path = self._resolve_path(key)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            return ""

    def exists(self, key: str) -> bool:
        path = self._resolve_path(key)
        return os.path.exists(path)

    def delete(self, key: str) -> None:
        path = self._resolve_path(key)
        if os.path.exists(path):
            os.remove(path)

def _get_client():
    global _client
    if _client is None:
        _client = LocalClient(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "files")))
    return _client

def get_kaggle_api():
    import os
    try:
        from kaggle.api.kaggle_api_extended import KaggleApi
        token = os.environ.get('KAGGLE_API_TOKEN', '')
        if token and not os.environ.get('KAGGLE_KEY'):
            os.environ['KAGGLE_KEY'] = token
        api = KaggleApi()
        api.authenticate()
        return api
    except (SystemExit, Exception) as exc:
        raise RuntimeError(f"Kaggle API authentication is not configured: {exc}")

def push_to_kaggle(key: str, data: bytes, name: str) -> str:
    import tempfile
    import os
    
    if os.environ.get('KAGGLE_API_TOKEN', '') == '' and os.environ.get('KAGGLE_KEY', '') == '':
        _get_client().upload_from_bytes(key, data)
        return f"local://{key}"
        
    api = get_kaggle_api()
    username = api.get_config_value("username") or os.environ.get("KAGGLE_USERNAME") or "blacportal"
    dataset_slug = f"{username}/blacportal-datasets"
    
    with tempfile.TemporaryDirectory() as tmpdir:
        file_path = os.path.join(tmpdir, key.split("/")[-1])
        with open(file_path, "wb") as f:
            f.write(data)

        # We assume the dataset already exists. 
        # Alternatively we can upload it as a new version.
        try:
            api.dataset_create_version(tmpdir, version_notes=f"Added {name}", dir_mode="zip")
        except Exception as e:
            try:
                # If dataset does not exist, initialize it
                api.dataset_initialize(tmpdir)
                with open(os.path.join(tmpdir, "dataset-metadata.json"), "w") as f:
                    import json
                    json.dump({
                        "title": "Blacportal Datasets",
                        "id": dataset_slug,
                        "licenses": [{"name": "CC0-1.0"}]
                    }, f)
                api.dataset_create_new(tmpdir, dir_mode="zip")
            except Exception as inner_e:
                raise ValueError(f"Failed to push to Kaggle: {e} | {inner_e}")
                
    return f"kaggle://{dataset_slug}/{key.split('/')[-1]}"

def download_from_kaggle(kaggle_uri: str) -> bytes:
    import tempfile
    import os
    api = get_kaggle_api()
    # URI format: kaggle://username/dataset/filename
    parts = kaggle_uri.replace("kaggle://", "").split("/")
    if len(parts) < 3: raise ValueError("Invalid kaggle uri")
    dataset = f"{parts[0]}/{parts[1]}"
    filename = "/".join(parts[2:])
    
    with tempfile.TemporaryDirectory() as tmpdir:
        api.dataset_download_file(dataset, file_name=filename, path=tmpdir)
        downloaded = os.path.join(tmpdir, filename)
        # Kaggle might zip it
        if not os.path.exists(downloaded) and os.path.exists(downloaded + ".zip"):
            import zipfile
            with zipfile.ZipFile(downloaded + ".zip", 'r') as zip_ref:
                zip_ref.extractall(tmpdir)
        with open(downloaded, "rb") as f:
            return f.read()


@dataclass
class DatasetRecord:
    id: str
    name: str
    description: str
    file_type: str
    storage_key: str
    original_filename: str
    bbox: Optional[list[float]] = None
    upload_date: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    file_size_mb: float = 0.0
    status: str = "ok"
    error_message: Optional[str] = None
    source: str = "admin"
    contributor: Optional[str] = None
    source_url: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ── Metadata ────────────────────────────────────────────────────────────────

def load_metadata(source: str = "admin") -> list[dict[str, Any]]:
    client = _get_client()
    try:
        key = METADATA_KEYS[source]
        
        with open("C:/Users/user/Documents/blacportal/backend/debug_metadata.txt", "w") as f:
            f.write(f"Source: {source}\n")
            f.write(f"Key: {key}\n")
            f.write(f"Exists: {client.exists(key)}\n")
            if client.exists(key):
                raw = client.download_as_text(key)
                f.write(f"Raw length: {len(raw)}\n")
                data = json.loads(raw)
                f.write(f"Parsed length: {len(data) if isinstance(data, list) else 'not list'}\n")
            
        if not client.exists(key):
            return []
        raw = client.download_as_text(key)
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except Exception as e:
        with open("C:/Users/user/Documents/blacportal/backend/debug_metadata_error.txt", "w") as f:
            f.write(str(e))
        return []


def save_metadata(records: list[dict[str, Any]], source: str = "admin") -> None:
    client = _get_client()
    client.upload_from_text(METADATA_KEYS[source], json.dumps(records, indent=2))

def get_dataset_data(dataset_id: str, source: str = "admin") -> bytes:
    records = load_metadata(source=source)
    record_dict = next((r for r in records if r["id"] == dataset_id), None)
    if not record_dict:
        raise KeyError("Dataset not found")
    
    return download_dataset_bytes(record_dict["storage_key"])


def add_record(record: DatasetRecord, source: str = "admin") -> None:
    records = load_metadata(source=source)
    records.append(record.to_dict())
    save_metadata(records, source=source)


def delete_record(dataset_id: str, source: str = "admin") -> bool:
    records = load_metadata(source=source)
    target = next((r for r in records if r["id"] == dataset_id), None)
    if target is None:
        return False
    if not target["storage_key"].startswith(LINK_KEY_PREFIX):
        client = _get_client()
        try:
            if client.exists(target["storage_key"]):
                client.delete(target["storage_key"])
        except Exception:
            pass
    remaining = [r for r in records if r["id"] != dataset_id]
    try:
        save_metadata(remaining, source=source)
    except Exception:
        return False
    return True


# ── Bbox extraction ─────────────────────────────────────────────────────────

def extract_tiff_bbox(file_bytes: bytes) -> list[float]:
    import rasterio
    from rasterio.warp import transform_bounds
    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp.flush()
        tmp_name = tmp.name
        
    try:
        with rasterio.open(tmp_name) as src:
            b = src.bounds
            if src.crs is None:
                return [b.left, b.bottom, b.right, b.top]
            minx, miny, maxx, maxy = transform_bounds(src.crs, "EPSG:4326", b.left, b.bottom, b.right, b.top)
            return [minx, miny, maxx, maxy]
    finally:
        import os
        try:
            os.unlink(tmp_name)
        except Exception:
            pass


MAX_ZIP_MEMBERS = 200

def safe_extractall(zf: zipfile.ZipFile, dest_dir: str) -> None:
    dest_root = Path(dest_dir).resolve()
    for member in zf.infolist():
        member_path = (dest_root / member.filename).resolve()
        if not str(member_path).startswith(str(dest_root) + os.sep) and member_path != dest_root:
            raise ValueError(f"Unsafe path: {member.filename!r}")
    if len(zf.infolist()) > MAX_ZIP_MEMBERS:
        raise ValueError("Too many entries in zip.")
    zf.extractall(dest_dir)


def extract_shapefile_bbox(zip_bytes: bytes) -> tuple[list[float], bytes]:
    import geopandas as gpd
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_zip = Path(tmpdir) / "upload.zip"
        tmp_zip.write_bytes(zip_bytes)
        with zipfile.ZipFile(tmp_zip) as zf:
            safe_extractall(zf, tmpdir)
        shp_files = list(Path(tmpdir).glob("**/*.shp"))
        if not shp_files:
            raise ValueError("No .shp file found inside the uploaded zip.")
        gdf = gpd.read_file(shp_files[0])
        if gdf.crs is not None and str(gdf.crs) != "EPSG:4326":
            gdf = gdf.to_crs("EPSG:4326")
        minx, miny, maxx, maxy = gdf.total_bounds.tolist()
        out_buf = io.BytesIO()
        with zipfile.ZipFile(out_buf, "w", zipfile.ZIP_DEFLATED) as out_zf:
            for f in Path(tmpdir).rglob("*"):
                if f.is_file() and f.name != "upload.zip":
                    out_zf.write(f, arcname=f.name)
        return [minx, miny, maxx, maxy], out_buf.getvalue()


_LAT_NAMES = {"lat", "latitude", "y"}
_LON_NAMES = {"lon", "lng", "longitude", "x"}

def extract_csv_bbox(file_bytes: bytes) -> Optional[list[float]]:
    import pandas as pd
    df = pd.read_csv(io.BytesIO(file_bytes))
    cols_lower = {c.lower(): c for c in df.columns}
    lat_col = next((cols_lower[n] for n in _LAT_NAMES if n in cols_lower), None)
    lon_col = next((cols_lower[n] for n in _LON_NAMES if n in cols_lower), None)
    if lat_col is None or lon_col is None:
        return None
    coords = pd.DataFrame({"lat": pd.to_numeric(df[lat_col], errors="coerce"),
                            "lon": pd.to_numeric(df[lon_col], errors="coerce")}).dropna()
    if coords.empty:
        return None
    return [float(coords["lon"].min()), float(coords["lat"].min()),
            float(coords["lon"].max()), float(coords["lat"].max())]


# ── Upload / link ───────────────────────────────────────────────────────────

def detect_file_type(filename: str) -> str:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext in {"tif", "tiff"}: return "tiff"
    if ext == "csv": return "csv"
    if ext == "zip": return "shapefile"
    return "other"


def normalize_github_url(url: str) -> str:
    url = url.strip()
    if "github.com" in url and "/blob/" in url and "raw.githubusercontent.com" not in url:
        url = url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/")
    return url


def fetch_url_bytes(url: str, max_mb: float = MAX_LINK_MB) -> bytes:
    from storage.link_resolver import resolve_link
    file_bytes, _, _ = resolve_link(url, max_mb)
    return file_bytes


def filename_from_url(url: str) -> str:
    from urllib.parse import urlparse
    path = urlparse(url).path
    return path.rsplit("/", 1)[-1] or "dataset"


def process_and_store_upload(filename: str, file_bytes: bytes, name: str,
                              description: str, source: str = "admin",
                              contributor: Optional[str] = None) -> DatasetRecord:
    size_mb = len(file_bytes) / (1024 * 1024)
    file_type = detect_file_type(filename)
    dataset_id = str(uuid.uuid4())
    data_prefix = DATA_PREFIXES[source]
    storage_key = f"{data_prefix}{dataset_id}_{filename}"
    bbox: Optional[list[float]] = None
    status = "ok"
    error_message = None
    bytes_to_store = file_bytes
    try:
        if size_mb > MAX_UPLOAD_MB:
            raise ValueError(f"File is {size_mb:.1f} MB, exceeds {MAX_UPLOAD_MB} MB cap.")
        if file_type == "shapefile":
            storage_key = f"{data_prefix}{dataset_id}.zip"
            
        if file_type == "tiff":
            try:
                bbox = extract_tiff_bbox(file_bytes)
            except Exception:
                pass
        elif file_type == "shapefile":
            try:
                bbox, _ = extract_shapefile_bbox(file_bytes)
            except Exception:
                pass
        elif file_type == "csv":
            try:
                bbox = extract_csv_bbox(file_bytes)
            except Exception:
                pass
    except Exception as e:
        status = "error"; error_message = str(e)
    if status != "error":
        try:
            storage_key = push_to_kaggle(storage_key, bytes_to_store, name or filename)
        except Exception as e:
            status = "error"; error_message = f"Failed to save to Kaggle: {e}"
    record = DatasetRecord(id=dataset_id, name=name, description=description, file_type=file_type,
                           storage_key=storage_key, original_filename=filename, bbox=bbox,
                           file_size_mb=round(size_mb, 3), status=status, error_message=error_message,
                           source=source, contributor=contributor)
    try:
        add_record(record, source=source)
    except Exception as e:
        record.status = "error"; record.error_message = f"File saved but metadata failed: {e}"
    return record


def process_and_store_link(url: str, name: str, description: str,
                            source: str = "admin", contributor: Optional[str] = None) -> DatasetRecord:
    from storage.link_resolver import resolve_link_url, resolve_link
    raw_url = normalize_github_url(url)
    
    status = "ok"; error_message = None; size_mb = 0.0
    bbox: Optional[list[float]] = None
    file_type = "other"
    resolved_url = raw_url
    filename = filename_from_url(raw_url)

    try:
        resolved_url = resolve_link_url(raw_url)
        
        import requests
        from storage.link_resolver import _filename_from_response
        try:
            # Add Kaggle auth header for HEAD request if needed
            head_headers = {}
            if "kaggle.com" in resolved_url:
                import os
                if "KAGGLE_API_TOKEN" in os.environ:
                    head_headers["Authorization"] = f"Bearer {os.environ['KAGGLE_API_TOKEN']}"
            head_resp = requests.head(resolved_url, allow_redirects=True, timeout=5, headers=head_headers)
            filename = _filename_from_response(head_resp, resolved_url)
        except Exception:
            filename = filename_from_url(resolved_url)
            
        file_type = detect_file_type(filename)
        if file_type == "other":
            file_type = detect_file_type(name)
            if file_type != "other":
                filename = name
            elif "drive.google.com" in resolved_url or "drive.usercontent.google.com" in resolved_url:
                file_type = "tiff"
                filename = name + ".tif"
        
        if file_type == "tiff":
            import rasterio
            import os
            env_kwargs = {}
            if "kaggle.com" in resolved_url:
                if "KAGGLE_API_TOKEN" in os.environ:
                    env_kwargs["GDAL_HTTP_HEADER_AUTHORIZATION"] = f"Bearer {os.environ['KAGGLE_API_TOKEN']}"
            
            with rasterio.Env(**env_kwargs):
                with rasterio.open(resolved_url) as src:
                    b = src.bounds
                    bbox = [b.left, b.bottom, b.right, b.top]
                    if src.crs and str(src.crs) != "EPSG:4326":
                        from rasterio.warp import transform_bounds
                        bbox = list(transform_bounds(src.crs, "EPSG:4326", *bbox))
                        
        elif file_type == "csv":
            import pandas as pd
            df = pd.read_csv(resolved_url)
            cols = {c.lower(): c for c in df.columns}
            lat = next((cols[n] for n in _LAT_NAMES if n in cols), None)
            lon = next((cols[n] for n in _LON_NAMES if n in cols), None)
            if lat and lon:
                bbox = [float(df[lon].min()), float(df[lat].min()), float(df[lon].max()), float(df[lat].max())]
            else:
                status = "non-spatial"
                
        elif file_type == "shapefile":
            # For zip shapefiles, geopandas read_file doesn't support streaming perfectly, fallback to download
            file_bytes, _, _ = resolve_link(raw_url, MAX_LINK_MB)
            size_mb = len(file_bytes) / (1024 * 1024)
            bbox, _ = extract_shapefile_bbox(file_bytes)
        
        else:
            status = "non-spatial"
            
    except Exception as e:
        status = "error"
        err_str = str(e)
        if "async" in err_str or "HTML" in err_str or "doctype" in err_str.lower():
            error_message = "Could not read TIFF remotely. The host (e.g. Google Drive/Kaggle) returned a web page (like a virus scan warning) instead of the raw file."
        else:
            error_message = f"Could not fetch/parse metadata remotely: {err_str}"

    dataset_id = str(uuid.uuid4())
    storage_key = f"{LINK_KEY_PREFIX}{raw_url}"
    
    record = DatasetRecord(id=dataset_id, name=name, description=description, file_type=file_type,
                           storage_key=storage_key, original_filename=filename, bbox=bbox,
                           status=status, error_message=error_message, source=source,
                           contributor=contributor, source_url=raw_url, file_size_mb=0)
    try:
        add_record(record, source=source)
    except Exception as e:
        record.status = "error"; record.error_message = f"Link registered but metadata failed: {e}"
    return record


def download_dataset_bytes(storage_key: str) -> bytes:
    if storage_key.startswith(LINK_KEY_PREFIX):
        from storage.link_resolver import resolve_link
        file_bytes, _, _ = resolve_link(storage_key[len(LINK_KEY_PREFIX):], max_mb=5000)
        return file_bytes
    if storage_key.startswith("kaggle://"):
        return download_from_kaggle(storage_key)
    if storage_key.startswith("local://"):
        storage_key = storage_key[8:]
    elif storage_key.startswith("local::"):
        storage_key = storage_key[7:]
    return _get_client().download_as_bytes(storage_key)


def get_dataset_local_path(storage_key: str) -> Optional[str]:
    if storage_key.startswith(LINK_KEY_PREFIX) or storage_key.startswith("kaggle://"):
        return None
    if storage_key.startswith("local://"):
        storage_key = storage_key[8:]
    elif storage_key.startswith("local::"):
        storage_key = storage_key[7:]
    
    client = _get_client()
    if client.exists(storage_key):
        return client._resolve_path(storage_key)
    return None


def build_zip_of_datasets(records: list[dict[str, Any]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for r in records:
            try:
                data = download_dataset_bytes(r["storage_key"])
                zf.writestr(r["original_filename"], data)
            except Exception:
                continue
    return buf.getvalue()


def bbox_to_box(bbox: list[float]):
    return box(*bbox)


def datasets_intersecting(records: list[dict[str, Any]], area_geojson: Optional[dict]) -> list[dict[str, Any]]:
    spatial = [r for r in records if r.get("bbox")]
    if area_geojson is None:
        return spatial
    try:
        area_geom = shapely_shape(area_geojson)
    except Exception:
        return spatial
    return [r for r in spatial if bbox_to_box(r["bbox"]).intersects(area_geom)]


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

def get_dataset_preview(record: dict[str, Any], file_bytes: Optional[bytes] = None) -> dict:
    file_type = record.get("file_type")
    is_url = record.get("storage_key", "").startswith(LINK_KEY_PREFIX)
    raw_url = record.get("storage_key", "")[len(LINK_KEY_PREFIX):] if is_url else None
    
    url = None
    if is_url and raw_url:
        from storage.link_resolver import resolve_link_url
        url = resolve_link_url(raw_url)

    if file_type in ["geojson", "shapefile"]:
        import geopandas as gpd
        import json
        
        if file_type == "shapefile":
            if file_bytes is None and is_url:
                file_bytes = download_dataset_bytes(record["storage_key"])
                
            with tempfile.TemporaryDirectory() as tmpdir:
                with zipfile.ZipFile(io.BytesIO(file_bytes), 'r') as zf:
                    zf.extractall(tmpdir)
                shp_files = list(Path(tmpdir).rglob("*.shp"))
                if not shp_files:
                    raise ValueError("No .shp file found inside the zip.")
                gdf = gpd.read_file(shp_files[0])
        else:
            if file_bytes is not None:
                gdf = gpd.read_file(io.BytesIO(file_bytes))
            else:
                gdf = gpd.read_file(url)
            
        if gdf.crs is None:
            gdf.set_crs(epsg=4326, inplace=True)
        elif str(gdf.crs) != "EPSG:4326":
            gdf = gdf.to_crs(epsg=4326)
            
        return json.loads(gdf.to_json())
        
    elif file_type == "csv":
        import pandas as pd
        import geopandas as gpd
        import json
        
        if file_bytes is not None:
            df = pd.read_csv(io.BytesIO(file_bytes))
        else:
            df = pd.read_csv(url)
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
        
        import os
        
        env_kwargs = {}
        if is_url and url and "kaggle.com" in url:
            if "KAGGLE_API_TOKEN" in os.environ:
                env_kwargs["GDAL_HTTP_HEADER_AUTHORIZATION"] = f"Bearer {os.environ['KAGGLE_API_TOKEN']}"
                
        src_path = url if is_url and file_bytes is None else None
        
        if not src_path:
            tmp = tempfile.NamedTemporaryFile(suffix=".tif", delete=False)
            tmp.write(file_bytes)
            tmp.flush()
            tmp.close()
            src_path = tmp.name
            
        try:
            with rasterio.Env(**env_kwargs):
                with rasterio.open(src_path) as src:
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
                    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                    
                    return {
                        "type": "image",
                        "data": f"data:image/png;base64,{b64}",
                        "bounds": latlng_bounds
                    }
        finally:
            if not (is_url and file_bytes is None):
                Path(src_path).unlink(missing_ok=True)
            
    else:
        raise ValueError(f"Preview is not supported for file type: {file_type}")
