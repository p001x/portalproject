"""
General-purpose "paste any link, get file bytes" resolver.

Used by Sample Digitization to import a single image/GeoTIFF from a link.
Implemented as a chain of handlers — one per source category — tried in
order: link shorteners are expanded first (since they can mask any other
category), then known share-link hosts are rewritten to their direct-file
form, then the bytes are actually fetched.

Categories that are honestly supported (no extra credentials needed, and
verified to work without an API key):
- Direct HTTP(S) file URLs (any extension), including S3, GCS (https or
  gs://), and Azure Blob URLs that are public or already carry a token/SAS
  in the query string.
- Google Drive: a single file shared as "Anyone with the link" (file/open/uc
  link shapes), including the large-file virus-scan interstitial.
- Dropbox: a single shared file link (rewritten to force a direct download).
- OneDrive / 1drv.ms: a single shared file link (via the public, no-auth
  OneDrive "shares" API — no OneDrive account or app registration needed).
- GitHub "blob" page links (rewritten to raw.githubusercontent.com).
- Link shorteners (bit.ly, tinyurl, goo.gl, t.co, ow.ly, is.gd, buff.ly,
  rebrand.ly) — expanded via redirect before the checks above run.
- ftp:// links (anonymous or user:pass embedded in the URL).

Categories that are deliberately rejected with a clear, specific message,
because supporting them for real would need credentials/APIs this project
doesn't have configured — no mocked/fake fetches are implemented for these:
- Drive/Dropbox *folders* and Google Photos albums (need OAuth + the Drive/
  Photos API to list contents).
- Gmail/Outlook attachment links (need OAuth against the mail API).
- Box share links (no reliable anonymous direct-download without the Box API).
- Imgur/Flickr *albums* (need that service's API to list images; single
  direct image links like i.imgur.com/x.jpg work fine as plain URLs).
- WMS/WMTS/XYZ tile templates/ArcGIS ImageServer (these serve rendered
  tiles/layers on demand, not one downloadable file).
- SFTP (needs login credentials + an SFTP client).
- Google Earth Engine asset IDs (already live in GEE's own storage — not
  something to "download" via a link).

Note on Cloud-Optimized GeoTIFFs: this resolver always downloads the full
file (capped, see `max_mb`) rather than remote-streaming just the needed
tiles via GDAL's /vsicurl/. That matches how this feature actually uses the
image (loaded whole into memory for map preview + digitization), so partial
streaming would add real complexity for no benefit here.
"""

from __future__ import annotations

import base64
import re
import urllib.request
from urllib.parse import urlparse
import os
import concurrent.futures

import requests

DEFAULT_TIMEOUT = 30

_SHORTENER_DOMAINS = {
    "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly", "rebrand.ly",
}

_DRIVE_ID_PATTERNS = [
    re.compile(r"/file/d/([a-zA-Z0-9_-]{15,})"),
    re.compile(r"/d/([a-zA-Z0-9_-]{15,})"),
    re.compile(r"[?&]id=([a-zA-Z0-9_-]{15,})"),
    re.compile(r"/open\?id=([a-zA-Z0-9_-]{15,})"),
    re.compile(r"/uc\?id=([a-zA-Z0-9_-]{15,})"),
]

_GEE_ASSET_PATTERN = re.compile(r"^(users/[\w.-]+/|projects/[\w.-]+/assets/)")


class LinkResolutionError(ValueError):
    """Raised for any link that can't honestly be resolved to a single fetchable file."""


