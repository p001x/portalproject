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

import threading
_metadata_lock = threading.Lock()

class LocalClient:
    def __init__(self, storage_dir: str):
        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)

    def _resolve_path(self, key: str) -> str:
        # 1. Clean prefixes and trailing artifacts
        stripped = key
        for prefix in ("local://", "local::", "kaggle://", "hf://", "r2://"):
            if stripped.startswith(prefix):
                stripped = stripped[len(prefix):]
                break

        import re
        stripped = re.sub(r'\s*-\s*Google\s*Drive\s*$', '', stripped).strip()
        cleaned = stripped.replace('/', '_')
        base_name = os.path.basename(stripped)
        candidates = [stripped, cleaned, base_name]

        # Directories to search
        dirs_to_search = [self.storage_dir]
        kaggle_dir = os.path.normpath(os.path.join(self.storage_dir, "..", "kaggle_cache"))
        if os.path.exists(kaggle_dir):
            dirs_to_search.append(kaggle_dir)
        alt_dir = os.path.abspath(os.path.join(self.storage_dir, "..", "files") if "metadata" in self.storage_dir else os.path.join(self.storage_dir, "..", "metadata"))
        if os.path.exists(alt_dir) and alt_dir not in dirs_to_search:
            dirs_to_search.append(alt_dir)

        # 1. Direct candidate matching
        for d in dirs_to_search:
            if not os.path.exists(d):
                continue
            for cand in candidates:
                p = os.path.join(d, cand)
                if os.path.exists(p) and os.path.isfile(p):
                    return p

        # 2. Match by UUID prefix if key has uuid
        uuid_part = base_name.split("_")[0] if "_" in base_name else None
        if uuid_part and len(uuid_part) >= 8:
            for d in dirs_to_search:
                if os.path.exists(d):
                    for fname in os.listdir(d):
                        if uuid_part in fname:
                            p = os.path.join(d, fname)
                            if os.path.isfile(p):
                                return p

        # 3. Match by partial base_name
        if len(base_name) > 3:
            for d in dirs_to_search:
                if os.path.exists(d):
                    for fname in os.listdir(d):
                        if fname.endswith(base_name) or base_name in fname:
                            p = os.path.join(d, fname)
                            if os.path.isfile(p):
                                return p

        return os.path.join(self.storage_dir, cleaned)

    def upload_from_file(self, key: str, file_path: str) -> None:
        import shutil
        path = os.path.join(self.storage_dir, key.replace('/', '_'))
        shutil.copyfile(file_path, path)

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

class S3Client:
    def __init__(self, endpoint_url: str, access_key: str, secret_key: str, bucket_name: str, public_url: str = ""):
        self.bucket_name = bucket_name
        self.public_url = public_url.rstrip("/")
        self.local_client = LocalClient(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "files")))
        self.s3 = None
        try:
            import boto3
        except ImportError:
            import subprocess, sys, logging
            try:
                logging.info("Attempting to auto-install boto3...")
                subprocess.run([sys.executable, "-m", "pip", "install", "boto3", "boto3-stubs"], check=True)
            except Exception as e:
                logging.error(f"Failed to auto-install boto3: {e}")
        
        try:
            import boto3
            from botocore.config import Config
            self.s3 = boto3.client(
                's3',
                endpoint_url=endpoint_url,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                config=Config(signature_version='s3v4')
            )
        except Exception as e:
            import logging
            logging.error(f"boto3 is not available. Cloudflare R2 uploads will fail. {e}")

    @property
    def storage_dir(self) -> str:
        return self.local_client.storage_dir

    def _clean_key(self, key: str) -> str:
        clean = key
        if clean.startswith("r2://"):
            parts = clean.replace("r2://", "").split("/", 1)
            if len(parts) > 1:
                clean = parts[1]
        elif clean.startswith("local://"):
            clean = clean[8:]
        elif clean.startswith("local::"):
            clean = clean[7:]
        return clean

    def _resolve_path(self, key: str) -> str:
        return self.local_client._resolve_path(self._clean_key(key))

    def upload_from_file(self, key: str, file_path: str) -> None:
        clean = self._clean_key(key)
        try:
            self.local_client.upload_from_file(clean, file_path)
        except Exception:
            pass
        if self.s3:
            try:
                self.s3.upload_file(file_path, self.bucket_name, clean)
            except Exception as e:
                import logging
                logging.error(f"S3 upload error: {e}")

    def upload_from_bytes(self, key: str, data: bytes) -> None:
        clean = self._clean_key(key)
        try:
            self.local_client.upload_from_bytes(clean, data)
        except Exception:
            pass
        if self.s3:
            try:
                self.s3.put_object(Bucket=self.bucket_name, Key=clean, Body=data)
            except Exception as e:
                import logging
                logging.error(f"S3 upload error: {e}")

    def upload_from_text(self, key: str, text: str) -> None:
        clean = self._clean_key(key)
        try:
            self.local_client.upload_from_text(clean, text)
        except Exception:
            pass
        if self.s3:
            try:
                self.s3.put_object(Bucket=self.bucket_name, Key=clean, Body=text.encode('utf-8'))
            except Exception as e:
                import logging
                logging.error(f"S3 upload error: {e}")

    def download_as_bytes(self, key: str) -> bytes:
        clean = self._clean_key(key)
        if self.s3:
            try:
                response = self.s3.get_object(Bucket=self.bucket_name, Key=clean)
                return response['Body'].read()
            except Exception:
                pass
        return self.local_client.download_as_bytes(clean)

    def download_as_text(self, key: str) -> str:
        clean = self._clean_key(key)
        if self.s3:
            try:
                response = self.s3.get_object(Bucket=self.bucket_name, Key=clean)
                return response['Body'].read().decode('utf-8')
            except Exception:
                pass
        return self.local_client.download_as_text(clean)

    def exists(self, key: str) -> bool:
        clean = self._clean_key(key)
        if self.s3:
            try:
                self.s3.head_object(Bucket=self.bucket_name, Key=clean)
                return True
            except Exception:
                pass
        return self.local_client.exists(clean)

    def get_presigned_url(self, key: str, expires_in: int = 3600) -> str:
        if self.s3 is None: return ""
        clean = self._clean_key(key)
        try:
            return self.s3.generate_presigned_url(
                ClientMethod='get_object',
                Params={'Bucket': self.bucket_name, 'Key': clean},
                ExpiresIn=expires_in
            )
        except Exception:
            return ""

    def delete(self, key: str) -> None:
        clean = self._clean_key(key)
        try:
            self.local_client.delete(clean)
        except Exception:
            pass
        if self.s3:
            try:
                self.s3.delete_object(Bucket=self.bucket_name, Key=clean)
            except Exception:
                pass

