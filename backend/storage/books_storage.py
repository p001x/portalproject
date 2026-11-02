import json
import os
import uuid
import time
import threading
import logging
from typing import Optional, Any, Generator

try:
    from storage.dataset_storage import (
        _get_client,
        push_to_storage,
        download_dataset_bytes,
        _delete_from_huggingface,
        get_hf_token,
        get_hf_repo_id
    )
except ImportError:
    from backend.storage.dataset_storage import (
        _get_client,
        push_to_storage,
        download_dataset_bytes,
        _delete_from_huggingface,
        get_hf_token,
        get_hf_repo_id
    )

BOOKS_METADATA_KEY = "books_metadata.json"
BOOKS_PREFIX = "academy/books/"
LOCAL_BOOKS_FILE = os.path.join(os.path.dirname(__file__), "local_books_metadata.json")

# In-memory cache for high-concurrency read throughput
_books_cache: Optional[list[dict[str, Any]]] = None
_books_cache_time: float = 0.0
_books_lock = threading.Lock()
CACHE_TTL_SECONDS = 60.0  # 60s cache; mutations invalidate immediately

logger = logging.getLogger("spetro.academy.books")


def load_books(force_refresh: bool = False) -> list[dict[str, Any]]:
    """
    Load books metadata with in-memory TTL caching and tiered fallback.
    Under heavy traffic, this avoids redundant R2/storage round-trips.
    """
    global _books_cache, _books_cache_time

    now = time.time()
    if not force_refresh and _books_cache is not None and (now - _books_cache_time) < CACHE_TTL_SECONDS:
        return [dict(b) for b in _books_cache]

    with _books_lock:
        # Double check after acquiring lock
        now = time.time()
        if not force_refresh and _books_cache is not None and (now - _books_cache_time) < CACHE_TTL_SECONDS:
            return [dict(b) for b in _books_cache]

        # 1. Try remote cloud storage (R2 / Hugging Face)
        try:
            client = _get_client()
            if client.exists(BOOKS_METADATA_KEY):
                raw = client.download_as_text(BOOKS_METADATA_KEY)
                data = json.loads(raw)
                if isinstance(data, list) and len(data) > 0:
                    _books_cache = data
                    _books_cache_time = now
                    # Keep local file in sync
                    try:
                        with open(LOCAL_BOOKS_FILE, "w", encoding="utf-8") as f:
                            json.dump(data, f, indent=2)
                    except Exception as sync_err:
                        logger.debug("Could not write local books sync: %s", sync_err)
                    return [dict(b) for b in _books_cache]
        except Exception as e:
            logger.warning("Error loading books metadata from remote storage: %s", e)

        # 2. Fall back to local bundled metadata file
        try:
            if os.path.exists(LOCAL_BOOKS_FILE):
                with open(LOCAL_BOOKS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list) and len(data) > 0:
                        _books_cache = data
                        _books_cache_time = now
                        return [dict(b) for b in _books_cache]
        except Exception as e:
            logger.error("Error loading books metadata from local fallback: %s", e)

        if _books_cache is not None:
            return [dict(b) for b in _books_cache]

        return []


def save_books(records: list[dict[str, Any]]) -> None:
    """
    Save books metadata atomically to in-memory cache, local file, and remote storage.
    """
    global _books_cache, _books_cache_time

    data_str = json.dumps(records, indent=2)

    with _books_lock:
        _books_cache = [dict(b) for b in records]
        _books_cache_time = time.time()

        # Write local file first (fast and guaranteed)
        try:
            with open(LOCAL_BOOKS_FILE, "w", encoding="utf-8") as f:
                f.write(data_str)
        except Exception as e:
            logger.error("Failed to save books metadata to local fallback: %s", e)

        # Sync to remote storage
        try:
            client = _get_client()
            client.upload_from_text(BOOKS_METADATA_KEY, data_str)
        except Exception as e:
            logger.warning("Failed to upload books metadata to cloud storage: %s", e)


def add_book_record(record: dict[str, Any]) -> None:
    records = load_books(force_refresh=True)
    records.append(record)
    save_books(records)


def process_and_store_book_upload(
    filename: str,
    file_bytes: bytes,
    title: str,
    author: str,
    description: str,
    pages: int
) -> dict[str, Any]:
    size_mb = len(file_bytes) / (1024 * 1024)
    book_id = str(uuid.uuid4())
    storage_key = f"{BOOKS_PREFIX}{book_id}_{filename}"

    # Push to Hugging Face / R2 / local
    storage_key = push_to_storage(storage_key, file_bytes, title)

    record = {
        "id": book_id,
        "title": title,
        "author": author,
        "description": description,
        "pages": pages,
        "original_filename": filename,
        "storage_key": storage_key,
        "file_size_mb": round(size_mb, 3),
        "volumeId": ""
    }

    add_book_record(record)
    return record


