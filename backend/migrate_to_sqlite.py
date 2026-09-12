import os
import json
import logging
from pathlib import Path
from storage.db import init_db, save_datasets, save_samples, save_all_gee_sessions

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = _PROJECT_ROOT / "data"
METADATA_DIR = DATA_ROOT / "metadata"
SAMPLES_DIR = DATA_ROOT / "samples"
AUTH_DIR = _PROJECT_ROOT / "backend" / "gee"

def migrate():
    logger.info("Starting SQLite Migration...")
    init_db()
    
    # 1. Migrate Admin Datasets
    admin_file = METADATA_DIR / "datasets_admin.json"
    if admin_file.exists():
        try:
            data = json.loads(admin_file.read_text(encoding="utf-8"))
            if isinstance(data, list):
                save_datasets("admin", data)
                logger.info(f"Migrated {len(data)} admin datasets.")
        except Exception as e:
            logger.error(f"Error migrating admin datasets: {e}")

    # 2. Migrate Community Datasets
    community_file = METADATA_DIR / "datasets_community.json"
    if community_file.exists():
        try:
            data = json.loads(community_file.read_text(encoding="utf-8"))
            if isinstance(data, list):
                save_datasets("community", data)
                logger.info(f"Migrated {len(data)} community datasets.")
        except Exception as e:
            logger.error(f"Error migrating community datasets: {e}")

    # 3. Migrate Samples
    samples_file = SAMPLES_DIR / "samples.json"
    if samples_file.exists():
        try:
            data = json.loads(samples_file.read_text(encoding="utf-8"))
            if isinstance(data, list):
                save_samples(data)
                logger.info(f"Migrated {len(data)} samples.")
        except Exception as e:
            logger.error(f"Error migrating samples: {e}")

    # 4. Migrate GEE Sessions
    sessions_file = AUTH_DIR / "gee_sessions.json"
    if sessions_file.exists():
        try:
            data = json.loads(sessions_file.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                save_all_gee_sessions(data)
                logger.info(f"Migrated {len(data)} GEE sessions.")
        except Exception as e:
            logger.error(f"Error migrating GEE sessions: {e}")

    logger.info("Migration complete!")

if __name__ == "__main__":
    migrate()