def _get_client():
    global _client
    if _client is None:
        import os
        r2_endpoint = os.environ.get("R2_ENDPOINT_URL")
        r2_access = os.environ.get("R2_ACCESS_KEY_ID")
        r2_secret = os.environ.get("R2_SECRET_ACCESS_KEY")
        r2_bucket = os.environ.get("R2_BUCKET_NAME")
        r2_public = os.environ.get("R2_PUBLIC_URL", "")

        if r2_endpoint and r2_access and r2_secret and r2_bucket:
            _client = S3Client(r2_endpoint, r2_access, r2_secret, r2_bucket, r2_public)
        else:
            _client = LocalClient(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "files")))
    return _client


def push_to_storage(key: str, data: Optional[bytes], name: str, progress_callback=None, file_path: Optional[str] = None) -> str:
    from dotenv import load_dotenv
    load_dotenv()

    if data is None and file_path is None:
        raise ValueError("Must provide either data or file_path")

    import os
    import tempfile
    import logging

    client = _get_client()
    hf_token = os.environ.get("HF_TOKEN", "").strip()
    repo_id = os.environ.get("HF_REPO_ID", "petersstore/blacportal-datasets").strip()

    # 1. Direct Hugging Face Storage (Primary Target for all uploads)
    if hf_token:
        try:
            from huggingface_hub import HfApi, create_repo
            api = HfApi(token=hf_token)
            try:
                create_repo(repo_id, repo_type="dataset", exist_ok=True, token=hf_token)
            except Exception as e:
                logging.info(f"HF repository check: {e}")

            filename = key.split("/")[-1]
            tmp_path = file_path
            cleanup_tmp = False

            if tmp_path is None:
                with tempfile.NamedTemporaryFile(delete=False) as tmp:
                    tmp.write(data)
                    tmp.flush()
                    tmp_path = tmp.name
                    cleanup_tmp = True

            try:
                # Use file path directly — HfApi natively handles all file sizes (up to 50 GB)
                # with multipart chunking, stream resumption, and zero RAM spikes.
                api.upload_file(
                    path_or_fileobj=tmp_path,
                    path_in_repo=filename,
                    repo_id=repo_id,
                    repo_type="dataset",
                    commit_message=f"Added dataset: {name} ({filename})"
                )
                logging.info(f"Direct HF upload successful: {filename} -> {repo_id}")

                # Secondary backup to R2 or local if available
                if client.__class__.__name__ == "S3Client":
                    try:
                        clean_k = client._clean_key(key) if hasattr(client, "_clean_key") else key
                        client.upload_from_file(clean_k, tmp_path)
                    except Exception as s3_err:
                        logging.warning(f"R2 secondary sync warning: {s3_err}")
                elif hasattr(client, "upload_from_file"):
                    try:
                        client.upload_from_file(key, tmp_path)
                    except Exception:
                        pass

                return f"hf://{repo_id}/{filename}"
            finally:
                if cleanup_tmp and os.path.exists(tmp_path):
                    try:
                        os.unlink(tmp_path)
                    except Exception:
                        pass
        except Exception as e:
            logging.error(f"Hugging Face direct upload error: {e}")
            raise ValueError(f"Failed to push to Hugging Face ({repo_id}): {e}")

    # 2. Fallback to Cloudflare R2 if configured and no HF_TOKEN
    if client.__class__.__name__ == "S3Client":
        clean_k = client._clean_key(key) if hasattr(client, "_clean_key") else key
        if file_path is not None and hasattr(client, "upload_from_file"):
            client.upload_from_file(clean_k, file_path)
        elif data is not None:
            client.upload_from_bytes(clean_k, data)
        else:
            with open(file_path, "rb") as f:
                client.upload_from_bytes(clean_k, f.read())
        return f"r2://{client.bucket_name}/{clean_k}"

    # 3. Fallback to local filesystem
    if file_path is not None and hasattr(client, "upload_from_file"):
        client.upload_from_file(key, file_path)
    elif data is not None:
        client.upload_from_bytes(key, data)
    return f"local://{key}"