def _expand_shortlink(url: str) -> str:
    """Follow redirects for known link-shortener domains before pattern matching.

    1drv.ms is intentionally excluded — the OneDrive direct-download trick needs
    the *original* share URL, not wherever it redirects to.
    """
    host = urlparse(url).netloc.lower()
    if host not in _SHORTENER_DOMAINS:
        return url
    try:
        resp = requests.head(url, allow_redirects=True, timeout=DEFAULT_TIMEOUT)
        if resp.url and resp.url != url:
            return resp.url
        # Some shorteners don't answer HEAD requests (405) — fall back to a streamed GET.
        resp = requests.get(url, allow_redirects=True, timeout=DEFAULT_TIMEOUT, stream=True)
        resp.close()
        return resp.url or url
    except requests.RequestException:
        return url  # let the real fetch attempt surface the real error


def _reject_unsupported(url: str) -> None:
    """Raise a clear, specific error for categories this project can't honestly support."""
    lower = url.lower()
    host = urlparse(url).netloc.lower()

    if "drive.google.com" in host and "/folders/" in lower:
        raise LinkResolutionError(
            "This is a Google Drive **folder** link. Listing folder contents needs the Drive "
            "API with OAuth, which isn't set up in this project. Open the folder, then paste a "
            "link to one file at a time instead."
        )
    if "photos.app.goo.gl" in host or "photos.google.com" in host:
        raise LinkResolutionError(
            "Google Photos share links need the Google Photos Library API (OAuth), which isn't "
            "set up in this project. Download the image from Google Photos, then upload it or "
            "host it somewhere with a plain file link instead."
        )
    if "mail.google.com" in host or "outlook.office.com" in host:
        raise LinkResolutionError(
            "Email attachment links need OAuth against the Gmail/Outlook API, which isn't set up "
            "here. Open the email, save the attachment (or grab the Drive/Dropbox link inside the "
            "email body) and paste that link instead."
        )
    if "dropbox.com" in host and "/sh/" in lower:
        raise LinkResolutionError(
            "This is a Dropbox **folder** link. Listing folder contents needs the Dropbox API, "
            "which isn't set up in this project. Open the folder, then paste a link to one file "
            "at a time instead."
        )
    if "app.box.com" in host:
        raise LinkResolutionError(
            "Box share links can't be downloaded reliably without the Box API (OAuth), which "
            "isn't set up in this project. Download the file from Box, then upload it or host it "
            "somewhere with a plain file link instead."
        )
    if ("imgur.com" == host or "imgur.com" in host and host != "i.imgur.com") and re.search(r"/(a|gallery)/", lower):
        raise LinkResolutionError(
            "This is a photo **album/gallery** link, not a single file — listing it needs that "
            "service's API. Open the album and paste a link to one direct image instead (e.g. "
            "i.imgur.com/XXXX.jpg)."
        )
    if "flickr.com" in host:
        raise LinkResolutionError(
            "Flickr links need the Flickr API to resolve to a downloadable image, which isn't "
            "set up in this project."
        )
    if re.search(r"/(wms|wmts)\b", lower) or "request=getmap" in lower or "/imageserver" in lower:
        raise LinkResolutionError(
            "This looks like a map **service** endpoint (WMS/WMTS/ArcGIS ImageServer) — it serves "
            "rendered tiles/layers on demand, not a single downloadable file. This resolver only "
            "imports single files."
        )
    if "{z}/{x}/{y}" in lower:
        raise LinkResolutionError(
            "This is an XYZ tile template — it serves individual map tiles on demand, not one "
            "downloadable file."
        )
    if lower.startswith("sftp://"):
        raise LinkResolutionError(
            "SFTP links need login credentials and an SFTP client, which isn't set up in this "
            "project. Use an anonymous FTP or HTTPS link instead."
        )
    if not lower.startswith(("http://", "https://", "ftp://")) and _GEE_ASSET_PATTERN.match(url.strip()):
        raise LinkResolutionError(
            "This looks like a Google Earth Engine asset ID, not a downloadable link — it already "
            "lives in Earth Engine's own storage. This resolver is for importing external files "
            "from a URL, not for loading existing GEE assets."
        )


