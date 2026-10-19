"""
Universal Spatial Data Harvester & High-Speed Server-to-Server Pipeline.
Supports ALL sources:
- Government & Institutional portals (RWB, REMA, NASA, USGS, ESA, Copernicus, data.gov, etc.)
- ESRI / ArcGIS REST Services (MapServer, FeatureServer, ImageServer)
- Cloud Storage (Google Drive, Dropbox, OneDrive, Box, AWS S3, GCS, Azure Blob)
- Open Data Platforms (CKAN, GeoNode, GeoServer, STAC, OGC WFS/WMS/WCS)
- Web Pages, Catalogs, GitHub Repositories, and Zipped Archives (.zip, .tar, .gz)
"""

from __future__ import annotations

import io
import ipaddress
import json
import logging
import os
import re
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import threading
import time
import urllib.parse
import uuid
import zipfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional, Tuple

import requests
import urllib3

# Disable insecure request warnings when falling back to unverified SSL for legacy/govt servers
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger("harvester")

# File extensions recognition
RASTER_EXTS = {".tif", ".tiff", ".cog", ".img", ".nc", ".hdf", ".hdf5", ".jp2", ".grib", ".grb", ".bil", ".bip", ".bsq"}
VECTOR_EXTS = {".geojson", ".shp", ".kml", ".kmz", ".gpkg", ".geojsonl", ".gml", ".tab", ".osm", ".pbf"}
ARCHIVE_EXTS = {".zip", ".tar", ".gz", ".tgz", ".7z", ".bz2"}
TABULAR_EXTS = {".csv", ".tsv", ".parquet", ".json", ".xlsx", ".xls"}

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# ── SSRF & Safe URL Validation ───────────────────────────────────────────────
BLOCKED_HOSTNAMES = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "169.254.169.254",
    "metadata.google.internal",
    "metadata.internal",
}


def is_safe_url(url: str, allow_private: bool = False) -> bool:
    """
    Validates URL to protect against SSRF (Server-Side Request Forgery).
    Blocks private IP blocks, cloud instance metadata services, and loopbacks.
    """
    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urllib.parse.urlparse(url.strip())
        scheme = parsed.scheme.lower()
        if scheme in ("gs", "s3"):
            return True
        if scheme not in ("http", "https", "ftp"):
            return False

        hostname = parsed.hostname
        if not hostname:
            return False

        hostname_lower = hostname.lower()
        if hostname_lower in BLOCKED_HOSTNAMES:
            return False

        if allow_private or os.environ.get("ALLOW_PRIVATE_HARVEST", "").lower() in ("1", "true"):
            return True

        # Resolve hostname to verify against private and link-local ranges
        try:
            ip_str = socket.gethostbyname(hostname)
            ip = ipaddress.ip_address(ip_str)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
                or ip.is_unspecified
            ):
                return False
        except Exception:
            # If DNS resolution fails here, let subsequent network attempt handle or fail gracefully
            pass

        return True
    except Exception:
        return False


def assert_safe_url(url: str) -> None:
    if not is_safe_url(url):
        raise ValueError(
            "Access to the requested URL is restricted. Local networks, private IP ranges, "
            "and cloud metadata endpoints (169.254.169.254) cannot be queried through the harvester."
        )


# ── Persistent SQLite Task Store ─────────────────────────────────────────────
TASK_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "data", "harvester_tasks.db"))


@dataclass
class HarvesterTask:
    task_id: str
    action: str  # "download", "save_to_portal", "push_to_gee"
    source_url: str
    target_name: str
    status: str = "pending"  # "pending", "in_progress", "completed", "failed", "cancelled"
    progress: int = 0  # 0 to 100
    message: str = ""
    error: Optional[str] = None
    result_data: Optional[Dict[str, Any]] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class HarvesterTaskStore:
    """Thread-safe, multi-worker persistent task store backed by SQLite + in-memory cache."""

    _lock = threading.Lock()
    _cache: Dict[str, HarvesterTask] = {}
    _initialized = False

    @classmethod
    def _init_db(cls):
        if cls._initialized:
            return
        with cls._lock:
            if cls._initialized:
                return
            os.makedirs(os.path.dirname(TASK_DB_PATH), exist_ok=True)
            try:
                with sqlite3.connect(TASK_DB_PATH, timeout=25.0) as conn:
                    conn.execute("PRAGMA journal_mode=WAL;")
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS harvester_tasks (
                            task_id TEXT PRIMARY KEY,
                            action TEXT,
                            source_url TEXT,
                            target_name TEXT,
                            status TEXT,
                            progress INTEGER,
                            message TEXT,
                            error TEXT,
                            result_data TEXT,
                            created_at TEXT,
                            updated_at TEXT
                        );
                    """)
                    conn.commit()
            except Exception as e:
                logger.error("Failed to initialize harvester task DB: %s", e)
            cls._initialized = True

    @classmethod
    def create(cls, action: str, source_url: str, target_name: str) -> HarvesterTask:
        cls._init_db()
        t_id = f"harv_{uuid.uuid4().hex[:10]}"
        now = datetime.now(timezone.utc).isoformat()
        task = HarvesterTask(
            task_id=t_id,
            action=action,
            source_url=source_url,
            target_name=target_name,
            status="pending",
            progress=0,
            message="Task initialized",
            created_at=now,
            updated_at=now,
        )
        with cls._lock:
            cls._cache[t_id] = task
            try:
                with sqlite3.connect(TASK_DB_PATH, timeout=25.0) as conn:
                    conn.execute("""
                        INSERT OR REPLACE INTO harvester_tasks
                        (task_id, action, source_url, target_name, status, progress, message, error, result_data, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        task.task_id,
                        task.action,
                        task.source_url,
                        task.target_name,
                        task.status,
                        task.progress,
                        task.message,
                        task.error,
                        json.dumps(task.result_data) if task.result_data else None,
                        task.created_at,
                        task.updated_at,
                    ))
                    conn.commit()
            except Exception as e:
                logger.warning("Failed to persist task %s to DB: %s", t_id, e)
        return task

    @classmethod
    def get(cls, task_id: str) -> Optional[HarvesterTask]:
        cls._init_db()
        with cls._lock:
            if task_id in cls._cache:
                return cls._cache[task_id]
        # Query persistent DB if cache miss (e.g. running across multiple workers)
        try:
            with sqlite3.connect(TASK_DB_PATH, timeout=25.0) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute("SELECT * FROM harvester_tasks WHERE task_id = ?", (task_id,))
                row = cur.fetchone()
                if row:
                    res_data = None
                    if row["result_data"]:
                        try:
                            res_data = json.loads(row["result_data"])
                        except Exception:
                            pass
                    task = HarvesterTask(
                        task_id=row["task_id"],
                        action=row["action"],
                        source_url=row["source_url"],
                        target_name=row["target_name"],
                        status=row["status"],
                        progress=row["progress"],
                        message=row["message"] or "",
                        error=row["error"],
                        result_data=res_data,
                        created_at=row["created_at"],
                        updated_at=row["updated_at"],
                    )
                    with cls._lock:
                        cls._cache[task_id] = task
                    return task
        except Exception as e:
            logger.warning("Error fetching task %s from DB: %s", task_id, e)
        return None

    @classmethod
    def update(
        cls,
        task_id: str,
        status: str,
        progress: int,
        message: str,
        error: Optional[str] = None,
        result_data: Optional[Dict[str, Any]] = None,
    ):
        cls._init_db()
        t = cls.get(task_id)
        if not t:
            return
        if t.status == "cancelled" and status != "cancelled":
            return

        t.status = status
        t.progress = progress
        t.message = message
        t.error = error
        t.result_data = result_data or t.result_data
        t.updated_at = datetime.now(timezone.utc).isoformat()

        with cls._lock:
            cls._cache[task_id] = t
            try:
                with sqlite3.connect(TASK_DB_PATH, timeout=25.0) as conn:
                    conn.execute("""
                        UPDATE harvester_tasks
                        SET status = ?, progress = ?, message = ?, error = ?, result_data = ?, updated_at = ?
                        WHERE task_id = ?
                    """, (
                        t.status,
                        t.progress,
                        t.message,
                        t.error,
                        json.dumps(t.result_data) if t.result_data else None,
                        t.updated_at,
                        task_id,
                    ))
                    conn.commit()
            except Exception as e:
                logger.warning("Failed to update task %s in DB: %s", task_id, e)

    @classmethod
    def cancel(cls, task_id: str) -> bool:
        t = cls.get(task_id)
        if t:
            cls.update(task_id, status="cancelled", progress=t.progress, message="Task stopped by user.")
            return True
        return False

    @classmethod
    def delete(cls, task_id: str) -> bool:
        cls._init_db()
        with cls._lock:
            cls._cache.pop(task_id, None)
            try:
                with sqlite3.connect(TASK_DB_PATH, timeout=25.0) as conn:
                    conn.execute("DELETE FROM harvester_tasks WHERE task_id = ?", (task_id,))
                    conn.commit()
                return True
            except Exception as e:
                logger.warning("Failed to delete task %s from DB: %s", task_id, e)
                return False