def _delete_from_huggingface(filename: str) -> None:
    import os
    import logging
    hf_token = os.environ.get("HF_TOKEN")
    repo_id = os.environ.get("HF_REPO_ID", "petersstore/blacportal-datasets")
    if not hf_token:
        return
        
    try:
        from huggingface_hub import HfApi
        api = HfApi(token=hf_token)
        api.delete_file(
            path_in_repo=filename,
            repo_id=repo_id,
            repo_type="dataset",
            commit_message=f"Delete dataset: {filename}"
        )
        logging.info(f"Successfully deleted {filename} from Hugging Face: {repo_id}")
    except ImportError:
        pass
    except Exception as e:
        logging.error(f"Failed to delete {filename} from Hugging Face: {e}")


def get_kaggle_api():
    """Safely obtain an authenticated KaggleApi instance, handling sandboxed config dirs gracefully."""
    import os
    import tempfile
    import logging
    try:
        # Prevent PermissionError on restricted Windows/Docker environments
        safe_home = os.path.join(tempfile.gettempdir(), ".kaggle_env")
        os.makedirs(safe_home, exist_ok=True)
        if "KAGGLE_CONFIG_DIR" not in os.environ:
            os.environ["KAGGLE_CONFIG_DIR"] = safe_home
        if "USERPROFILE" not in os.environ or os.environ.get("USERPROFILE") == r"C:\Users\user":
            os.environ["USERPROFILE"] = safe_home
        from kaggle.api.kaggle_api_extended import KaggleApi
        api = KaggleApi()
        api.authenticate()
        return api
    except Exception as e:
        logging.warning(f"KaggleApi auth not configured or failed: {e}")
        return None


