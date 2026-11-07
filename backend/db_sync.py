"""Database synchronization and persistent Cloudflare R2 backup for SPETRO Geoportal."""

import os
import shutil
import sqlite3
import threading
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("db_sync")

_HERE = Path(__file__).resolve().parent
_ENV_FILE = _HERE / ".env"
_DB_PATH = _HERE / "data" / "storage.db"
_R2_KEY = "database/storage.db"

# Ensure .env is loaded if not already loaded
if not os.environ.get("R2_BUCKET_NAME") and _ENV_FILE.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_ENV_FILE)
    except Exception:
        pass


def get_r2_client():
    """Returns an S3 client for Cloudflare R2 if configured, else (None, None)."""
    endpoint = os.environ.get("R2_ENDPOINT_URL", "").strip().strip('"')
    access_key = os.environ.get("R2_ACCESS_KEY_ID", "").strip().strip('"')
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip().strip('"')
    bucket = os.environ.get("R2_BUCKET_NAME", "").strip().strip('"')

    if not (endpoint and access_key and secret_key and bucket):
        return None, None

    try:
        import boto3
        from botocore.config import Config
        s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(signature_version="s3v4", connect_timeout=5, read_timeout=10),
        )
        return s3, bucket
    except Exception as exc:
        logger.warning("Failed to initialize R2 client: %s", exc)
        return None, None


def download_db_from_r2() -> bool:
    """Download the persistent database from Cloudflare R2 on startup.
    Returns True if successfully downloaded or already up-to-date.
    """
    s3, bucket = get_r2_client()
    if not s3 or not bucket:
        logger.info("R2 not configured; skipping database download.")
        return False

    try:
        # Check if R2 has the database object
        head = s3.head_object(Bucket=bucket, Key=_R2_KEY)
        remote_size = head.get("ContentLength", 0)
        if remote_size <= 0:
            logger.warning("R2 database object is 0 bytes; skipping.")
            return False

        _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp_target = _DB_PATH.with_suffix(".r2tmp")

        logger.info(f"Downloading persistent database from R2 ({remote_size} bytes)...")
        s3.download_file(bucket, _R2_KEY, str(tmp_target))

        # Validate downloaded SQLite file integrity
        try:
            conn = sqlite3.connect(str(tmp_target))
            cur = conn.cursor()
            cur.execute("PRAGMA quick_check")
            check = cur.fetchone()
            conn.close()
            if check and check[0] == "ok":
                # Valid SQLite file, swap it in
                if _DB_PATH.exists():
                    try:
                        _DB_PATH.unlink()
                    except Exception:
                        pass
                tmp_target.replace(_DB_PATH)
                logger.info(f"Successfully restored persistent database from Cloudflare R2 ({remote_size} bytes).")
                return True
            else:
                logger.error(f"Downloaded R2 database corrupted (quick_check: {check}). Keeping local file.")
                if tmp_target.exists():
                    tmp_target.unlink()
                return False
        except Exception as e:
            logger.error(f"Failed SQLite integrity check on downloaded R2 database: {e}")
            if tmp_target.exists():
                tmp_target.unlink()
            return False

    except Exception as exc:
        logger.warning("Could not download database from R2: %s", exc)
        return False


def _do_upload():
    s3, bucket = get_r2_client()
    if not s3 or not bucket:
        return

    if not _DB_PATH.exists():
        return

    try:
        # Create a backup copy to prevent reading locked/active WAL file
        tmp_backup = _DB_PATH.with_suffix(".upload_tmp")
        try:
            src_conn = sqlite3.connect(str(_DB_PATH))
            bck_conn = sqlite3.connect(str(tmp_backup))
            with bck_conn:
                src_conn.backup(bck_conn)
            bck_conn.close()
            src_conn.close()
        except Exception:
            shutil.copyfile(str(_DB_PATH), str(tmp_backup))

        s3.upload_file(str(tmp_backup), bucket, _R2_KEY)
        logger.info("Successfully synced database to Cloudflare R2.")
        if tmp_backup.exists():
            tmp_backup.unlink()
    except Exception as exc:
        logger.warning("Failed to sync database to R2: %s", exc)


def upload_db_to_r2(async_run: bool = True):
    """Uploads the current database to Cloudflare R2."""
    if async_run:
        thread = threading.Thread(target=_do_upload, daemon=True)
        thread.start()
    else:
        _do_upload()


BASELINE_USERS = [
    {
        "name": "ndorimana yang",
        "email": "petersonyang8@gmail.com",
        "password_hash": "$2b$12$PmsZI1GYnLgWo9NYkfTGKuobpkWs5pIF1TgevEIACWDVlNxo7GMeq",
        "role": "admin",
        "is_verified": 1,
    },
    {
        "name": "ndorimana yang",
        "email": "pierrendorimana16@gmail.com",
        "password_hash": "$2b$12$nqejsJZjbGkzatFCjM0WquVO0NaXD/kpl235WKi81op3dxgYk6jry",
        "role": "admin",
        "is_verified": 1,
    },
    {
        "name": "tzar",
        "email": "tzartzar19@gmail.com",
        "password_hash": "$2b$12$MRklDmQzp1u.u2rovfQZOeSRalvl652mLI8kwM1NHwhGUZvOOLkwm",
        "role": "user",
        "is_verified": 1,
    },
]


def seed_baseline_users():
    """Ensure baseline admin and registered users exist in the SQLite database."""
    if not _DB_PATH.exists():
        return
    try:
        from datetime import datetime, timezone
        conn = sqlite3.connect(str(_DB_PATH))
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if not cur.fetchone():
            conn.close()
            return

        now = datetime.now(timezone.utc).isoformat()
        seeded_any = False
        for u in BASELINE_USERS:
            cur.execute("SELECT id FROM users WHERE LOWER(email) = LOWER(?)", (u["email"],))
            row = cur.fetchone()
            if not row:
                cur.execute(
                    "INSERT INTO users (name, email, password_hash, role, is_verified, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (u["name"], u["email"].lower(), u["password_hash"], u["role"], u["is_verified"], now)
                )
                logger.info(f"Seeded baseline user: {u['email']} ({u['role']})")
                seeded_any = True
            else:
                # Ensure admin role is enforced
                if u["role"] == "admin":
                    cur.execute("UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER(?)", (u["email"],))
        conn.commit()
        conn.close()
        if seeded_any:
            upload_db_to_r2(async_run=True)
    except Exception as exc:
        logger.warning("Error seeding baseline users: %s", exc)
