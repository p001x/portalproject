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
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
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

# ── In-Memory Task Store ─────────────────────────────────────────────────────
@dataclass
class HarvesterTask:
    task_id: str
    action: str  # "download", "save_to_portal", "push_to_gee"
    source_url: str
    target_name: str
    status: str = "pending"  # "pending", "in_progress", "completed", "failed"
    progress: int = 0  # 0 to 100
    message: str = ""
    error: Optional[str] = None
    result_data: Optional[Dict[str, Any]] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

HARVESTER_TASKS: Dict[str, HarvesterTask] = {}

def get_task(task_id: str) -> Optional[HarvesterTask]:
    return HARVESTER_TASKS.get(task_id)

def create_task(action: str, source_url: str, target_name: str) -> HarvesterTask:
    t_id = f"harv_{uuid.uuid4().hex[:10]}"
    task = HarvesterTask(
        task_id=t_id,
        action=action,
        source_url=source_url,
        target_name=target_name,
        status="pending",
        message="Task initialized",
    )
    HARVESTER_TASKS[t_id] = task
    return task

def update_task(task_id: str, status: str, progress: int, message: str, error: Optional[str] = None, result_data: Optional[Dict[str, Any]] = None):
    t = HARVESTER_TASKS.get(task_id)
    if t:
        # Don't overwrite if task has already been cancelled
        if t.status == "cancelled" and status != "cancelled":
            return
        t.status = status
        t.progress = progress
        t.message = message
        t.error = error
        t.result_data = result_data or t.result_data
        t.updated_at = datetime.now(timezone.utc).isoformat()

def cancel_task(task_id: str) -> bool:
    t = HARVESTER_TASKS.get(task_id)
    if t:
        t.status = "cancelled"
        t.message = "Task stopped by user."
        t.updated_at = datetime.now(timezone.utc).isoformat()
        return True
    return False