def download_from_kaggle(kaggle_uri: str, fallback_url: Optional[str] = None) -> bytes:
    """
    Download a dataset file from Kaggle using multiple fallback tiers:
    1. Local storage / cache check (including smart base filename & UUID matching)
    2. Direct Kaggle REST API (returns public pre-signed GCS download URL via 302 redirect)
    3. Official Kaggle CLI / Python SDK
    4. Hugging Face dataset mirror check
    5. Provided fallback_url (e.g. Google Drive) via link_resolver
    """
    import os
    import re
    import io
    import tempfile
    import urllib.parse
    import zipfile
    import logging
    import requests

    # 1. Parse URI (kaggle://username/dataset/filename)
    clean_uri = kaggle_uri.replace("kaggle://", "").strip()
    parts = clean_uri.split("/")
    if len(parts) < 3:
        raise ValueError(f"Invalid kaggle uri: {kaggle_uri}")
    dataset = f"{parts[0]}/{parts[1]}"
    filename = "/".join(parts[2:])

    # Clean any trailing artifacts like " - Google Drive" from filename
    clean_filename = re.sub(r'\s*-\s*Google\s*Drive\s*$', '', filename).strip()

    # 2. Check local client / storage directory first
    client = _get_client()
    if client.exists(clean_filename):
        try:
            return client.download_as_bytes(clean_filename)
        except Exception:
            pass
    if client.exists(filename):
        try:
            return client.download_as_bytes(filename)
        except Exception:
            pass

    search_dirs = []
    storage_dir = getattr(client, "storage_dir", None)
    if storage_dir and os.path.exists(storage_dir):
        search_dirs.append(storage_dir)
    backend_kaggle_cache = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "data", "kaggle_cache"))
    if os.path.exists(backend_kaggle_cache) and backend_kaggle_cache not in search_dirs:
        search_dirs.append(backend_kaggle_cache)

    for s_dir in search_dirs:
        for cand in [clean_filename, filename, os.path.basename(clean_filename)]:
            direct_path = os.path.join(s_dir, cand)
            if os.path.exists(direct_path) and os.path.isfile(direct_path):
                with open(direct_path, "rb") as f:
                    return f.read()

        uuid_part = clean_filename.split("_")[0] if "_" in clean_filename else None
        if uuid_part and len(uuid_part) >= 8:
            for fname in os.listdir(s_dir):
                if uuid_part in fname:
                    full_p = os.path.join(s_dir, fname)
                    if os.path.isfile(full_p):
                        with open(full_p, "rb") as f:
                            return f.read()

        # Match by base filename without UUID prefix
        base_name = clean_filename.split("_", 1)[1] if "_" in clean_filename else clean_filename
        if base_name and len(base_name) > 3:
            for fname in os.listdir(s_dir):
                if fname.endswith(base_name) or base_name in fname:
                    full_p = os.path.join(s_dir, fname)
                    if os.path.isfile(full_p):
                        with open(full_p, "rb") as f:
                            return f.read()

    # Check local disk cache
    cache_dir = os.path.join(tempfile.gettempdir(), "blacportal_kaggle_cache", dataset.replace("/", "_"))
    os.makedirs(cache_dir, exist_ok=True)
    cached_path = os.path.join(cache_dir, clean_filename.replace("/", "_"))
    if os.path.exists(cached_path) and os.path.getsize(cached_path) > 0:
        try:
            with open(cached_path, "rb") as f:
                return f.read()
        except Exception:
            pass

    # 3. Check Hugging Face public mirror first (fastest, reliable CDN, public)
    hf_repo = os.environ.get("HF_REPO_ID", "petersstore/blacportal-datasets")
    hf_token = os.environ.get("HF_TOKEN")
    candidates = [clean_filename]
    if clean_filename != filename:
        candidates.append(filename)
    base_name = clean_filename.split("_", 1)[1] if "_" in clean_filename else clean_filename
    if base_name and base_name not in candidates:
        candidates.append(base_name)

    for cand in candidates:
        hf_url = f"https://huggingface.co/datasets/{hf_repo}/resolve/main/{urllib.parse.quote(cand)}?download=true"
        hf_headers = {"User-Agent": "SPETRO-GeoPortal/2.0"}
        if hf_token:
            hf_headers["Authorization"] = f"Bearer {hf_token}"
        try:
            hf_resp = requests.get(hf_url, headers=hf_headers, timeout=60, stream=True)
            if hf_resp.status_code == 200:
                raw_bytes = hf_resp.content
                if raw_bytes and len(raw_bytes) > 1000:
                    try:
                        with open(cached_path, "wb") as f:
                            f.write(raw_bytes)
                    except Exception:
                        pass
                    return raw_bytes
        except Exception as e:
            logging.warning(f"HF mirror check for {cand} failed: {e}")

    # 4. Direct HTTP download from Kaggle public API endpoint
    for cand in candidates:
        quoted = urllib.parse.quote(cand)
        url = f"https://www.kaggle.com/api/v1/datasets/download/{dataset}/{quoted}"
        headers = {"User-Agent": "SPETRO-GeoPortal/2.0"}

        if "KAGGLE_API_TOKEN" in os.environ:
            headers["Authorization"] = f"Bearer {os.environ['KAGGLE_API_TOKEN']}"
        auth = None
        if "KAGGLE_USERNAME" in os.environ and "KAGGLE_KEY" in os.environ:
            auth = (os.environ["KAGGLE_USERNAME"], os.environ["KAGGLE_KEY"])

        try:
            resp = requests.get(url, headers=headers, auth=auth, allow_redirects=True, timeout=120, stream=True)
            if resp.status_code == 200:
                raw_bytes = resp.content
                # If Kaggle wrapped download in a zip archive, extract target file
                if raw_bytes[:4] == b"PK\x03\x04":
                    with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
                        names = zf.namelist()
                        target = next((n for n in names if n == cand or n.endswith(cand)), names[0] if names else None)
                        if target:
                            raw_bytes = zf.read(target)
                if raw_bytes:
                    try:
                        with open(cached_path, "wb") as f:
                            f.write(raw_bytes)
                    except Exception:
                        pass
                    return raw_bytes
        except Exception as e:
            logging.warning(f"Kaggle HTTP direct download failed for {cand}: {e}")

    # 4. Try Kaggle Python SDK
    api = get_kaggle_api()
    if api:
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                api.dataset_download_file(dataset, file_name=clean_filename, path=tmpdir)
                downloaded = os.path.join(tmpdir, clean_filename)
                if not os.path.exists(downloaded) and os.path.exists(downloaded + ".zip"):
                    with zipfile.ZipFile(downloaded + ".zip", "r") as zip_ref:
                        zip_ref.extractall(tmpdir)
                if os.path.exists(downloaded):
                    with open(downloaded, "rb") as f:
                        file_bytes = f.read()
                    try:
                        with open(cached_path, "wb") as f:
                            f.write(file_bytes)
                    except Exception:
                        pass
                    return file_bytes
        except Exception as e:
            logging.warning(f"Kaggle API dataset_download_file failed: {e}")

    # 5. Check Hugging Face mirror
    hf_repo = os.environ.get("HF_REPO_ID", "petersstore/blacportal-datasets")
    hf_token = os.environ.get("HF_TOKEN")
    for cand in candidates:
        hf_url = f"https://huggingface.co/datasets/{hf_repo}/resolve/main/{urllib.parse.quote(cand)}?download=true"
        hf_headers = {"Authorization": f"Bearer {hf_token}"} if hf_token else {}
        try:
            hf_resp = requests.get(hf_url, headers=hf_headers, timeout=60, stream=True)
            if hf_resp.status_code == 200:
                raw_bytes = hf_resp.content
                if raw_bytes:
                    try:
                        with open(cached_path, "wb") as f:
                            f.write(raw_bytes)
                    except Exception:
                        pass
                    return raw_bytes
        except Exception as e:
            logging.warning(f"HF mirror check for {cand} failed: {e}")

    # 6. Fallback to source_url (e.g. Google Drive) if provided
    if fallback_url:
        try:
            from storage.link_resolver import resolve_link
            fb_bytes, _, _ = resolve_link(fallback_url, max_mb=5000)
            if fb_bytes:
                try:
                    with open(cached_path, "wb") as f:
                        f.write(fb_bytes)
                except Exception:
                    pass
                return fb_bytes
        except Exception as e:
            logging.warning(f"Fallback URL {fallback_url} failed: {e}")

    raise ValueError(f"Could not retrieve dataset file from Kaggle ({kaggle_uri}) or fallbacks")