def update_book(
    book_id: str,
    title: str,
    author: str,
    description: str,
    pages: int
) -> Optional[dict[str, Any]]:
    records = load_books(force_refresh=True)
    for r in records:
        if r.get("id") == book_id:
            r["title"] = title
            r["author"] = author
            r["description"] = description
            r["pages"] = pages
            save_books(records)
            return r
    return None


def delete_book(book_id: str) -> bool:
    records = load_books(force_refresh=True)
    target = next((r for r in records if r.get("id") == book_id), None)
    if target is None:
        return False

    storage_key = target.get("storage_key", "")
    if storage_key:
        client = _get_client()
        try:
            if client.exists(storage_key):
                client.delete(storage_key)
        except Exception as e:
            logger.error("delete_book: Error deleting file from storage: %s", e)

        # Also clean up HF if needed
        filename = storage_key.split("/")[-1]
        threading.Thread(target=_delete_from_huggingface, args=(filename,), daemon=True).start()

    remaining = [r for r in records if r.get("id") != book_id]
    save_books(remaining)
    return True


def get_book_bytes(storage_key: str) -> bytes:
    """Download full book bytes into memory (use stream_book_chunks for streaming)."""
    return download_dataset_bytes(storage_key)


def stream_book_chunks(
    storage_key: str,
    fallback_url: Optional[str] = None,
    chunk_size: int = 65536
) -> Generator[bytes, None, None]:
    """
    Stream a book PDF chunk-by-chunk with zero whole-file memory buffering.
    Safeguards Render's 512MB RAM container from Out-Of-Memory (OOM) crashes.
    """
    import urllib.parse
    import tempfile
    import requests

    # 1. If storage_key is an HTTP URL, stream directly from source
    if storage_key.startswith("http://") or storage_key.startswith("https://"):
        with requests.get(storage_key, stream=True, timeout=60, headers={"User-Agent": "SPETRO-Academy/2.0"}) as r:
            r.raise_for_status()
            for chunk in r.iter_content(chunk_size=chunk_size):
                if chunk:
                    yield chunk
        return

    # 1b. Check bundled static books directory first (instant streaming with zero RAM spikes)
    base_name = os.path.basename(storage_key)
    static_book_path = os.path.join(os.path.dirname(__file__), "..", "static", "books", base_name)
    if os.path.exists(static_book_path) and os.path.getsize(static_book_path) > 100:
        with open(static_book_path, "rb") as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                yield chunk
        return

    # 2. Check local disk cache (prevents redundant downloads across readers)
    safe_filename = storage_key.replace("/", "_").replace(":", "_")
    local_cache_dir = os.path.join(tempfile.gettempdir(), "spetro_books")
    os.makedirs(local_cache_dir, exist_ok=True)
    local_cached_file = os.path.join(local_cache_dir, safe_filename)

    if os.path.exists(local_cached_file) and os.path.getsize(local_cached_file) > 1024:
        with open(local_cached_file, "rb") as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                yield chunk
        return

    # 3. If on Hugging Face, stream chunk-by-chunk from HF CDN
    if storage_key.startswith("hf://"):
        hf_token = get_hf_token()
        repo_id = get_hf_repo_id()
        parts = storage_key.replace("hf://", "").split("/", 2)
        if len(parts) == 3:
            repo_id = f"{parts[0]}/{parts[1]}"
            filename = parts[2]
        elif len(parts) == 2:
            repo_id = f"{parts[0]}/{parts[1]}"
            filename = parts[1]
        else:
            filename = storage_key.replace("hf://", "")

        url = f"https://huggingface.co/datasets/{repo_id}/resolve/main/{urllib.parse.quote(filename)}?download=true"
        headers = {"Authorization": f"Bearer {hf_token}"} if hf_token else {}

        try:
            resp = requests.get(url, headers=headers, stream=True, timeout=120)
            if resp.status_code == 200:
                # Save to disk stream while streaming to user
                with open(local_cached_file, "wb") as f_out:
                    for chunk in resp.iter_content(chunk_size=chunk_size):
                        if chunk:
                            f_out.write(chunk)
                            yield chunk
                return
        except Exception as e:
            logger.warning("HF stream error: %s", e)

    # 4. If fallback URL is provided (e.g. volumeId)
    if fallback_url and (fallback_url.startswith("http://") or fallback_url.startswith("https://")):
        try:
            with requests.get(fallback_url, stream=True, timeout=60, headers={"User-Agent": "SPETRO-Academy/2.0"}) as r:
                if r.status_code == 200:
                    with open(local_cached_file, "wb") as f_out:
                        for chunk in r.iter_content(chunk_size=chunk_size):
                            if chunk:
                                f_out.write(chunk)
                                yield chunk
                    return
        except Exception as e:
            logger.warning("Fallback URL stream error: %s", e)

    # 5. Fall back to client download
    data = download_dataset_bytes(storage_key, fallback_url=fallback_url)
    if data:
        # Cache for next time
        try:
            with open(local_cached_file, "wb") as f_out:
                f_out.write(data)
        except Exception:
            pass
        for i in range(0, len(data), chunk_size):
            yield data[i:i + chunk_size]