def delete_task(task_id: str) -> bool:
    if task_id in HARVESTER_TASKS:
        del HARVESTER_TASKS[task_id]
        return True
    return False


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
    def _fetch_url_resilient(cls, url: str) -> requests.Response:
        """Fetches URL with automatic SSL fallback, redirect following, and URL decoding."""
        session = requests.Session()
        session.headers.update(DEFAULT_HEADERS)

        # 1. Try standard secure request
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
    def scan_url(cls, target_url: str) -> Dict[str, Any]:
        """Deep scan any target URL and discover all spatial and data assets."""
        target_url = target_url.strip()
        if not target_url:
            raise ValueError("URL cannot be empty")

        # 1. Normalize and unquote URL (e.g. %2e -> .)
        target_url = urllib.parse.unquote(target_url)
        if not target_url.startswith("http://") and not target_url.startswith("https://") and not target_url.startswith("gs://"):
            target_url = "https://" + target_url

        # 2. Check Google Drive share links
        from storage.link_resolver import _drive_file_id, resolve_link_url
        drive_id = _drive_file_id(target_url)
        if drive_id:
            direct_url = resolve_link_url(target_url)
            filename = target_url.split("/")[-1].split("?")[0]
            size_mb = None
            try:
                from storage.link_resolver import _filename_from_response
                s = requests.Session()
                s.headers.update(DEFAULT_HEADERS)
                
                # 1. Try to get filename from direct download headers (accurate for smaller files)
                head_resp = s.get(direct_url, stream=True, timeout=10)
                extracted_name = _filename_from_response(head_resp, target_url)
                if extracted_name and extracted_name != "downloaded_file" and "view" not in extracted_name.lower():
                    filename = extracted_name
                
                # 2. Fallback to HTML scraping if we still have a generic name
                generic_texts = {"view", "download", "link", "here", "click here", "get data", "download data", "view data", "download file", "data", "file", "drive", "google drive - sign in", "meet google drive", "downloaded_file"}
                
                if not filename or filename.lower() in generic_texts:
                    resp = s.get(target_url, timeout=10)
                    
                    # Try og:title metadata first
                    m_og = re.search(r'<meta[^>]*property=[\'"]og:title[\'"][^>]*content=[\'"]([^\'"]+)[\'"]', resp.text, re.IGNORECASE)
                    if m_og:
                        filename = m_og.group(1).strip()
                    else:
                        m = re.search(r'<title>([^<]+)</title>', resp.text, re.IGNORECASE)
                        if m:
                            html_title = m.group(1).strip()
                            filename = re.sub(r'\s*-\s*Google\s*Drive\s*$', '', html_title.replace('\xa0', ' ')).strip()
            except Exception as e:
                logger.warning(f"Drive filename extraction failed: {e}")

            generic_texts = {"view", "download", "link", "here", "click here", "get data", "download data", "view data", "download file", "data", "file", "drive", "google drive - sign in", "meet google drive", "downloaded_file"}
            if not filename or filename.lower() in generic_texts:
                filename = f"drive_dataset_{drive_id[:8]}"

            cat, fmt = cls._categorize_format(filename, filename)
            if cat == "unknown":
                cat = "raster" if ".tif" in filename.lower() or "map" in filename.lower() else "unknown"
                fmt = "tif" if cat == "raster" else "file"

            return {
                "url": target_url,
                "title": filename or "Google Drive Spatial File",
                "source_type": "google_drive",
                "count": 1,
                "datasets": [{
                    "id": uuid.uuid4().hex[:8],
                    "name": filename or "google_drive_dataset",
                    "url": target_url,
                    "category": cat,
                    "format": fmt,
                    "size_mb": size_mb,
                    "is_direct": True,
                    "description": f"Google Drive {fmt.upper()} {cat.capitalize()} Dataset",
                }]
            }

        # 3. Check Dropbox share links
        if "dropbox.com" in target_url and "dl=0" in target_url:
            target_url = target_url.replace("dl=0", "dl=1")

        # 4. Check GitHub repository / raw file
        if "github.com" in target_url and "/blob/" in target_url:
            target_url = target_url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/")

        # 5. Check ESRI / ArcGIS REST Services
        if "/rest/services/" in target_url.lower() or "/featureserver" in target_url.lower() or "/mapserver" in target_url.lower():
            return cls._parse_esri_service(target_url)

        # 5. Fast direct check for single spatial file extension
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
                    "description": f"Direct {fmt.upper()} {cat.capitalize()} dataset",
                }]
            }

        # 6. Fetch resilient response
        resp = cls._fetch_url_resilient(target_url)
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
    def _parse_esri_service(cls, esri_url: str) -> Dict[str, Any]:
        """Parses ArcGIS / ESRI MapServer, FeatureServer, or ImageServer layers."""
        clean_url = esri_url.split("?")[0].rstrip("/")
        meta_url = f"{clean_url}?f=json"
        
        discovered = []
        service_name = clean_url.split("/")[-2] or "ESRI Feature Service"
        
        try:
            r = cls._fetch_url_resilient(meta_url)
            data = r.json()
            service_name = data.get("name") or data.get("mapName") or data.get("description") or service_name
            
            # Layers in service
            layers = data.get("layers", [])
            if not layers and "/FeatureServer" in clean_url or "/MapServer" in clean_url:
                # Single layer query endpoint
                geojson_query_url = f"{clean_url}/query?where=1%3D1&outFields=*&f=geojson"
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
                    lay_query_url = f"{clean_url}/{lay_id}/query?where=1%3D1&outFields=*&f=geojson"
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
                "url": f"{clean_url}/query?where=1%3D1&outFields=*&f=geojson",
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

        for full_url, link_text in scraper.links:
            if not full_url or full_url.startswith("#") or full_url.startswith("javascript:") or full_url.startswith("mailto:"):
                continue
            if full_url in seen_urls:
                continue
            seen_urls.add(full_url)

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
        """Inspects internal contents of a ZIP file stream."""
        discovered = []
        name = source_url.split("/")[-1].split("?")[0] or "archive.zip"
        
        zip_bytes = io.BytesIO(resp.content)
        with zipfile.ZipFile(zip_bytes, "r") as z:
            namelist = z.namelist()
            for filename in namelist:
                if filename.endswith("/") or filename.startswith("__MACOSX"):
                    continue
                cat, fmt = cls._categorize_format(filename, filename)
                info = z.getinfo(filename)
                discovered.append({
                    "id": uuid.uuid4().hex[:8],
                    "name": filename,
                    "url": source_url,
                    "internal_path": filename,
                    "category": cat,
                    "format": fmt,
                    "size_mb": round(info.file_size / (1024 * 1024), 2),
                    "is_direct": False,
                    "description": f"Inside ZIP ({fmt.upper()})",
                })

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
        from storage.dataset_storage import process_and_store_upload, load_metadata
        from storage.link_resolver import resolve_link

        if name:
            name = re.sub(r'\s*-\s*Google\s*Drive\s*$', '', name).strip()
            
            # Additional cleanup for generic names sent from frontend
            generic_texts = {"view", "download", "link", "here", "click here", "get data", "download data", "view data", "download file", "data", "file"}
            if name.lower() in generic_texts or name.startswith("drive_dataset_") or name.startswith("dataset_"):
                name = "" # Force fallback to resolved_name or URL filename
            
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

        # Use link_resolver for Google Drive, Dropbox, OneDrive, or direct files
        try:
            data_bytes, resolved_name, _ = resolve_link(source_url, max_mb=5000)
            if resolved_name:
                resolved_name = re.sub(r'\s*-\s*Google\s*Drive\s*$', '', resolved_name).strip()
            filename = name or resolved_name or "dataset"
        except Exception:
            session = requests.Session()
            session.headers.update(DEFAULT_HEADERS)
            try:
                resp = session.get(source_url, stream=True, timeout=90, verify=True)
                if resp.status_code >= 400:
                    resp = session.get(source_url, stream=True, timeout=90, verify=False)
            except Exception:
                resp = session.get(source_url, stream=True, timeout=90, verify=False)

            resp.raise_for_status()
            data_bytes = resp.content
            filename = name or source_url.split("/")[-1].split("?")[0] or "dataset"

        # If it's an internal path inside a ZIP
        if internal_path and (filename.lower().endswith(".zip") or source_url.lower().endswith(".zip")):
            try:
                zip_file = zipfile.ZipFile(io.BytesIO(data_bytes))
                data_bytes = zip_file.read(internal_path)
                filename = internal_path.split("/")[-1]
            except Exception as zip_err:
                logger.warning("Zip internal extract warning: %s", zip_err)

        if not os.path.splitext(filename)[1]:
            ext = ".geojson" if "geojson" in source_url else ".tif"
            filename += ext

        dataset_id = str(uuid.uuid4())
        short_id = dataset_id[:8]
        
        # Give the dataset a clear name indicating its portal source
        base_name = name or filename
        final_name = f"{base_name} [Portal ID: {short_id}]"

        rec = process_and_store_upload(
            filename=filename,
            file_bytes=data_bytes,
            name=final_name,
            description="",  # Empty description to match local uploads
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
            from harvester import update_task
            update_task(task_id, status="in_progress", progress=10, message="Initializing download...")
            
            # 1. Download to local temp file using link_resolver directly
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
                        # Fallback for chunked or unknown total size
                        # We will cap it at 40% (10 + 30) for unknown sizes so it doesn't stay at 10%
                        pct = min(30, int(downloaded / (1024 * 1024))) 
                        msg = f"Downloading... {downloaded/(1024*1024):.1f}MB"
                        
                    from harvester import update_task
                    update_task(task_id, status="in_progress", progress=10 + pct, message=msg)
                except Exception:
                    pass
                
            resolved_name, final_url = resolve_link_to_file(source_url, temp_path, max_mb=50000, progress_callback=on_progress)
            
            update_task(task_id, status="in_progress", progress=60, message="Download complete. Processing dataset...")
            
            # 2. Skip full memory read for massive files (Memory optimization)
            data_bytes = None
            
            # 3. Call existing sync method essentially inline to get the dataset ID
            filename = name or resolved_name or "dataset"
            if name:
                name = re.sub(r'\s*-\s*Google\s*Drive\s*$', '', name).strip()
                generic_texts = {"view", "download", "link", "here", "click here", "get data", "download data", "view data", "download file", "data", "file"}
                if name.lower() in generic_texts or name.startswith("drive_dataset_") or name.startswith("dataset_"):
                    name = "" 
            
            filename = name or resolved_name or source_url.split("/")[-1].split("?")[0] or "dataset"
            
            import zipfile
            import io
            if internal_path and (filename.lower().endswith(".zip") or source_url.lower().endswith(".zip")):
                try:
                    with zipfile.ZipFile(temp_path) as zip_file:
                        data_bytes = zip_file.read(internal_path)
                    filename = internal_path.split("/")[-1]
                except Exception as zip_err:
                    pass
                    
            if not os.path.splitext(filename)[1]:
                ext = ".geojson" if "geojson" in source_url else ".tif"
                filename += ext
                
            import uuid
            from storage.dataset_storage import process_and_store_upload
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
                    file_bytes=data_bytes,
                    name=final_name,
                    description="",
                    source=category or "community",
                    source_url=source_url,
                    dataset_id=dataset_id,
                    progress_callback=on_upload_progress,
                    file_path=temp_path if data_bytes is None else None
                )
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            
            update_task(task_id, status="completed", progress=100, message=f"Dataset '{final_name}' successfully imported.", result_data={"dataset_id": dataset_id})
            
        except Exception as e:
            from harvester import update_task
            update_task(task_id, status="failed", progress=0, message=str(e))

    @staticmethod
    def push_to_gee_asset_async(
        task_id: str,
        source_url: str,
        asset_id: Optional[str] = None,
        target_project: Optional[str] = None,
    ):
        from storage.link_resolver import resolve_link_url

        try:
            update_task(task_id, status="in_progress", progress=10, message="Initializing GEE Cloud connection...")

            try:
                import ee
                project = target_project or getattr(ee.data, "_cloud_api_user_project", None) or "ee-petersonyang87"
            except Exception:
                project = target_project or "ee-petersonyang87"

            clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", source_url.split("/")[-1].split("?")[0])[:25]
            if not asset_id:
                asset_id = f"projects/{project}/assets/harv_{clean_name}_{uuid.uuid4().hex[:6]}"

            # Direct Cloud GeoTIFF Registration (Instant for S3, AWS, Google Cloud, and Web COGs)
            is_cog_url = any(k in source_url.lower() for k in ["s3.amazonaws.com", "sentinel-cogs", "element84", "elevation-tiles", "cog", ".tif", ".tiff"])
            if is_cog_url and source_url.startswith("http") and "drive.google" not in source_url and "drive.usercontent" not in source_url:
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

            # High-speed streaming download with real-time progress callback
            def _on_progress(curr_bytes: int, total_bytes: Optional[int], speed_mbps: float):
                curr_t = HARVESTER_TASKS.get(task_id)
                if curr_t and curr_t.status == "cancelled":
                    raise Exception("Task was cancelled by user.")

                curr_mb = round(curr_bytes / (1024 * 1024), 2)
                t_mb = round(total_bytes / (1024 * 1024), 2) if total_bytes else None
                if t_mb and t_mb > 0:
                    stream_pct = min(int((curr_bytes / total_bytes) * 60), 60)
                    prog = 15 + stream_pct
                    pct_int = min(int((curr_bytes / total_bytes) * 100), 100)
                    msg = f"Streaming: {curr_mb:.1f} MB / {t_mb:.1f} MB ({pct_int}%) • {speed_mbps:.1f} MB/s"
                else:
                    prog = min(15 + int(curr_mb / 2), 75)
                    msg = f"Streaming: {curr_mb:.1f} MB • {speed_mbps:.1f} MB/s"

                update_task(
                    task_id,
                    status="in_progress",
                    progress=prog,
                    message=msg,
                    result_data={"downloaded_mb": curr_mb, "total_mb": t_mb, "speed_mbps": round(speed_mbps, 2)}
                )

            update_task(task_id, status="in_progress", progress=15, message="Connecting and streaming dataset...")
            from storage.link_resolver import resolve_link
            file_bytes, resolved_name, _ = resolve_link(source_url, max_mb=50000, progress_callback=_on_progress)

            curr_t = HARVESTER_TASKS.get(task_id)
            if curr_t and curr_t.status == "cancelled":
                return

            if not asset_id or "harv_view" in asset_id:
                raw_base = resolved_name or source_url.split("/")[-1].split("?")[0] or "raster"
                clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", os.path.splitext(raw_base)[0])[:35]
                asset_id = f"projects/{project}/assets/{clean_name}"

            final_mb = round(len(file_bytes) / (1024 * 1024), 2)
            with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
                temp_path = tmp.name
                tmp.write(file_bytes)

            update_task(
                task_id,
                status="in_progress",
                progress=80,
                message=f"Downloaded {final_mb} MB. Ingesting into Earth Engine: {asset_id}...",
                result_data={"downloaded_mb": final_mb, "total_mb": final_mb}
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

            cmd.extend(["upload", "image", "--asset_id", asset_id, temp_path])

            proc = None
            upload_err = None
            try:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
                if proc.returncode != 0:
                    upload_err = (proc.stderr or proc.stdout or "Earth Engine CLI returned non-zero exit code").strip()
                    logger.error("Earth Engine CLI error: %s", upload_err)
            except Exception as cmd_err:
                upload_err = str(cmd_err)
                logger.error("Earth Engine CLI execution exception: %s", cmd_err)

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

            curr_t = HARVESTER_TASKS.get(task_id)
            if curr_t and curr_t.status == "cancelled":
                return

            if upload_err:
                if "invalid cloud storage url" in str(upload_err).lower():
                    friendly_err = "Google Earth Engine requires a Google Cloud Storage URI (gs://your-bucket/file.tif) to create permanent GEE assets. To use this dataset right now in the GeoPortal without GCS, click 'Save to Portal' (for ML Classification & Analysis) or 'Preview on Map'."
                elif "cannot find the file" in str(upload_err).lower() or "not recognized" in str(upload_err).lower() or "winerror 2" in str(upload_err).lower():
                    friendly_err = "Earth Engine CLI tool ('earthengine') is not installed on this machine to upload raw file bytes to GEE assets. Use 'Save to Portal' to save and use this dataset directly in the portal for Native ML & Map Overlays."
                else:
                    friendly_err = f"GEE Ingestion error: {upload_err}"
                update_task(
                    task_id,
                    status="failed",
                    progress=0,
                    message=friendly_err,
                    error=friendly_err,
                    result_data={"error": upload_err}
                )
                return

            gee_task_match = re.search(r"ID:?\s*([a-zA-Z0-9_-]+)", proc.stdout) if proc and proc.stdout else None
            gee_task_id = gee_task_match.group(1) if gee_task_match else None
            task_info = f" (GEE Task: {gee_task_id})" if gee_task_id else ""

            update_task(
                task_id,
                status="completed",
                progress=100,
                message=f"Upload submitted to Earth Engine!{task_info} Check the 'Tasks' tab in GEE Code Editor while Earth Engine builds pyramids.",
                result_data={
                    "asset_id": asset_id,
                    "project": project,
                    "size_mb": final_mb,
                    "gee_task_id": gee_task_id,
                    "status": "submitted_to_gee"
                }
            )

        except Exception as exc:
            curr_t = HARVESTER_TASKS.get(task_id)
            if curr_t and curr_t.status == "cancelled":
                logger.info("Task %s cancelled cleanly.", task_id)
                return
            logger.error("Failed GEE upload in task %s: %s", task_id, exc)
            update_task(task_id, status="failed", progress=0, message=f"Upload failed: {str(exc)}", error=str(exc))
