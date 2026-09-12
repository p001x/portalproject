"""
GeoVault — Unified Storage Service.

Provides a local-filesystem storage abstraction replacing Replit Object Storage.
Files stored under `data/` directory, metadata as JSON.
Later phases add GitHub auto-push and Kaggle overflow routing on top of this.
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any, Optional

import logging
import threading

logger = logging.getLogger(__name__)

# ── Root paths ──────────────────────────────────────────────────────────────
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent  # blacportal/
DATA_ROOT = _PROJECT_ROOT / "data"
DATASETS_DIR = DATA_ROOT / "datasets"
COMMUNITY_DIR = DATA_ROOT / "community"
SAMPLES_DIR = DATA_ROOT / "samples"
METADATA_DIR = DATA_ROOT / "metadata"
CONFIG_DIR = _PROJECT_ROOT / "config"

# Ensure dirs exist on import
for d in [DATASETS_DIR, COMMUNITY_DIR, SAMPLES_DIR, METADATA_DIR, CONFIG_DIR]:
    d.mkdir(parents=True, exist_ok=True)

METADATA_FILES = {
    "admin": METADATA_DIR / "datasets_admin.json",
    "community": METADATA_DIR / "datasets_community.json",
}
SAMPLES_FILE = SAMPLES_DIR / "samples.json"
SYNC_LOG_FILE = CONFIG_DIR / "sync-log.md"

_file_lock = threading.Lock()

class StorageService:
    """
    Local-filesystem storage.  Every public method is static so callers
    don't need to manage instances.
    """

    # ── Raw file I/O ────────────────────────────────────────────────────

    @staticmethod
    def save_file(relative_key: str, data: bytes, source: str = "admin") -> str:
        """Save raw bytes under the appropriate source directory.
        Returns the absolute path of the stored file."""
        base = DATASETS_DIR if source == "admin" else COMMUNITY_DIR
        dest = base / relative_key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        logger.info("Stored file: %s (%d bytes)", dest, len(data))
        return str(dest)

    @staticmethod
    def read_file(relative_key: str, source: str = "admin") -> bytes:
        """Read raw bytes from the source directory."""
        base = DATASETS_DIR if source == "admin" else COMMUNITY_DIR
        path = base / relative_key
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        return path.read_bytes()

    @staticmethod
    def delete_file(relative_key: str, source: str = "admin") -> bool:
        """Delete a stored file. Returns True if deleted."""
        base = DATASETS_DIR if source == "admin" else COMMUNITY_DIR
        path = base / relative_key
        if path.exists():
            path.unlink()
            logger.info("Deleted file: %s", path)
            return True
        return False

    @staticmethod
    def file_exists(relative_key: str, source: str = "admin") -> bool:
        base = DATASETS_DIR if source == "admin" else COMMUNITY_DIR
        return (base / relative_key).exists()

    # ── JSON metadata I/O ───────────────────────────────────────────────

    @staticmethod
    def load_metadata(source: str = "admin") -> list[dict[str, Any]]:
        """Load the metadata JSON for a given source."""
        from .db import get_datasets
        try:
            return get_datasets(source)
        except Exception as e:
            logger.error("Failed to load metadata from db: %s", e)
            return []

    @staticmethod
    def save_metadata(records: list[dict[str, Any]], source: str = "admin") -> None:
        """Persist metadata JSON."""
        from .db import save_datasets
        save_datasets(source, records)

    # ── Samples I/O ─────────────────────────────────────────────────────

    @staticmethod
    def load_samples() -> list[dict[str, Any]]:
        from .db import get_samples
        try:
            return get_samples()
        except Exception as e:
            logger.error("Failed to load samples from db: %s", e)
            return []

    @staticmethod
    def save_samples(records: list[dict[str, Any]]) -> None:
        from .db import save_samples
        save_samples(records)

    # ── Sync log ────────────────────────────────────────────────────────

    @staticmethod
    def append_sync_log(entry: str) -> None:
        """Append a line to config/sync-log.md."""
        with _file_lock:
            with open(SYNC_LOG_FILE, "a", encoding="utf-8") as f:
                f.write(entry + "\n")

    @staticmethod
    def read_sync_log() -> str:
        if not SYNC_LOG_FILE.exists():
            return ""
        with _file_lock:
            return SYNC_LOG_FILE.read_text(encoding="utf-8")