def download_from_hf(storage_key: str, fallback_url: Optional[str] = None) -> bytes:
    """Download a dataset file from Hugging Face Hub with HTTP streaming and local caching."""
    import os
    import urllib.parse
    import tempfile
    import requests
    import logging

    hf_token = os.environ.get("HF_TOKEN")
    parts = storage_key.replace("hf://", "").split("/", 2)
    if len(parts) == 3:
        r_id = f"{parts[0]}/{parts[1]}"
        filename = parts[2]
    elif len(parts) == 2:
        r_id = f"{parts[0]}/{parts[1]}"
        filename = parts[1]
    else:
        r_id = os.environ.get("HF_REPO_ID", "petersstore/blacportal-datasets")
        filename = storage_key.replace("hf://", "")

    client = _get_client()
    if client.exists(filename):
        try:
            return client.download_as_bytes(filename)
        except Exception:
            pass

    cache_dir = os.path.join(tempfile.gettempdir(), "hf_cache", r_id.replace("/", "_"))
    os.makedirs(cache_dir, exist_ok=True)
    local_path = os.path.join(cache_dir, filename.replace("/", "_"))
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        with open(local_path, "rb") as f:
            return f.read()

    url = f"https://huggingface.co/datasets/{r_id}/resolve/main/{urllib.parse.quote(filename)}?download=true"
    headers = {"Authorization": f"Bearer {hf_token}"} if hf_token else {}
    try:
        resp = requests.get(url, headers=headers, stream=True, timeout=120)
        if resp.status_code == 200:
            with open(local_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f.write(chunk)
            with open(local_path, "rb") as f:
                return f.read()
    except Exception as e:
        logging.warning(f"HF direct download failed: {e}")

    try:
        from huggingface_hub import hf_hub_download
        path = hf_hub_download(repo_id=r_id, repo_type="dataset", filename=filename, token=hf_token)
        with open(path, "rb") as f:
            return f.read()
    except Exception as e:
        logging.warning(f"hf_hub_download failed: {e}")

    if fallback_url:
        try:
            from storage.link_resolver import resolve_link
            fb_bytes, _, _ = resolve_link(fallback_url, max_mb=5000)
            return fb_bytes
        except Exception as e:
            logging.warning(f"Fallback URL {fallback_url} failed: {e}")

    raise ValueError(f"Could not download Hugging Face dataset: {storage_key}")


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
    category: Optional[str] = None
    tags: Optional[list[str]] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ── Metadata ────────────────────────────────────────────────────────────────

def load_metadata(source: str = "admin") -> list[dict[str, Any]]:
    client = _get_client()
    try:
        key = METADATA_KEYS[source]
        raw = ""
        if client.exists(key):
            raw = client.download_as_text(key)
        if not raw or raw.strip() in ("", "[]"):
            alt_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "metadata", key))
            if os.path.exists(alt_path):
                with open(alt_path, "r", encoding="utf-8") as f:
                    raw = f.read()
        if raw:
            data = json.loads(raw)
            return data if isinstance(data, list) else []
        return []
    except Exception as e:
        import logging
        logging.error(f"Error loading metadata: {e}")
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
    with _metadata_lock:
        records = load_metadata(source=source)
        records.append(record.to_dict())
        save_metadata(records, source=source)


def update_record(dataset_id: str, updates: dict[str, Any], source: str = "admin") -> Optional[dict[str, Any]]:
    with _metadata_lock:
        records = load_metadata(source=source)
        target = next((r for r in records if r["id"] == dataset_id), None)
        target_source = source
        if not target:
            alt = "community" if source == "admin" else "admin"
            records = load_metadata(source=alt)
            target = next((r for r in records if r["id"] == dataset_id), None)
            target_source = alt
        if not target:
            return None
        for k, v in updates.items():
            if v is not None:
                target[k] = v
        save_metadata(records, source=target_source)
        return target