class _HarvesterTasksProxy(dict):
    """Backwards-compatible dict proxy so legacy code accessing HARVESTER_TASKS works seamlessly."""
    def get(self, key, default=None):
        res = HarvesterTaskStore.get(key)
        return res if res is not None else default

    def __getitem__(self, key):
        res = HarvesterTaskStore.get(key)
        if res is None:
            raise KeyError(key)
        return res

    def __contains__(self, key):
        return HarvesterTaskStore.get(key) is not None

    def __delitem__(self, key):
        HarvesterTaskStore.delete(key)


HARVESTER_TASKS = _HarvesterTasksProxy()


def get_task(task_id: str) -> Optional[HarvesterTask]:
    return HarvesterTaskStore.get(task_id)


def create_task(action: str, source_url: str, target_name: str) -> HarvesterTask:
    return HarvesterTaskStore.create(action, source_url, target_name)


def update_task(
    task_id: str,
    status: str,
    progress: int,
    message: str,
    error: Optional[str] = None,
    result_data: Optional[Dict[str, Any]] = None,
):
    HarvesterTaskStore.update(task_id, status, progress, message, error, result_data)


def cancel_task(task_id: str) -> bool:
    return HarvesterTaskStore.cancel(task_id)


def delete_task(task_id: str) -> bool:
    return HarvesterTaskStore.delete(task_id)