def _rewrite_known_hosts(url: str) -> str:
    """Rewrite share links from known hosts into direct-download form.

    Handled here (reliable, no extra credentials needed): GitHub blob pages,
    Dropbox, `gs://` URIs, OneDrive/1drv.ms. Google Drive is handled
    separately in `_fetch_drive` since it needs a session for the
    virus-scan interstitial on larger files.
    """
    stripped = url.strip()

    if stripped.startswith("gs://"):
        return "https://storage.googleapis.com/" + stripped[len("gs://"):]

    if stripped.startswith("s3://"):
        return "https://s3.amazonaws.com/" + stripped[len("s3://"):]

    if "github.com" in stripped and "/blob/" in stripped and "raw.githubusercontent.com" not in stripped:
        return stripped.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/")

    if "docs.google.com" in stripped:
        if "/spreadsheets/" in stripped and "export" not in stripped:
            return re.sub(r"/edit.*", "/export?format=csv", stripped)
        if "/document/" in stripped and "export" not in stripped:
            return re.sub(r"/edit.*", "/export?format=docx", stripped)

    host = urlparse(stripped).netloc.lower()

    if "dropbox.com" in host:
        if re.search(r"[?&]dl=0\b", stripped):
            return re.sub(r"([?&])dl=0\b", r"\1dl=1", stripped)
        if "dl=1" not in stripped:
            return stripped + ("&" if "?" in stripped else "?") + "dl=1"
        return stripped

    if "onedrive.live.com" in host or "1drv.ms" in host:
        # Public, no-auth technique for anonymous OneDrive share links (Microsoft's
        # "shares" API accepts a base64-encoded form of the original share URL).
        encoded = base64.urlsafe_b64encode(stripped.encode()).decode().rstrip("=")
        return f"https://api.onedrive.com/v1.0/shares/u!{encoded}/root/content"

    if "huggingface.co" in host and "/blob/" in stripped:
        return stripped.replace("/blob/", "/resolve/")

    return stripped


def _drive_file_id(url: str) -> str | None:
    lower = url.lower()
    if "drive.google.com" not in lower and "drive.usercontent.google.com" not in lower and "docs.google.com" not in lower:
        return None
    for pattern in _DRIVE_ID_PATTERNS:
        m = pattern.search(url)
        if m:
            return m.group(1)
    return None


def _filename_from_response(resp: requests.Response, fallback_url: str) -> str:
    disposition = resp.headers.get("Content-Disposition", "")
    m = re.search(r'filename="?([^";]+)"?', disposition)
    if m:
        return m.group(1)
    path = urlparse(fallback_url).path
    name = path.rsplit("/", 1)[-1]
    return name or "downloaded_file"


def _read_capped(resp: requests.Response, max_mb: float, progress_callback=None) -> bytes:
    import time
    content_length = resp.headers.get("Content-Length")
    total_bytes = int(content_length) if content_length and content_length.isdigit() else None
    if total_bytes and total_bytes > max_mb * 1024 * 1024:
        raise LinkResolutionError(
            f"File is {total_bytes / (1024*1024):.1f} MB, exceeds the {max_mb:.0f} MB cap."
        )
    chunks, total = [], 0
    start_time = time.time()
    last_update = start_time

    for chunk in resp.iter_content(chunk_size=1024 * 1024):
        if not chunk:
            continue
        total += len(chunk)
        if total > max_mb * 1024 * 1024:
            raise LinkResolutionError(f"File exceeds the {max_mb:.0f} MB cap.")
        chunks.append(chunk)

        if progress_callback:
            now = time.time()
            if now - last_update >= 0.35:
                last_update = now
                elapsed = max(now - start_time, 0.001)
                speed_mbps = (total / elapsed) / (1024 * 1024)
                progress_callback(total, total_bytes, speed_mbps)

    if progress_callback:
        elapsed = max(time.time() - start_time, 0.001)
        speed_mbps = (total / elapsed) / (1024 * 1024)
        progress_callback(total, total_bytes or total, speed_mbps)

    return b"".join(chunks)