def delete_record(dataset_id: str, source: str = "admin") -> bool:
    import logging
    with _metadata_lock:
        records = load_metadata(source=source)
        target = next((r for r in records if r["id"] == dataset_id), None)
        if target is None:
            logging.warning(f"delete_record: Dataset {dataset_id} not found in {source}.")
            return False
            
        storage_key = target.get("storage_key", "")
        if storage_key and not storage_key.startswith(LINK_KEY_PREFIX):
            client = _get_client()
            try:
                if client.exists(storage_key):
                    client.delete(storage_key)
            except Exception as e:
                logging.error(f"delete_record: Error deleting file from storage: {e}")
                
            import threading as _thr
            filename = storage_key.split("/")[-1]
            _thr.Thread(target=_delete_from_huggingface, args=(filename,), daemon=True).start()
                
        remaining = [r for r in records if r["id"] != dataset_id]
        try:
            save_metadata(remaining, source=source)
        except Exception as e:
            logging.error(f"delete_record: Error saving metadata: {e}")
            return False
        return True


# ── Bbox extraction ─────────────────────────────────────────────────────────

def extract_tiff_bbox(file_bytes: Optional[bytes] = None, file_path: Optional[str] = None) -> list[float]:
    import rasterio
    from rasterio.warp import transform_bounds
    import os
    
    tmp_name = file_path
    cleanup = False
    
    if tmp_name is None and file_bytes is not None:
        with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp.flush()
            tmp_name = tmp.name
            cleanup = True
        
    try:
        with rasterio.open(tmp_name) as src:
            b = src.bounds
            if src.crs is None:
                return [b.left, b.bottom, b.right, b.top]
            minx, miny, maxx, maxy = transform_bounds(src.crs, "EPSG:4326", b.left, b.bottom, b.right, b.top)
            return [minx, miny, maxx, maxy]
    finally:
        if cleanup and tmp_name and os.path.exists(tmp_name):
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
    if ext in {"geojson", "json"}: return "geojson"
    if ext in {"gpkg", "kml", "parquet"}: return ext
    return "other"


def extract_geojson_bbox(file_bytes: bytes) -> Optional[list[float]]:
    try:
        import json
        from shapely.geometry import shape as shapely_shape
        data = json.loads(file_bytes.decode('utf-8'))
        if data.get("type") == "FeatureCollection":
            features = data.get("features", [])
            if not features:
                return None
            from shapely.ops import unary_union
            geoms = [shapely_shape(f["geometry"]) for f in features if f.get("geometry")]
            if not geoms:
                return None
            u = unary_union(geoms)
            minx, miny, maxx, maxy = u.bounds
            return [float(minx), float(miny), float(maxx), float(maxy)]
        elif "geometry" in data:
            minx, miny, maxx, maxy = shapely_shape(data["geometry"]).bounds
            return [float(minx), float(miny), float(maxx), float(maxy)]
    except Exception:
        pass
    return None



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