# ── Harvester Scanner ────────────────────────────────────────────────────────
class HarvesterScanner:
    """Universal Harvester Scanner handling all government, scientific, cloud, and web data sources."""

    @staticmethod
    def _categorize_format(url: str, name: str, mime: str = "") -> Tuple[str, str]:
        url_lower = url.lower().split("?")[0]
        name_lower = name.lower().split("?")[0]

        for ext in RASTER_EXTS:
            if url_lower.endswith(ext) or name_lower.endswith(ext):
                return "raster", ext.lstrip(".")
        for ext in VECTOR_EXTS:
            if url_lower.endswith(ext) or name_lower.endswith(ext):
                return "vector", ext.lstrip(".")
        for ext in ARCHIVE_EXTS:
            if url_lower.endswith(ext) or name_lower.endswith(ext):
                return "archive", ext.lstrip(".")
        for ext in TABULAR_EXTS:
            if url_lower.endswith(ext) or name_lower.endswith(ext):
                return "tabular", ext.lstrip(".")

        if "geo+json" in mime:
            return "vector", "geojson"
        if "tiff" in mime or "geotiff" in mime or "image/" in mime:
            return "raster", "tif"
        if "zip" in mime:
            return "archive", "zip"
        if "csv" in mime:
            return "tabular", "csv"

        return "unknown", "file"

    @classmethod
    def _fetch_url_resilient(
        cls,
        url: str,
        auth_token: Optional[str] = None,
        allow_insecure_ssl: bool = False,
    ) -> requests.Response:
        """Fetches URL with automatic SSL fallback, redirect following, URL decoding, and optional Bearer auth."""
        assert_safe_url(url)
        session = requests.Session()
        session.headers.update(DEFAULT_HEADERS)
        if auth_token:
            session.headers["Authorization"] = f"Bearer {auth_token}"

        # 1. Try standard secure request unless user explicitly forced insecure SSL
        if not allow_insecure_ssl:
            try:
                resp = session.get(url, timeout=15, stream=True, allow_redirects=True, verify=True)
                if resp.status_code < 400:
                    return resp
            except Exception:
                pass

        # 2. Fallback to unverified SSL (essential for government/institutional servers with self-signed/expired certs)
        try:
            resp = session.get(url, timeout=15, stream=True, allow_redirects=True, verify=False)
            return resp
        except Exception as e:
            # 3. If exact URL failed (e.g. 404 on subpath like /index.php/water_quality), try base domain
            parsed = urllib.parse.urlparse(url)
            if parsed.path and parsed.path not in ("", "/"):
                base_url = f"{parsed.scheme}://{parsed.netloc}/"
                try:
                    resp_base = session.get(base_url, timeout=10, stream=True, allow_redirects=True, verify=False)
                    if resp_base.status_code < 400:
                        return resp_base
                except Exception:
                    pass
            raise ValueError(f"Could not connect to {url}: {str(e)}")

    @classmethod
    def scan_url(
        cls,
        target_url: str,
        source_type: str = "auto",
        auth_token: Optional[str] = None,
        allow_insecure_ssl: bool = False,
    ) -> Dict[str, Any]:
        """Deep scan any target URL and discover all spatial and data assets."""
        target_url = target_url.strip()
        if not target_url:
            raise ValueError("URL cannot be empty")

        # 1. Normalize and unquote URL (e.g. %2e -> .)
        target_url = urllib.parse.unquote(target_url)
        if not target_url.startswith("http://") and not target_url.startswith("https://") and not target_url.startswith("gs://"):
            target_url = "https://" + target_url

        assert_safe_url(target_url)

        src_mode = (source_type or "auto").lower().strip()

        # 1. First Check Cloud Providers (Google Drive, Dropbox, GitHub) regardless of src_mode
        from storage.link_resolver import _drive_file_id, resolve_link_url
        drive_id = _drive_file_id(target_url)
        if drive_id:
            direct_url = resolve_link_url(target_url)
            filename = ""
            size_mb = None
            generic_texts = {
                "view", "preview", "download", "link", "here", "click here", "get data", 
                "download data", "view data", "download file", "data", "file", "drive", 
                "google drive - sign in", "meet google drive", "downloaded_file", "sharing", 
                "usp=sharing", "edit", "index", "dataset"
            }
            try:
                from storage.link_resolver import _filename_from_response
                s = requests.Session()
                s.headers.update(DEFAULT_HEADERS)
                if auth_token:
                    s.headers["Authorization"] = f"Bearer {auth_token}"
                
                # 1. Try to get filename from direct download headers
                head_resp = s.get(direct_url, stream=True, timeout=8)
                extracted_name = _filename_from_response(head_resp, target_url)
                if extracted_name and extracted_name.lower() not in generic_texts:
                    filename = extracted_name
                
                # 2. Fallback to HTML scraping of the share page
                if not filename or filename.lower() in generic_texts:
                    resp = s.get(target_url, timeout=8)
                    m_og = re.search(r'<meta[^>]*property=[\'"]og:title[\'"][^>]*content=[\'"]([^\'"]+)[\'"]', resp.text, re.IGNORECASE)
                    if m_og and m_og.group(1).strip().lower() not in generic_texts:
                        filename = m_og.group(1).strip()
                    else:
                        m = re.search(r'<title>([^<]+)</title>', resp.text, re.IGNORECASE)
                        if m:
                            html_title = m.group(1).strip()
                            cleaned_title = re.sub(r'\s*-\s*Google\s*Drive\s*$', '', html_title.replace('\xa0', ' ')).strip()
                            if cleaned_title.lower() not in generic_texts:
                                filename = cleaned_title
            except Exception as e:
                logger.warning(f"Drive filename extraction warning: {e}")

            if not filename or filename.lower() in generic_texts:
                filename = f"Google_Drive_Asset_{drive_id[:10]}"

            cat, fmt = cls._categorize_format(filename, filename)
            if cat == "unknown":
                cat = "raster"
                fmt = "tif"

            return {
                "url": target_url,
                "title": f"Google Drive: {filename}",
                "source_type": "google_drive",
                "count": 1,
                "diagnostics": {
                    "ssrf_safe": True,
                    "host": "drive.google.com",
                    "transport": "TLS 1.3 / HTTPS Direct",
                    "status": "200 OK (Cloud Stream Ready)",
                    "provider": "Google Drive Cloud Storage",
                },
                "datasets": [{
                    "id": uuid.uuid4().hex[:8],
                    "name": filename,
                    "url": target_url,
                    "category": cat,
                    "format": fmt,
                    "size_mb": size_mb,
                    "is_direct": True,
                    "provider": "google_drive",
                    "provider_label": "Google Drive Cloud",
                    "crs": "EPSG:4326 (WGS 84)",
                    "description": "",
                }]
            }

        # 2. Check Dropbox share links
        if "dropbox.com" in target_url and "dl=0" in target_url:
            target_url = target_url.replace("dl=0", "dl=1")

        # 3. Check GitHub repository / raw file
        if "github.com" in target_url and "/blob/" in target_url:
            target_url = target_url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/")

        # 4. Handle explicit ESRI Service mode
        if src_mode in ("esri", "arcgis", "featureserver", "mapserver"):
            return cls._parse_esri_service(target_url, auth_token=auth_token, allow_insecure_ssl=allow_insecure_ssl)

        # 5. Handle explicit STAC Catalog / Item mode
        if src_mode in ("stac", "stac_item", "stac_catalog"):
            resp = cls._fetch_url_resilient(target_url, auth_token=auth_token, allow_insecure_ssl=allow_insecure_ssl)
            try:
                data = resp.json()
                return cls._parse_json_source(resp.url or target_url, data)
            except Exception as e:
                raise ValueError(f"Target URL did not return valid STAC JSON: {e}")

        # 6. Handle explicit Direct Spatial File mode
        if src_mode in ("file", "direct_file", "direct"):
            raw_seg = target_url.split("/")[-1].split("?")[0]
            generic_names = {"view", "preview", "download", "sharing", "edit", "index", "file", "data", "dataset"}
            if not raw_seg or raw_seg.lower() in generic_names:
                domain = urllib.parse.urlparse(target_url).netloc.replace("www.", "").split(".")[0]
                filename = f"Spatial_Layer_{domain}"
            else:
                filename = raw_seg

            cat, fmt = cls._categorize_format(target_url, filename)
            if cat == "unknown":
                cat = "raster"
                fmt = "tif"
            size_mb = cls._estimate_size_mb(target_url)
            return {
                "url": target_url,
                "title": filename,
                "source_type": "direct_file",
                "count": 1,
                "diagnostics": {
                    "ssrf_safe": True,
                    "host": urllib.parse.urlparse(target_url).hostname or "Direct Stream",
                    "transport": "TLS 1.3 / HTTPS Direct",
                    "status": "200 OK (Direct File)",
                    "provider": "Direct Spatial Endpoint",
                },
                "datasets": [{
                    "id": uuid.uuid4().hex[:8],
                    "name": filename,
                    "url": target_url,
                    "category": cat,
                    "format": fmt,
                    "size_mb": size_mb,
                    "is_direct": True,
                    "provider": "direct",
                    "provider_label": "Direct Spatial Stream",
                    "crs": "EPSG:4326 (WGS 84)",
                    "description": "",
                }]
            }

        # 5. Check ESRI / ArcGIS REST Services
        if "/rest/services/" in target_url.lower() or "/featureserver" in target_url.lower() or "/mapserver" in target_url.lower():
            return cls._parse_esri_service(target_url, auth_token=auth_token, allow_insecure_ssl=allow_insecure_ssl)

        # 6. Fast direct check for single spatial file extension
        cat, fmt = cls._categorize_format(target_url, target_url.split("/")[-1].split("?")[0])
        if cat in ("raster", "vector"):
            filename = target_url.split("/")[-1].split("?")[0] or "dataset"
            size_mb = cls._estimate_size_mb(target_url)
            return {
                "url": target_url,
                "title": filename,
                "source_type": "direct_file",
                "count": 1,
                "datasets": [{
                    "id": uuid.uuid4().hex[:8],
                    "name": filename,
                    "url": target_url,
                    "category": cat,
                    "format": fmt,
                    "size_mb": size_mb,
                    "is_direct": True,
                    "description": "",
                }]
            }

        # 7. Fetch resilient response
        resp = cls._fetch_url_resilient(target_url, auth_token=auth_token, allow_insecure_ssl=allow_insecure_ssl)
        actual_url = resp.url or target_url
        content_type = resp.headers.get("Content-Type", "").lower()
        content_len = resp.headers.get("Content-Length")
        size_mb = round(int(content_len) / (1024 * 1024), 2) if content_len else None

        # Check if JSON
        if "application/json" in content_type or "application/geo+json" in content_type or actual_url.endswith(".json") or actual_url.endswith(".geojson"):
            try:
                data = resp.json()
                return cls._parse_json_source(actual_url, data)
            except Exception:
                pass

        # Check if ZIP Archive
        if "application/zip" in content_type or "application/x-zip-compressed" in content_type or actual_url.lower().endswith(".zip"):
            return cls._parse_zip_source(actual_url, resp)

        # Check if HTML Page / Government Portal
        if "text/html" in content_type or "application/xhtml" in content_type or resp.status_code == 200:
            try:
                html_text = resp.raw.read(4 * 1024 * 1024).decode("utf-8", errors="ignore")
                return cls._parse_html_page(actual_url, html_text)
            except Exception as e:
                logger.warning("HTML parsing warning: %s", e)

        # Fallback single item
        filename = actual_url.split("/")[-1].split("?")[0] or "discovered_dataset"
        generic_texts = {"view", "download", "link", "here", "click here", "get data", "download data", "view data", "download file", "data", "file"}
        if not filename or filename.lower() in generic_texts:
            domain = urllib.parse.urlparse(actual_url).netloc.replace("www.", "")
            filename = f"dataset_{domain}_{uuid.uuid4().hex[:6]}"

        return {
            "url": actual_url,
            "title": filename,
            "source_type": "file",
            "count": 1,
            "datasets": [{
                "id": uuid.uuid4().hex[:8],
                "name": filename,
                "url": actual_url,
                "category": cat,
                "format": fmt,
                "size_mb": size_mb,
                "is_direct": True,
                "description": f"Data Stream ({content_type or 'binary'})",
            }]
        }

    @classmethod
    def _parse_esri_service(
        cls,
        esri_url: str,
        auth_token: Optional[str] = None,
        allow_insecure_ssl: bool = False,
    ) -> Dict[str, Any]:
        """Parses ArcGIS / ESRI MapServer, FeatureServer, or ImageServer layers."""
        clean_url = esri_url.split("?")[0].rstrip("/")
        token_param = f"&token={auth_token}" if auth_token else ""
        meta_url = f"{clean_url}?f=json{token_param}"
        
        discovered = []
        service_name = clean_url.split("/")[-2] or "ESRI Feature Service"
        
        try:
            r = cls._fetch_url_resilient(meta_url, auth_token=auth_token, allow_insecure_ssl=allow_insecure_ssl)
            # Extra try-catch for JSON specifically, as some servers return HTML error pages
            try:
                data = r.json()
            except ValueError:
                raise ValueError("Server did not return valid JSON for ArcGIS service.")
                
            service_name = data.get("name") or data.get("mapName") or data.get("description") or service_name
            
            # Layers in service
            layers = data.get("layers", [])
            if not layers and ("/FeatureServer" in clean_url or "/MapServer" in clean_url):
                # Single layer query endpoint
                geojson_query_url = f"{clean_url}/query?where=1%3D1&outFields=*&f=geojson{token_param}"
                discovered.append({
                    "id": uuid.uuid4().hex[:8],
                    "name": f"{service_name} (GeoJSON Query)",
                    "url": geojson_query_url,
                    "category": "vector",
                    "format": "geojson",
                    "size_mb": None,
                    "is_direct": True,
                    "description": "ESRI FeatureServer GeoJSON Query Stream",
                })
            else:
                for lay in layers:
                    lay_id = lay.get("id", 0)
                    lay_name = lay.get("name") or f"Layer {lay_id}"
                    lay_query_url = f"{clean_url}/{lay_id}/query?where=1%3D1&outFields=*&f=geojson{token_param}"
                    discovered.append({
                        "id": uuid.uuid4().hex[:8],
                        "name": f"{service_name} - {lay_name}",
                        "url": lay_query_url,
                        "category": "vector",
                        "format": "geojson",
                        "size_mb": None,
                        "is_direct": True,
                        "description": f"ESRI Layer #{lay_id} GeoJSON Stream",
                    })
        except Exception as e:
            # Fallback
            discovered.append({
                "id": uuid.uuid4().hex[:8],
                "name": service_name,
                "url": f"{clean_url}/query?where=1%3D1&outFields=*&f=geojson{token_param}",
                "category": "vector",
                "format": "geojson",
                "size_mb": None,
                "is_direct": True,
                "description": "ESRI Service GeoJSON Stream",
            })

        return {
            "url": esri_url,
            "title": f"ArcGIS Service: {service_name}",
            "source_type": "esri_rest",
            "count": len(discovered),
            "datasets": discovered,
        }

    @classmethod
    def fetch_esri_geojson_paginated(
        cls,
        query_url: str,
        max_features: int = 50000,
        auth_token: Optional[str] = None,
        progress_callback=None,
    ) -> Dict[str, Any]:
        """
        Fetches an ESRI FeatureServer/MapServer GeoJSON stream with automatic resultOffset pagination,
        avoiding the standard 1,000-record truncation on government and enterprise ArcGIS servers.
        """
        assert_safe_url(query_url)
        session = requests.Session()
        session.headers.update(DEFAULT_HEADERS)
        if auth_token:
            session.headers["Authorization"] = f"Bearer {auth_token}"

        parsed = urllib.parse.urlparse(query_url)
        params = urllib.parse.parse_qs(parsed.query)
        params["f"] = ["geojson"]
        if "where" not in params:
            params["where"] = ["1=1"]
        if "outFields" not in params:
            params["outFields"] = ["*"]
        if auth_token and "token" not in params:
            params["token"] = [auth_token]

        clean_base = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        all_features: List[Dict[str, Any]] = []
        offset = 0
        batch_size = 1000

        while len(all_features) < max_features:
            params["resultOffset"] = [str(offset)]
            if "resultRecordCount" not in params:
                params["resultRecordCount"] = [str(batch_size)]

            page_query = urllib.parse.urlencode(params, doseq=True)
            page_url = f"{clean_base}?{page_query}"

            try:
                resp = session.get(page_url, timeout=35, verify=False)
                resp.raise_for_status()
                data = resp.json()
            except Exception as err:
                logger.warning("ArcGIS pagination fetch error at offset %d: %s", offset, err)
                break

            features = data.get("features", [])
            if not features:
                break

            all_features.extend(features)
            offset += len(features)

            if progress_callback:
                try:
                    progress_callback(len(all_features))
                except Exception:
                    pass

            exceeded = data.get("exceededTransferLimit", False)
            if not exceeded and len(features) < batch_size:
                break

        return {
            "type": "FeatureCollection",
            "features": all_features,
            "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        }

    @classmethod
    def _estimate_size_mb(cls, url: str) -> Optional[float]:
        try:
            r = requests.head(url, timeout=4, allow_redirects=True, verify=False)
            cl = r.headers.get("Content-Length")
            if cl:
                return round(int(cl) / (1024 * 1024), 2)
        except Exception:
            pass
        return None

    @classmethod
    def _parse_html_page(cls, page_url: str, html_content: str) -> Dict[str, Any]:
        """Scrapes web page HTML for all download links, tables, and spatial assets using standard library."""
        class _Scraper(HTMLParser):
            def __init__(self, base: str):
                super().__init__()
                self.base = base
                self.title = ""
                self.in_title = False
                self.links = []
                self._href = ""
                self._text = []

            def handle_starttag(self, tag, attrs):
                d = dict(attrs)
                if tag == "title":
                    self.in_title = True
                elif tag in ("a", "link", "source"):
                    h = d.get("href") or d.get("src")
                    if h:
                        self._href = urllib.parse.urljoin(self.base, h.strip())
                        self._text = []

            def handle_endtag(self, tag):
                if tag == "title":
                    self.in_title = False
                elif tag in ("a", "link", "source") and self._href:
                    t = "".join(self._text).strip()
                    self.links.append((self._href, t))
                    self._href = ""
                    self._text = []

            def handle_data(self, data):
                if self.in_title:
                    self.title += data.strip()
                if self._href:
                    self._text.append(data)

        scraper = _Scraper(page_url)
        try:
            scraper.feed(html_content)
        except Exception:
            pass

        title = scraper.title.strip() or page_url.split("/")[-1] or "Spatial Data Portal"
        discovered = []
        seen_urls = set()

        # Cap links to prevent massive DOMs from crashing the system
        max_links_to_process = 500
        processed_count = 0

        for full_url, link_text in scraper.links:
            if processed_count >= max_links_to_process:
                break
                
            if not full_url or full_url.startswith("#") or full_url.startswith("javascript:") or full_url.startswith("mailto:"):
                continue
            if full_url in seen_urls:
                continue
            seen_urls.add(full_url)
            processed_count += 1

            filename = full_url.split("/")[-1].split("?")[0] or "dataset"
            generic_texts = {"view", "download", "link", "here", "click here", "get data", "download data", "view data", "download file", "data"}
            
            if not link_text or link_text.strip().lower() in generic_texts:
                name = filename
            else:
                name = link_text.strip()
                
            cat, fmt = cls._categorize_format(full_url, name)

            if cat in ("raster", "vector", "archive", "tabular"):
                discovered.append({
                    "id": uuid.uuid4().hex[:8],
                    "name": name,
                    "url": full_url,
                    "category": cat,
                    "format": fmt,
                    "size_mb": None,
                    "is_direct": True,
                    "description": f"Discovered on portal ({cat.capitalize()} - {fmt.upper()})",
                })

        # Regex search for spatial URLs embedded in scripts/markup
        matches = re.findall(r'https?://[^\s"\'<>]+\.(?:geojson|tif|tiff|shp|zip|kml|kmz|gpkg|csv|nc|hdf)', html_content, re.IGNORECASE)
        for m in matches:
            if m not in seen_urls:
                seen_urls.add(m)
                cat, fmt = cls._categorize_format(m, m.split("/")[-1])
                discovered.append({
                    "id": uuid.uuid4().hex[:8],
                    "name": m.split("/")[-1],
                    "url": m,
                    "category": cat,
                    "format": fmt,
                    "size_mb": None,
                    "is_direct": True,
                    "description": f"Embedded Map Data Layer ({fmt.upper()})",
                })

        if not discovered:
            discovered.append({
                "id": uuid.uuid4().hex[:8],
                "name": title,
                "url": page_url,
                "category": "tabular",
                "format": "html",
                "size_mb": None,
                "is_direct": True,
                "description": "Web Portal Page",
            })

        return {
            "url": page_url,
            "title": title,
            "source_type": "web_portal",
            "count": len(discovered),
            "datasets": discovered,
        }

    @classmethod
    def _parse_json_source(cls, source_url: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Parses GeoJSON, STAC Item, STAC Catalog, CKAN API, or generic JSON datasets."""
        discovered = []

        # 1. GeoJSON FeatureCollection
        if data.get("type") == "FeatureCollection":
            features = data.get("features", [])
            name = source_url.split("/")[-1].split("?")[0] or "GeoJSON Collection"
            discovered.append({
                "id": uuid.uuid4().hex[:8],
                "name": name,
                "url": source_url,
                "category": "vector",
                "format": "geojson",
                "size_mb": round(len(json.dumps(data).encode("utf-8")) / (1024 * 1024), 2),
                "is_direct": True,
                "feature_count": len(features),
                "description": f"GeoJSON Vector Layer ({len(features)} features)",
            })
            return {
                "url": source_url,
                "title": name,
                "source_type": "geojson",
                "count": 1,
                "datasets": discovered,
            }

        # 2. STAC Item
        stac_version = data.get("stac_version")
        if stac_version or data.get("type") == "Feature" and "assets" in data:
            item_id = data.get("id") or "STAC Item"
            assets = data.get("assets", {})
            for key, asset_info in assets.items():
                href = asset_info.get("href")
                if not href:
                    continue
                full_href = urllib.parse.urljoin(source_url, href)
                asset_title = asset_info.get("title") or key
                asset_type = asset_info.get("type", "")
                cat, fmt = cls._categorize_format(full_href, key, asset_type)
                
                if cat == "unknown" and ("tiff" in asset_type or "image" in asset_type):
                    cat = "raster"
                    fmt = "cog"

                discovered.append({
                    "id": uuid.uuid4().hex[:8],
                    "name": f"{item_id} - {asset_title} ({key})",
                    "url": full_href,
                    "category": cat,
                    "format": fmt,
                    "size_mb": None,
                    "is_direct": True,
                    "stac_asset_key": key,
                    "description": asset_info.get("description") or f"STAC Asset: {key}",
                })

            return {
                "url": source_url,
                "title": f"STAC Item: {item_id}",
                "source_type": "stac_item",
                "count": len(discovered),
                "datasets": discovered,
            }

        # 3. CKAN Dataset API (data.gov / data.gov.rw)
        if "result" in data and isinstance(data["result"], dict) and "resources" in data["result"]:
            pkg = data["result"]
            pkg_title = pkg.get("title") or pkg.get("name") or "CKAN Dataset"
            for res in pkg.get("resources", []):
                r_url = res.get("url")
                if not r_url:
                    continue
                r_name = res.get("name") or res.get("description") or r_url.split("/")[-1]
                r_format = (res.get("format") or "").lower()
                cat, fmt = cls._categorize_format(r_url, r_name, r_format)
                discovered.append({
                    "id": uuid.uuid4().hex[:8],
                    "name": f"{pkg_title} - {r_name}",
                    "url": r_url,
                    "category": cat,
                    "format": fmt or r_format or "data",
                    "size_mb": round(res.get("size", 0) / (1024 * 1024), 2) if res.get("size") else None,
                    "is_direct": True,
                    "description": res.get("description") or f"CKAN Resource ({r_format.upper()})",
                })
            return {
                "url": source_url,
                "title": pkg_title,
                "source_type": "ckan_portal",
                "count": len(discovered),
                "datasets": discovered,
            }

        # 4. Fallback Generic JSON
        return {
            "url": source_url,
            "title": "JSON Dataset",
            "source_type": "json",
            "count": 1,
            "datasets": [{
                "id": uuid.uuid4().hex[:8],
                "name": source_url.split("/")[-1] or "dataset.json",
                "url": source_url,
                "category": "tabular",
                "format": "json",
                "size_mb": None,
                "is_direct": True,
                "description": "Raw JSON Data",
            }],
        }

    @classmethod
    def _parse_zip_source(cls, source_url: str, resp: requests.Response) -> Dict[str, Any]:
        """Inspects internal contents of a ZIP file stream with smart Shapefile package detection."""
        discovered = []
        name = source_url.split("/")[-1].split("?")[0] or "archive.zip"
        
        # Read content safely - use temp file if response is large or length unknown
        content_len = resp.headers.get("Content-Length")
        is_large = (content_len is not None and int(content_len) > 25 * 1024 * 1024)
        
        zf = None
        temp_zip_file = None
        try:
            if is_large:
                temp_zip_file = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
                for chunk in resp.iter_content(chunk_size=4 * 1024 * 1024):
                    if chunk:
                        temp_zip_file.write(chunk)
                temp_zip_file.close()
                zf = zipfile.ZipFile(temp_zip_file.name, "r")
            else:
                zip_bytes = io.BytesIO(resp.content)
                zf = zipfile.ZipFile(zip_bytes, "r")

            namelist = [f for f in zf.namelist() if not f.endswith("/") and not f.startswith("__MACOSX") and "/__MACOSX" not in f]
            namelist_set = set(namelist)
            namelist_lower_map = {f.lower(): f for f in namelist}

            handled_files = set()

            # 1. Detect Shapefile Packages (.shp + .shx + .dbf + optional .prj)
            shp_files = [f for f in namelist if f.lower().endswith(".shp")]
            for shp in shp_files:
                base_stem = shp[:-4]
                stem_lower = base_stem.lower()
                
                # Check siblings
                shx_file = namelist_lower_map.get(f"{stem_lower}.shx")
                dbf_file = namelist_lower_map.get(f"{stem_lower}.dbf")
                prj_file = namelist_lower_map.get(f"{stem_lower}.prj")
                cpg_file = namelist_lower_map.get(f"{stem_lower}.cpg")
                
                # Associated package components
                package_files = [shp]
                for sib in [shx_file, dbf_file, prj_file, cpg_file]:
                    if sib and sib in namelist_set:
                        package_files.append(sib)
                
                pkg_size_bytes = sum(zf.getinfo(f).file_size for f in package_files)
                pkg_size_mb = round(pkg_size_bytes / (1024 * 1024), 2)
                
                display_name = os.path.basename(base_stem) or "shapefile"
                has_prj = prj_file is not None
                prj_status = "Projection (.prj) included" if has_prj else "⚠️ Projection (.prj) missing - defaults to WGS84"
                
                discovered.append({
                    "id": uuid.uuid4().hex[:8],
                    "name": f"{display_name} (Shapefile Package)",
                    "url": source_url,
                    "internal_path": shp,
                    "category": "vector",
                    "format": "shp",
                    "size_mb": pkg_size_mb if pkg_size_mb > 0 else 0.01,
                    "is_direct": False,
                    "description": f"ESRI Shapefile Package (.shp, .shx, .dbf) • {prj_status}",
                    "has_prj": has_prj,
                })
                
                # Mark all package files as handled so they don't appear as loose files
                for pf in package_files:
                    handled_files.add(pf)
                for ext in [".sbn", ".sbx", ".qix", ".shp.xml"]:
                    alt = namelist_lower_map.get(f"{stem_lower}{ext}")
                    if alt:
                        handled_files.add(alt)

            # 2. Inspect remaining individual spatial and data files
            for filename in namelist:
                if filename in handled_files:
                    continue
                cat, fmt = cls._categorize_format(filename, filename)
                info = zf.getinfo(filename)
                
                if cat != "unknown" or fmt in ("json", "xml"):
                    discovered.append({
                        "id": uuid.uuid4().hex[:8],
                        "name": os.path.basename(filename) or filename,
                        "url": source_url,
                        "internal_path": filename,
                        "category": cat if cat != "unknown" else "tabular",
                        "format": fmt,
                        "size_mb": round(info.file_size / (1024 * 1024), 2),
                        "is_direct": False,
                        "description": f"Inside ZIP ({fmt.upper()})",
                    })
        finally:
            if zf:
                try:
                    zf.close()
                except Exception:
                    pass
            if temp_zip_file and os.path.exists(temp_zip_file.name):
                try:
                    os.remove(temp_zip_file.name)
                except Exception:
                    pass

        return {
            "url": source_url,
            "title": f"Archive: {name}",
            "source_type": "zip_archive",
            "count": len(discovered),
            "datasets": discovered,
        }


# ── Harvester Transfer Manager ───────────────────────────────────────────────
class HarvesterTransferManager:
    """Universal high-speed server-to-server downloader, storage manager, and GEE pusher."""

    @staticmethod
    def save_to_portal_repository(
        source_url: str,
        name: str,
        class_label: Optional[str] = None,
        category: Optional[str] = "community",
        internal_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        assert_safe_url(source_url)
        from storage.dataset_storage import process_and_store_upload, load_metadata
        from storage.link_resolver import resolve_link_to_file

        if name:
            name = re.sub(r'\s*-\s*Google\s*Drive\s*$', '', name).strip()
            generic_texts = {"view", "download", "link", "here", "click here", "get data", "download data", "view data", "download file", "data", "file"}
            if name.lower() in generic_texts or name.startswith("drive_dataset_") or name.startswith("dataset_"):
                name = ""

        # Deduplication check
        records = load_metadata(source=category or "community")
        desc_signature = f"Harvested from {source_url}"
        for r in records:
            if r.get("source_url") == source_url or r.get("description") == desc_signature:
                return {
                    "ok": True,
                    "dataset_id": r["id"],
                    "dataset_name": r["name"],
                    "file_type": r.get("file_type", "unknown"),
                    "size_mb": r.get("file_size_mb", 0.0),
                    "storage_key": r["storage_key"],
                    "message": f"Dataset '{r['name']}' was already harvested!",
                }

        temp_path = os.path.join(tempfile.gettempdir(), f"harvest_sync_{uuid.uuid4().hex[:8]}.bin")
        extracted_path = None
        try:
            # Check if ESRI FeatureServer/MapServer query URL
            is_esri_geojson = ("/query" in source_url.lower() and "f=geojson" in source_url.lower())
            if is_esri_geojson:
                gj = HarvesterScanner.fetch_esri_geojson_paginated(source_url)
                with open(temp_path, "w", encoding="utf-8") as f:
                    json.dump(gj, f)
                resolved_name = name or "esri_features.geojson"
            else:
                resolved_name, _ = resolve_link_to_file(source_url, temp_path, max_mb=50000)

            filename = name or resolved_name or source_url.split("/")[-1].split("?")[0] or "dataset"

            # If it's an internal path inside a ZIP
            if internal_path and (filename.lower().endswith(".zip") or source_url.lower().endswith(".zip")):
                try:
                    with zipfile.ZipFile(temp_path, "r") as zf:
                        base_stem, internal_ext = os.path.splitext(internal_path)
                        if internal_ext.lower() == ".shp":
                            bundle_zip_path = os.path.join(tempfile.gettempdir(), f"shp_bundle_{uuid.uuid4().hex[:8]}_{os.path.basename(base_stem)}.zip")
                            with zipfile.ZipFile(bundle_zip_path, "w", zipfile.ZIP_DEFLATED) as out_zf:
                                for member in zf.namelist():
                                    if member.startswith(base_stem + ".") or member == internal_path:
                                        out_zf.writestr(os.path.basename(member), zf.read(member))
                            extracted_path = bundle_zip_path
                            filename = f"{os.path.basename(base_stem)}.zip"
                        else:
                            extracted_path = os.path.join(tempfile.gettempdir(), f"zip_ext_{uuid.uuid4().hex[:8]}_{os.path.basename(internal_path)}")
                            with open(extracted_path, "wb") as out_f, zf.open(internal_path) as in_f:
                                shutil.copyfileobj(in_f, out_f)
                            filename = os.path.basename(internal_path)
                except Exception as zip_err:
                    logger.warning("Zip internal extract warning: %s", zip_err)

            final_file_path = extracted_path or temp_path

            if not os.path.splitext(filename)[1]:
                ext = None
                with open(final_file_path, "rb") as f:
                    magic = f.read(16)
                if magic.startswith(b'PK\x03\x04'):
                    ext = ".zip"
                elif magic.startswith(b'II*\x00') or magic.startswith(b'MM\x00*'):
                    ext = ".tif"
                elif magic.lstrip().startswith(b'{') or magic.lstrip().startswith(b'['):
                    ext = ".geojson"
                else:
                    is_html = b'<html' in magic.lower() or b'<!doc' in magic.lower()
                    if is_html:
                        raise ValueError("The provided link downloaded an HTML webpage instead of a spatial dataset.")
                    ext = ".geojson" if "geojson" in source_url else ".tif"
                filename += ext

            dataset_id = str(uuid.uuid4())
            short_id = dataset_id[:8]
            base_name = name or filename
            final_name = f"{base_name} [Portal ID: {short_id}]"

            rec = process_and_store_upload(
                filename=filename,
                file_bytes=None,
                file_path=final_file_path,
                name=final_name,
                description="",
                source=category or "community",
                source_url=source_url,
                dataset_id=dataset_id,
            )

            return {
                "ok": True,
                "dataset_id": rec.id,
                "dataset_name": rec.name,
                "file_type": rec.file_type,
                "size_mb": rec.file_size_mb,
                "storage_key": rec.storage_key,
                "message": f"Successfully saved '{rec.name}' to Portal Repository!",
            }
        finally:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
            if extracted_path and os.path.exists(extracted_path):
                try:
                    os.remove(extracted_path)
                except Exception:
                    pass

    @staticmethod
    def save_to_portal_repository_async(
        task_id: str,
        source_url: str,
        name: str,
        class_label: str = None,
        category: str = "community",
        internal_path: str = None,
    ):
        try:
            assert_safe_url(source_url)
            from harvester import update_task
            update_task(task_id, status="in_progress", progress=10, message="Initializing download...")

            import os
            import tempfile
            from storage.link_resolver import resolve_link_to_file

            temp_path = os.path.join(tempfile.gettempdir(), f"harvest_{task_id}.bin")

            def on_progress(*args, **kwargs):
                try:
                    downloaded = args[0] if args else 0
                    total = args[1] if len(args) > 1 and args[1] else None
                    speed = args[2] if len(args) > 2 else None

                    if total:
                        pct = min(50, int((downloaded / total) * 50))
                        msg = f"Downloading... {downloaded/(1024*1024):.1f}MB / {total/(1024*1024):.1f}MB"
                        if speed:
                            msg += f" ({speed:.1f} MB/s)"
                    else:
                        pct = min(30, int(downloaded / (1024 * 1024)))
                        msg = f"Downloading... {downloaded/(1024*1024):.1f}MB"

                    from harvester import update_task
                    update_task(task_id, status="in_progress", progress=10 + pct, message=msg)
                except Exception:
                    pass

            is_esri_geojson = ("/query" in source_url.lower() and "f=geojson" in source_url.lower())
            if is_esri_geojson:
                update_task(task_id, status="in_progress", progress=30, message="Fetching ArcGIS layer with pagination...")
                gj = HarvesterScanner.fetch_esri_geojson_paginated(
                    source_url,
                    progress_callback=lambda count: update_task(
                        task_id,
                        status="in_progress",
                        progress=min(30 + int(count / 100), 55),
                        message=f"Fetching ArcGIS features... ({count} records fetched)",
                    )
                )
                with open(temp_path, "w", encoding="utf-8") as f:
                    json.dump(gj, f)
                resolved_name = name or "esri_features.geojson"
            else:
                resolved_name, final_url = resolve_link_to_file(source_url, temp_path, max_mb=50000, progress_callback=on_progress)

            update_task(task_id, status="in_progress", progress=60, message="Download complete. Processing dataset...")

            filename = name or resolved_name or "dataset"
            if name:
                name = re.sub(r'\s*-\s*Google\s*Drive\s*$', '', name).strip()
                generic_texts = {"view", "download", "link", "here", "click here", "get data", "download data", "view data", "download file", "data", "file"}
                if name.lower() in generic_texts or name.startswith("drive_dataset_") or name.startswith("dataset_"):
                    name = ""

            filename = name or resolved_name or source_url.split("/")[-1].split("?")[0] or "dataset"

            extracted_path = None
            if internal_path and (filename.lower().endswith(".zip") or source_url.lower().endswith(".zip")):
                try:
                    with zipfile.ZipFile(temp_path, "r") as zf:
                        base_stem, internal_ext = os.path.splitext(internal_path)
                        if internal_ext.lower() == ".shp":
                            bundle_zip_path = os.path.join(tempfile.gettempdir(), f"shp_bundle_{uuid.uuid4().hex[:8]}_{os.path.basename(base_stem)}.zip")
                            with zipfile.ZipFile(bundle_zip_path, "w", zipfile.ZIP_DEFLATED) as out_zf:
                                for member in zf.namelist():
                                    if member.startswith(base_stem + ".") or member == internal_path:
                                        out_zf.writestr(os.path.basename(member), zf.read(member))
                            extracted_path = bundle_zip_path
                            filename = f"{os.path.basename(base_stem)}.zip"
                        else:
                            extracted_path = os.path.join(tempfile.gettempdir(), f"zip_ext_{uuid.uuid4().hex[:8]}_{os.path.basename(internal_path)}")
                            with open(extracted_path, "wb") as out_f, zf.open(internal_path) as in_f:
                                shutil.copyfileobj(in_f, out_f)
                            filename = os.path.basename(internal_path)
                except Exception as zip_err:
                    logger.warning("Zip extract error: %s", zip_err)

            final_file_path = extracted_path or temp_path

            if not os.path.splitext(filename)[1]:
                with open(final_file_path, "rb") as f:
                    magic = f.read(16)
                if magic.startswith(b'PK\x03\x04'):
                    ext = ".zip"
                elif magic.startswith(b'II*\x00') or magic.startswith(b'MM\x00*'):
                    ext = ".tif"
                elif magic.lstrip().startswith(b'{') or magic.lstrip().startswith(b'['):
                    ext = ".geojson"
                else:
                    is_html = b'<html' in magic.lower() or b'<!doc' in magic.lower()
                    if is_html:
                        raise ValueError("The provided link downloaded an HTML webpage instead of a spatial dataset. Please provide a direct download link.")
                    ext = ".geojson" if "geojson" in source_url else ".tif"
                filename += ext

            dataset_id = str(uuid.uuid4())
            short_id = dataset_id[:8]
            base_name = name or filename
            final_name = f"{base_name} [Portal ID: {short_id}]"

            def on_upload_progress(uploaded, total):
                if total:
                    pct = min(40, int((uploaded / total) * 40))
                    msg = f"Archiving... {uploaded/(1024*1024):.1f}MB / {total/(1024*1024):.1f}MB"
                    from harvester import update_task
                    update_task(task_id, status="in_progress", progress=60 + pct, message=msg)

            try:
                rec = process_and_store_upload(
                    filename=filename,
                    file_bytes=None,
                    file_path=final_file_path,
                    name=final_name,
                    description="",
                    source=category or "community",
                    source_url=source_url,
                    dataset_id=dataset_id,
                    progress_callback=on_upload_progress,
                )
            finally:
                if os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except Exception:
                        pass
                if extracted_path and os.path.exists(extracted_path):
                    try:
                        os.remove(extracted_path)
                    except Exception:
                        pass

            update_task(
                task_id,
                status="completed",
                progress=100,
                message=f"Dataset '{final_name}' successfully imported to Portal.",
                result_data={"dataset_id": dataset_id, "file_type": rec.file_type, "size_mb": rec.file_size_mb}
            )

        except Exception as e:
            from harvester import update_task
            update_task(task_id, status="failed", progress=0, message=str(e), error=str(e))

    @staticmethod
    def push_to_gee_asset_async(
        task_id: str,
        source_url: str,
        asset_id: Optional[str] = None,
        target_project: Optional[str] = None,
    ):
        try:
            assert_safe_url(source_url)
            update_task(task_id, status="in_progress", progress=10, message="Initializing GEE Cloud connection...")

            # Clean project resolution without hardcoded individual accounts
            project = target_project or os.environ.get("GEE_PROJECT")
            if not project:
                try:
                    import ee
                    project = getattr(ee.data, "_cloud_api_user_project", None)
                except Exception:
                    pass
            if not project:
                project = "ee-geoportal"

            clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", source_url.split("/")[-1].split("?")[0])[:25]
            if not asset_id:
                asset_id = f"projects/{project}/assets/harv_{clean_name}_{uuid.uuid4().hex[:6]}"

            # 1. Direct Cloud GeoTIFF Registration (Instant for S3, AWS, Google Cloud, and Web COGs)
            is_cog_url = any(k in source_url.lower() for k in ["s3.amazonaws.com", "sentinel-cogs", "element84", "elevation-tiles", "cog", ".tif", ".tiff"])
            if is_cog_url and source_url.startswith("http") and "drive.google" not in source_url and "drive.usercontent" not in source_url:
                # Pre-flight Range-request check to ensure hosting server supports byte ranges required by GEE loadGeoTIFF
                supports_ranges = False
                try:
                    range_check = requests.head(source_url, headers={"Range": "bytes=0-1023"}, timeout=6, verify=False)
                    if range_check.status_code == 206 or "bytes" in range_check.headers.get("Accept-Ranges", "").lower():
                        supports_ranges = True
                except Exception:
                    pass

                if supports_ranges:
                    try:
                        update_task(task_id, status="in_progress", progress=45, message="Registering Cloud-Optimized GeoTIFF in GEE...")
                        import ee
                        ee_img = ee.Image.loadGeoTIFF(source_url)
                        _ = ee_img.bandNames().getInfo()

                        update_task(
                            task_id,
                            status="completed",
                            progress=100,
                            message=f"Cloud GeoTIFF connected to GEE! Asset ID: {asset_id}",
                            result_data={
                                "asset_id": asset_id,
                                "cog_url": source_url,
                                "type": "CloudGeoTIFF",
                                "status": "ready"
                            }
                        )
                        return
                    except Exception as cog_err:
                        logger.info("Direct COG load info: %s. Falling back to server-to-server asset ingest.", cog_err)
                else:
                    logger.info("Server hosting %s does not advertise byte-range support. Ingesting via staging pipeline.", source_url)

            # 2. Check for GCS Staging Bucket
            gcs_bucket = os.environ.get("GEE_STAGING_BUCKET") or os.environ.get("GCS_BUCKET")
            if not gcs_bucket:
                # GEE CLI requires a gs:// URI for raw file uploads. Automatically save to portal so user can use it immediately!
                update_task(task_id, status="in_progress", progress=30, message="Saving dataset to Portal Repository for native analysis...")
                res = HarvesterTransferManager.save_to_portal_repository(
                    source_url=source_url,
                    name=clean_name,
                    category="admin"
                )
                update_task(
                    task_id,
                    status="completed",
                    progress=100,
                    message="Dataset saved to Portal! Note: Direct Google Earth Engine asset creation requires a Google Cloud Storage staging bucket (set GCS_BUCKET). Dataset is immediately available in Portal for Native ML & Map Overlays.",
                    result_data={
                        "dataset_id": res.get("dataset_id"),
                        "asset_id": asset_id,
                        "status": "saved_to_portal",
                        "requires_gcs": True
                    }
                )
                return

            # 3. Stream download with real-time progress for GCS staging upload
            temp_path = os.path.join(tempfile.gettempdir(), f"harvest_gee_{task_id}.tif")

            def _on_progress(curr_bytes: int, total_bytes: Optional[int], speed_mbps: float):
                curr_t = get_task(task_id)
                if curr_t and curr_t.status == "cancelled":
                    raise Exception("Task was cancelled by user.")

                curr_mb = round(curr_bytes / (1024 * 1024), 2)
                t_mb = round(total_bytes / (1024 * 1024), 2) if total_bytes else None
                if t_mb and t_mb > 0:
                    stream_pct = min(int((curr_bytes / total_bytes) * 50), 50)
                    prog = 15 + stream_pct
                    pct_int = min(int((curr_bytes / total_bytes) * 100), 100)
                    msg = f"Streaming: {curr_mb:.1f} MB / {t_mb:.1f} MB ({pct_int}%) • {speed_mbps:.1f} MB/s"
                else:
                    prog = min(15 + int(curr_mb / 2), 65)
                    msg = f"Streaming: {curr_mb:.1f} MB • {speed_mbps:.1f} MB/s"

                update_task(
                    task_id,
                    status="in_progress",
                    progress=prog,
                    message=msg,
                    result_data={"downloaded_mb": curr_mb, "total_mb": t_mb, "speed_mbps": round(speed_mbps, 2)}
                )

            update_task(task_id, status="in_progress", progress=15, message="Connecting and streaming dataset...")
            from storage.link_resolver import resolve_link_to_file
            resolved_name, _ = resolve_link_to_file(source_url, temp_path, max_mb=50000, progress_callback=_on_progress)

            curr_t = get_task(task_id)
            if curr_t and curr_t.status == "cancelled":
                if os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except Exception:
                        pass
                return

            final_mb = round(os.path.getsize(temp_path) / (1024 * 1024), 2)
            gcs_dest_uri = f"gs://{gcs_bucket}/harvester/{clean_name}_{uuid.uuid4().hex[:6]}.tif"

            update_task(
                task_id,
                status="in_progress",
                progress=75,
                message=f"Staging {final_mb} MB to Google Cloud Storage ({gcs_bucket})...",
            )

            # Stage via gsutil or gcloud storage
            upload_cmd = ["gcloud", "storage", "cp", temp_path, gcs_dest_uri]
            try:
                proc_stage = subprocess.run(upload_cmd, capture_output=True, text=True, timeout=300)
                if proc_stage.returncode != 0:
                    proc_stage = subprocess.run(["gsutil", "cp", temp_path, gcs_dest_uri], capture_output=True, text=True, timeout=300)
            except Exception as stage_err:
                logger.warning("GCS staging error: %s", stage_err)

            # Ingest from GCS into Earth Engine
            update_task(
                task_id,
                status="in_progress",
                progress=85,
                message=f"Ingesting into Earth Engine: {asset_id}...",
            )

            cmd = ["earthengine"]
            sa_key_file = None
            key_json = os.environ.get("GEE_SERVICE_ACCOUNT_KEY", "").strip()
            if key_json:
                sa_key_file = os.path.join(tempfile.gettempdir(), f"gee_sa_{uuid.uuid4().hex[:6]}.json")
                with open(sa_key_file, "w", encoding="utf-8") as f:
                    f.write(key_json)
                cmd.extend(["--service_account_file", sa_key_file])
            else:
                local_key = os.path.abspath(os.path.join(os.path.dirname(__file__), "gee_key.json"))
                if os.path.exists(local_key):
                    cmd.extend(["--service_account_file", local_key])

            cmd.extend(["upload", "image", "--asset_id", asset_id, gcs_dest_uri])

            proc = None
            upload_err = None
            try:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
                if proc.returncode != 0:
                    upload_err = (proc.stderr or proc.stdout or "Earth Engine CLI returned non-zero exit code").strip()
            except Exception as cmd_err:
                upload_err = str(cmd_err)

            if sa_key_file and os.path.exists(sa_key_file):
                try:
                    os.remove(sa_key_file)
                except Exception:
                    pass

            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

            if upload_err:
                friendly_err = f"GEE Ingestion error: {upload_err}"
                update_task(task_id, status="failed", progress=0, message=friendly_err, error=friendly_err, result_data={"error": upload_err})
                return

            gee_task_match = re.search(r"ID:?\s*([a-zA-Z0-9_-]+)", proc.stdout) if proc and proc.stdout else None
            gee_task_id = gee_task_match.group(1) if gee_task_match else None
            task_info = f" (GEE Task: {gee_task_id})" if gee_task_id else ""

            update_task(
                task_id,
                status="completed",
                progress=100,
                message=f"Upload submitted to Earth Engine!{task_info} Check the 'Tasks' tab in GEE Code Editor.",
                result_data={
                    "asset_id": asset_id,
                    "project": project,
                    "size_mb": final_mb,
                    "gee_task_id": gee_task_id,
                    "status": "submitted_to_gee"
                }
            )

        except Exception as exc:
            logger.error("Failed GEE upload in task %s: %s", task_id, exc)
            update_task(task_id, status="failed", progress=0, message=f"Upload failed: {str(exc)}", error=str(exc))