def _drive_confirm_get(session: requests.Session, url: str, params: dict) -> requests.Response:
    resp = session.get(url, params=params, timeout=DEFAULT_TIMEOUT, stream=True)
    resp.raise_for_status()
    return resp


def _fetch_drive(url: str, max_mb: float, progress_callback=None) -> tuple[bytes, str, str]:
    """Google Drive file shared as 'Anyone with the link'.

    Handles large-file virus-scan interstitials across both modern POST/GET form flows
    on drive.usercontent.google.com and cookie/token confirmations.
    """
    file_id = _drive_file_id(url)
    if not file_id:
        raise LinkResolutionError(f"Could not extract Google Drive file ID from URL: {url}")

    base = "https://drive.google.com/uc"
    params = {"id": file_id, "export": "download"}
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    })

    try:
        resp = _drive_confirm_get(session, base, params)
    except requests.RequestException as e:
        raise LinkResolutionError(f"Could not reach that Drive link: {e}") from e

    # Up to 4 attempts to resolve download warning / confirmation forms
    for attempt in range(4):
        content_type = resp.headers.get("Content-Type", "")
        if "text/html" not in content_type.lower():
            break  # Got the actual binary file stream!

        text = resp.text
        if "Quota exceeded" in text or "quota exceeded" in text.lower():
            raise LinkResolutionError(
                "This file's Google Drive download quota has been exceeded for today (too many "
                "people have downloaded it). Try again later, or ask the owner to make a direct "
                "copy available elsewhere."
            )

        # 1. Look for modern hidden form (drive.usercontent.google.com/download)
        action_m = re.search(r'action="([^"]*drive\.usercontent\.google\.com/download[^"]*)"', text, re.IGNORECASE)
        if action_m:
            action_url = action_m.group(1).replace("&amp;", "&")
            method_m = re.search(r'<form[^>]*action="[^"]*drive\.usercontent\.google\.com/download[^"]*"[^>]*method="([^"]+)"', text, re.IGNORECASE)
            method = (method_m.group(1) if method_m else "post").lower()

            hidden_inputs = {}
            for input_match in re.finditer(r'<input\b[^>]*>', text, re.IGNORECASE):
                tag = input_match.group(0)
                name_m = re.search(r'name="([^"]+)"', tag, re.IGNORECASE)
                val_m = re.search(r'value="([^"]*)"', tag, re.IGNORECASE)
                if name_m and val_m:
                    hidden_inputs[name_m.group(1)] = val_m.group(1)

            try:
                if method == "post":
                    resp = session.post(action_url, data=hidden_inputs, timeout=DEFAULT_TIMEOUT, stream=True)
                else:
                    resp = session.get(action_url, params=hidden_inputs, timeout=DEFAULT_TIMEOUT, stream=True)
                resp.raise_for_status()
                if "text/html" not in resp.headers.get("Content-Type", "").lower():
                    break
            except requests.RequestException:
                pass

        # 2. Token-based confirmation fallback
        token = next((v for k, v in resp.cookies.items() if k.startswith("download_warning")), None)
        if not token:
            m = re.search(r"confirm=([0-9A-Za-z_-]+)", text)
            token = m.group(1) if m else None
        if not token:
            token = "t"

        # 3. Direct usercontent GET query
        try:
            direct_url = f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm={token}"
            resp = session.get(direct_url, timeout=DEFAULT_TIMEOUT, stream=True)
            if resp.status_code == 200 and "text/html" not in resp.headers.get("Content-Type", "").lower():
                break
        except requests.RequestException:
            pass

        # 4. Fallback to /uc?id=...&confirm=...
        try:
            resp = _drive_confirm_get(session, base, {**params, "confirm": token})
            if "text/html" not in resp.headers.get("Content-Type", "").lower():
                break
        except requests.RequestException as e:
            if attempt >= 2:
                raise LinkResolutionError(f"Could not reach that Drive link: {e}") from e

    content_type = resp.headers.get("Content-Type", "")
    if "text/html" in content_type.lower():
        raise LinkResolutionError(
            "This Drive link requires access permission or isn't shared as 'Anyone with the link'. "
            "Please check the sharing settings on Google Drive and try again."
        )

    file_bytes = _read_capped(resp, max_mb, progress_callback=progress_callback)
    return file_bytes, _filename_from_response(resp, url), resp.url or url