def process_and_store_upload(filename: str, file_bytes: Optional[bytes], name: str,
                              description: str, source: str = "admin",
                              contributor: Optional[str] = None,
                              source_url: Optional[str] = None,
                              dataset_id: Optional[str] = None,
                              progress_callback=None,
                              file_path: Optional[str] = None,
                              category: Optional[str] = None,
                              tags: Optional[list[str]] = None) -> DatasetRecord:
    import os
    if file_bytes is None and file_path is None:
        raise ValueError("Must provide either file_bytes or file_path")
        
    size_mb = len(file_bytes) / (1024 * 1024) if file_bytes is not None else os.path.getsize(file_path) / (1024 * 1024)
    file_type = detect_file_type(filename)
    dataset_id = dataset_id or str(uuid.uuid4())
    data_prefix = DATA_PREFIXES[source]
    storage_key = f"{data_prefix}{dataset_id}_{filename}"
    bbox: Optional[list[float]] = None
    status = "ok"
    error_message = None
    bytes_to_store = file_bytes
    try:
        if size_mb > MAX_UPLOAD_MB:
            raise ValueError(f"File is {size_mb:.1f} MB, exceeds {MAX_UPLOAD_MB} MB cap.")
            
        # Prevent nested zip bombs
        if (filename.lower().endswith(".zip") or file_type == "shapefile") and file_bytes is not None:
            try:
                with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                    for member in zf.infolist():
                        ext = member.filename.lower()
                        if ext.endswith(".zip") or ext.endswith(".tar") or ext.endswith(".gz") or ext.endswith(".rar") or ext.endswith(".7z"):
                            raise ValueError(f"Nested archive found: '{member.filename}'. To prevent system overload, please unzip and upload the raw files or a single unnested zip.")
            except zipfile.BadZipFile:
                raise ValueError("The uploaded file is not a valid zip archive or is corrupted.")

        if file_type == "shapefile":
            storage_key = f"{data_prefix}{dataset_id}.zip"
            
        if file_type == "tiff":
            try:
                bbox = extract_tiff_bbox(file_bytes=bytes_to_store, file_path=file_path)
            except Exception:
                pass
        elif file_type == "shapefile":
            try:
                if bytes_to_store is not None:
                    bbox, new_bytes = extract_shapefile_bbox(bytes_to_store)
                    bytes_to_store = new_bytes
                    size_mb = len(bytes_to_store) / (1024 * 1024)
                elif file_path is not None:
                    with open(file_path, "rb") as zf:
                        bbox, new_bytes = extract_shapefile_bbox(zf.read())
                        bytes_to_store = new_bytes
                        size_mb = len(bytes_to_store) / (1024 * 1024)
            except Exception:
                pass
        elif file_type == "csv":
            try:
                if bytes_to_store is not None:
                    bbox = extract_csv_bbox(bytes_to_store)
                elif file_path is not None:
                    with open(file_path, "rb") as cf:
                        bbox = extract_csv_bbox(cf.read(5 * 1024 * 1024))
            except Exception:
                pass
        elif file_type == "geojson":
            try:
                if bytes_to_store is not None:
                    bbox = extract_geojson_bbox(bytes_to_store)
                elif file_path is not None:
                    with open(file_path, "rb") as gf:
                        bbox = extract_geojson_bbox(gf.read())
            except Exception:
                pass
    except Exception as e:
        status = "error"; error_message = str(e)
    if status != "error":
        try:
            storage_key = push_to_storage(storage_key, bytes_to_store, name or filename, progress_callback, file_path=file_path)
        except Exception as e:
            status = "error"; error_message = f"Failed to save to Hugging Face: {e}"
    record = DatasetRecord(id=dataset_id, name=name, description=description, file_type=file_type,
                           storage_key=storage_key, original_filename=filename, bbox=bbox,
                           file_size_mb=round(size_mb, 3), status=status, error_message=error_message,
                           source=source, contributor=contributor, source_url=source_url,
                           category=category, tags=tags)
    try:
        add_record(record, source=source)
    except Exception as e:
        record.status = "error"; record.error_message = f"File saved but metadata failed: {e}"
    return record


# Compatibility alias for harvester & API endpoints
upload_dataset_file = process_and_store_upload


def process_and_store_link(url: str, name: str, description: str,
                            source: str = "admin", contributor: Optional[str] = None,
                            category: Optional[str] = None, tags: Optional[list[str]] = None) -> DatasetRecord:
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
            
        import re
        if filename:
            filename = re.sub(r'\s*-\s*Google\s*Drive\s*$', '', filename).strip()
        if name:
            name = re.sub(r'\s*-\s*Google\s*Drive\s*$', '', name).strip()
            
        if description and description.startswith("Harvested from"):
            description = ""
            
        file_type = detect_file_type(filename)
        if file_type == "other":
            file_type = detect_file_type(name)
            if file_type != "other":
                filename = name
            elif "drive.google.com" in resolved_url or "drive.usercontent.google.com" in resolved_url:
                file_type = "tiff"
                if not filename.endswith(".tif") and not filename.endswith(".tiff"):
                    filename = filename + ".tif"
        
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
    
    # 1. Download the actual file bytes from the link
    try:
        from storage.link_resolver import resolve_link
        file_bytes, _, _ = resolve_link(raw_url, max_mb=2000) # Download up to 2GB
        size_mb = len(file_bytes) / (1024 * 1024)
        
        # 2. Push the bytes to Kaggle / R2!
        storage_key = push_to_storage(f"{dataset_id}_{filename}", file_bytes, name or filename)
        
    except Exception as e:
        status = "error"
        error_message = f"Failed to download from link or push to Kaggle: {e}"
        storage_key = f"{LINK_KEY_PREFIX}{raw_url}" # Fallback
    
    record = DatasetRecord(id=dataset_id, name=name, description=description, file_type=file_type,
                           storage_key=storage_key, original_filename=filename, bbox=bbox,
                           status=status, error_message=error_message, source=source,
                           contributor=contributor, source_url=raw_url, file_size_mb=round(size_mb, 3),
                           category=category, tags=tags)
    try:
        add_record(record, source=source)
    except Exception as e:
        record.status = "error"; record.error_message = f"Link registered but metadata failed: {e}"
    return record