def _fetch_ftp(url: str, max_mb: float, progress_callback=None) -> tuple[bytes, str, str]:
    try:
        with urllib.request.urlopen(url, timeout=DEFAULT_TIMEOUT) as resp:
            data = resp.read(int(max_mb * 1024 * 1024) + 1)
    except Exception as e:  # noqa: BLE001 - a bad link must never crash the app
        raise LinkResolutionError(f"Could not reach that FTP link: {e}") from e
    if len(data) > max_mb * 1024 * 1024:
        raise LinkResolutionError(f"File exceeds the {max_mb:.0f} MB cap.")
    filename = urlparse(url).path.rsplit("/", 1)[-1] or "downloaded_file"
    return data, filename, url


def _fetch_generic(url: str, max_mb: float, progress_callback=None) -> tuple[bytes, str, str]:
    headers = {}
    if "kaggle.com" in url:
        import os
        token = os.environ.get("KAGGLE_API_TOKEN")
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
    try:
        resp = requests.get(url, timeout=DEFAULT_TIMEOUT, stream=True, headers=headers)
        resp.raise_for_status()
    except requests.RequestException as e:
        raise LinkResolutionError(f"Could not reach that link: {e}") from e
    file_bytes = _read_capped(resp, max_mb, progress_callback=progress_callback)
    return file_bytes, _filename_from_response(resp, url), resp.url or url


def resolve_link(url: str, max_mb: float = 50000, progress_callback=None) -> tuple[bytes, str, str]:
    """Resolve any of the supported link formats (see module docstring) to raw bytes.

    Returns (file_bytes, filename, resolved_url). Raises LinkResolutionError with a
    specific, honest message for anything that can't be resolved to a single file.
    """
    url = (url or "").strip()
    if not url:
        raise LinkResolutionError("Paste a link first.")

    url = _expand_shortlink(url)
    _reject_unsupported(url)
    url = _rewrite_known_hosts(url)

    if _drive_file_id(url):
        return _fetch_drive(url, max_mb, progress_callback=progress_callback)
    if url.lower().startswith("ftp://"):
        return _fetch_ftp(url, max_mb, progress_callback=progress_callback)
    if url.lower().startswith(("http://", "https://")):
        return _fetch_generic(url, max_mb, progress_callback=progress_callback)

    raise LinkResolutionError(
        f"Unrecognized link format: `{url}`. Paste a direct HTTP(S)/FTP file URL, a Google Drive "
        "file link, or one of the other supported cloud-storage link formats."
    )

def resolve_link_url(url: str) -> str:
    """Resolve the given URL to its final direct download HTTP URL,
    without downloading the file bytes. Used for zero-download streaming.
    """
    url = (url or "").strip()
    if not url:
        raise LinkResolutionError("Paste a link first.")

    url = _expand_shortlink(url)
    _reject_unsupported(url)
    url = _rewrite_known_hosts(url)

    file_id = _drive_file_id(url)
    if file_id:
        # Best effort direct download URL
        return f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t"

    return url

def _stream_to_file(resp, output_path: str, max_mb: float, progress_callback=None) -> None:
    size = 0
    cap = max_mb * 1024 * 1024
    with open(output_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8 * 1024 * 1024):  # 8 MB chunks
            if chunk:
                size += len(chunk)
                if size > cap:
                    raise LinkResolutionError(f"File exceeds the {max_mb:.0f} MB cap.")
                f.write(chunk)
                if progress_callback:
                    progress_callback(size)

def _parallel_download(url: str, output_path: str, file_size: int, headers: dict, max_mb: float, progress_callback=None) -> None:
    num_threads = 4
    chunk_size = file_size // num_threads
    
    # Pre-allocate file
    with open(output_path, "wb") as f:
        f.seek(file_size - 1)
        f.write(b'\0')
        
    downloaded_bytes = 0
    
    def download_range(start: int, end: int):
        range_headers = headers.copy()
        range_headers["Range"] = f"bytes={start}-{end}"
        resp = requests.get(url, headers=range_headers, stream=True, timeout=DEFAULT_TIMEOUT)
        resp.raise_for_status()
        
        if resp.status_code != 206:
            raise ValueError("Server ignored Range header, falling back to single stream")
        
        nonlocal downloaded_bytes
        with open(output_path, "r+b") as f:
            f.seek(start)
            for chunk in resp.iter_content(chunk_size=4 * 1024 * 1024):
                if chunk:
                    f.write(chunk)
                    downloaded_bytes += len(chunk)
                    if progress_callback:
                        progress_callback(downloaded_bytes, file_size)
                        
    futures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_threads) as executor:
        for i in range(num_threads):
            start = i * chunk_size
            end = start + chunk_size - 1 if i < num_threads - 1 else file_size - 1
            futures.append(executor.submit(download_range, start, end))
            
        for future in concurrent.futures.as_completed(futures):
            future.result() # raise exceptions if any

def resolve_link_to_file(url: str, output_path: str, max_mb: float = 50000, progress_callback=None) -> tuple[str, str]:
    url = (url or "").strip()
    if not url:
        raise LinkResolutionError("Paste a link first.")

    url = _expand_shortlink(url)
    _reject_unsupported(url)
    url = _rewrite_known_hosts(url)

    if _drive_file_id(url):
        file_bytes, name, final_url = _fetch_drive(url, max_mb, progress_callback)
        with open(output_path, "wb") as f:
            f.write(file_bytes)
        return name, final_url
        
    if url.lower().startswith("ftp://"):
        file_bytes, name, final_url = _fetch_ftp(url, max_mb, progress_callback)
        with open(output_path, "wb") as f:
            f.write(file_bytes)
        return name, final_url

    if url.lower().startswith(("http://", "https://")):
        headers = {}
        if "kaggle.com" in url:
            token = os.environ.get("KAGGLE_API_TOKEN")
            if token:
                headers["Authorization"] = f"Bearer {token}"
                
        try:
            head_resp = requests.head(url, headers=headers, timeout=DEFAULT_TIMEOUT, allow_redirects=True)
            final_url = head_resp.url or url
            name = _filename_from_response(head_resp, url)
            
            if head_resp.headers.get("Accept-Ranges") == "bytes" and "Content-Length" in head_resp.headers:
                file_size = int(head_resp.headers["Content-Length"])
                if file_size > max_mb * 1024 * 1024:
                    raise LinkResolutionError(f"File exceeds the {max_mb:.0f} MB cap.")
                if file_size > 10 * 1024 * 1024: # Only parallel for > 10MB
                    try:
                        _parallel_download(final_url, output_path, file_size, headers, max_mb, progress_callback)
                        return name, final_url
                    except ValueError:
                        # Fallback if server doesn't support Range requests properly
                        pass
        except Exception:
            pass
            
        try:
            resp = requests.get(url, timeout=DEFAULT_TIMEOUT, stream=True, headers=headers)
            resp.raise_for_status()
        except requests.RequestException as e:
            raise LinkResolutionError(f"Could not reach that link: {e}") from e
            
        _stream_to_file(resp, output_path, max_mb, progress_callback)
        return _filename_from_response(resp, url), resp.url or url

    raise LinkResolutionError(f"Unrecognized link format: `{url}`")