def download_dataset_bytes(storage_key: str, fallback_url: Optional[str] = None) -> bytes:
    try:
        if storage_key.startswith(LINK_KEY_PREFIX):
            from storage.link_resolver import resolve_link
            file_bytes, _, _ = resolve_link(storage_key[len(LINK_KEY_PREFIX):], max_mb=5000)
            return file_bytes
        if storage_key.startswith("kaggle://"):
            return download_from_kaggle(storage_key, fallback_url=fallback_url)
        
        if storage_key.startswith("hf://"):
            return download_from_hf(storage_key, fallback_url=fallback_url)
        
        key = storage_key
        if key.startswith("r2://"):
            # Format: r2://bucket_name/filename
            parts = key.replace("r2://", "").split("/", 1)
            if len(parts) > 1:
                key = parts[1]
        elif key.startswith("local://"):
            key = key[8:]
        elif key.startswith("local::"):
            key = key[7:]

        client = _get_client()
        if client.exists(key):
            return client.download_as_bytes(key)

        # Fallback to direct file search in storage directory
        storage_dir = getattr(client, "storage_dir", None)
        if storage_dir and os.path.exists(storage_dir):
            base_k = os.path.basename(key)
            alt_p = os.path.join(storage_dir, base_k)
            if os.path.exists(alt_p):
                with open(alt_p, "rb") as f:
                    return f.read()
            clean_k = key.replace("/", "_")
            flat_p = os.path.join(storage_dir, clean_k)
            if os.path.exists(flat_p):
                with open(flat_p, "rb") as f:
                    return f.read()

        return client.download_as_bytes(key)
    except Exception as primary_exc:
        if fallback_url:
            try:
                from storage.link_resolver import resolve_link
                fb_bytes, _, _ = resolve_link(fallback_url, max_mb=5000)
                if fb_bytes:
                    return fb_bytes
            except Exception as fb_exc:
                raise ValueError(f"Primary download failed ({primary_exc}) and fallback failed ({fb_exc})") from primary_exc
        raise


def get_dataset_local_path(storage_key: str, fallback_url: Optional[str] = None) -> Optional[str]:
    import tempfile
    import os

    if storage_key.startswith(LINK_KEY_PREFIX):
        return None
        
    client = _get_client()
    if hasattr(client, "exists") and hasattr(client, "_resolve_path") and client.exists(storage_key):
        return client._resolve_path(storage_key)

    if storage_key.startswith("kaggle://"):
        try:
            # Download and cache locally so GDAL / rasterio can open directly
            clean_uri = storage_key.replace("kaggle://", "").strip()
            parts = clean_uri.split("/")
            dataset = f"{parts[0]}/{parts[1]}"
            filename = "/".join(parts[2:])
            import re
            clean_filename = re.sub(r'\s*-\s*Google\s*Drive\s*$', '', filename).strip()

            cache_dir = os.path.join(tempfile.gettempdir(), "blacportal_kaggle_cache", dataset.replace("/", "_"))
            os.makedirs(cache_dir, exist_ok=True)
            cached_path = os.path.join(cache_dir, clean_filename.replace("/", "_"))
            if os.path.exists(cached_path) and os.path.getsize(cached_path) > 0:
                return cached_path

            data = download_from_kaggle(storage_key, fallback_url=fallback_url)
            with open(cached_path, "wb") as f:
                f.write(data)
            return cached_path
        except Exception:
            return None

    if storage_key.startswith("hf://"):
        import os
        hf_token = os.environ.get("HF_TOKEN")
        parts = storage_key.replace("hf://", "").split("/", 2)
        if len(parts) == 3:
            r_id = f"{parts[0]}/{parts[1]}"
            filename = parts[2]
        else:
            r_id = os.environ.get("HF_REPO_ID", "petersstore/blacportal-datasets")
            filename = storage_key.replace("hf://", "")
        try:
            from huggingface_hub import hf_hub_download
            return hf_hub_download(repo_id=r_id, repo_type="dataset", filename=filename, token=hf_token)
        except ImportError:
            import requests, tempfile
            cache_dir = os.path.join(tempfile.gettempdir(), "hf_cache", r_id.replace("/", "_"))
            os.makedirs(cache_dir, exist_ok=True)
            local_path = os.path.join(cache_dir, filename.replace("/", "_"))
            if os.path.exists(local_path):
                return local_path
            url = f"https://huggingface.co/datasets/{r_id}/resolve/main/{filename}?download=true"
            headers = {"Authorization": f"Bearer {hf_token}"} if hf_token else {}
            resp = requests.get(url, headers=headers, stream=True)
            if resp.status_code == 200:
                with open(local_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=1024*1024):
                        f.write(chunk)
                return local_path
            return None
        except Exception:
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
                safe_extractall(zf, tmpdir)
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
    elif file_bytes is None and not is_url and record.get("storage_key"):
        file_bytes = download_dataset_bytes(record["storage_key"], fallback_url=record.get("source_url"))

    if file_type in ["geojson", "shapefile"]:
        import geopandas as gpd
        import json
        
        if file_type == "shapefile":
            if file_bytes is None and is_url and url:
                import requests
                resp = requests.get(url, timeout=60)
                resp.raise_for_status()
                file_bytes = resp.content
            elif file_bytes is None and not is_url:
                file_bytes = download_dataset_bytes(record["storage_key"], fallback_url=record.get("source_url"))
                
            with tempfile.TemporaryDirectory() as tmpdir:
                with zipfile.ZipFile(io.BytesIO(file_bytes), 'r') as zf:
                    safe_extractall(zf, tmpdir)
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
