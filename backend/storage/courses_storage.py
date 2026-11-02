import json
import uuid
import time
import threading
import logging
from typing import Optional, Any
import os

try:
    from storage.dataset_storage import _get_client
except ImportError:
    from backend.storage.dataset_storage import _get_client

COURSES_METADATA_KEY = "courses_metadata.json"
LOCAL_FALLBACK_FILE = os.path.join(os.path.dirname(__file__), 'local_courses_metadata.json')

# In-memory cache for high-concurrency read throughput
_courses_cache: Optional[list[dict[str, Any]]] = None
_courses_cache_time: float = 0.0
_courses_lock = threading.Lock()
CACHE_TTL_SECONDS = 60.0  # 60s cache; mutations invalidate immediately

logger = logging.getLogger("spetro.academy.courses")


def load_courses(force_refresh: bool = False) -> list[dict[str, Any]]:
    """
    Load courses metadata with in-memory TTL caching and tiered fallback.
    Under heavy traffic, this avoids redundant R2/storage round-trips.
    """
    global _courses_cache, _courses_cache_time

    now = time.time()
    if not force_refresh and _courses_cache is not None and (now - _courses_cache_time) < CACHE_TTL_SECONDS:
        return [dict(c) for c in _courses_cache]

    with _courses_lock:
        now = time.time()
        if not force_refresh and _courses_cache is not None and (now - _courses_cache_time) < CACHE_TTL_SECONDS:
            return [dict(c) for c in _courses_cache]

        # 1. Try remote cloud storage (R2 / Hugging Face)
        try:
            client = _get_client()
            if client.exists(COURSES_METADATA_KEY):
                raw = client.download_as_text(COURSES_METADATA_KEY)
                data = json.loads(raw)
                if isinstance(data, list) and len(data) > 0:
                    # Validate and self-heal any obsolete or duplicate video records in cloud storage
                    needs_update = False
                    if os.path.exists(LOCAL_FALLBACK_FILE):
                        try:
                            with open(LOCAL_FALLBACK_FILE, 'r', encoding='utf-8') as lf:
                                fallback_data = json.load(lf)
                                fallback_map = {c["id"]: c for c in fallback_data if "id" in c}
                                for idx, course in enumerate(data):
                                    cid = course.get("id")
                                    if cid in fallback_map:
                                        fb = fallback_map[cid]
                                        curr_vids = course.get("videos", [])
                                        fb_vids = fb.get("videos", [])
                                        has_obsolete = any(v.get("youtubeId") in ("wVnimcQsuwk", "W2XUxxu-D-c", "zXk-lD5L0s0", "s_J-k9Tq9qA") for v in curr_vids)
                                        if has_obsolete or len(curr_vids) < len(fb_vids):
                                            data[idx] = fb
                                            needs_update = True
                        except Exception as val_err:
                            logger.debug("Validation check error: %s", val_err)

                    if needs_update:
                        try:
                            client.upload_from_text(COURSES_METADATA_KEY, json.dumps(data, indent=2))
                            logger.info("Self-healed & synced verified course videos to cloud storage")
                        except Exception as up_err:
                            logger.warning("Failed to auto-update cloud courses: %s", up_err)

                    _courses_cache = data
                    _courses_cache_time = now
                    # Sync local file
                    try:
                        with open(LOCAL_FALLBACK_FILE, 'w', encoding='utf-8') as f:
                            json.dump(data, f, indent=2)
                    except Exception as sync_err:
                        logger.debug("Could not write local courses sync: %s", sync_err)
                    return [dict(c) for c in _courses_cache]
        except Exception as e:
            logger.warning("Error loading courses metadata from hub: %s", e)

        # 2. Try local fallback file
        try:
            if os.path.exists(LOCAL_FALLBACK_FILE):
                with open(LOCAL_FALLBACK_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, list) and len(data) > 0:
                        _courses_cache = data
                        _courses_cache_time = now
                        return [dict(c) for c in _courses_cache]
        except Exception as e:
            logger.error("Error loading courses metadata from local fallback: %s", e)

        if _courses_cache is not None:
            return [dict(c) for c in _courses_cache]

        return []


def save_courses(records: list[dict[str, Any]]) -> None:
    """
    Save courses metadata atomically to in-memory cache, local file, and remote storage.
    """
    global _courses_cache, _courses_cache_time

    data_str = json.dumps(records, indent=2)

    with _courses_lock:
        _courses_cache = [dict(c) for c in records]
        _courses_cache_time = time.time()

        # Write local file first
        try:
            with open(LOCAL_FALLBACK_FILE, 'w', encoding='utf-8') as f:
                f.write(data_str)
        except Exception as e:
            logger.error("Failed to save courses metadata to local fallback: %s", e)

        # Sync to remote storage
        try:
            client = _get_client()
            client.upload_from_text(COURSES_METADATA_KEY, data_str)
        except Exception as e:
            logger.warning("Failed to upload courses metadata to hub: %s", e)


def add_course_record(record: dict[str, Any]) -> None:
    records = load_courses(force_refresh=True)
    records.append(record)
    save_courses(records)


def create_course(
    title: str,
    description: str,
    detailed_description: str,
    videos: list,
    duration: str = "New",
    level: str = "Beginner"
) -> dict[str, Any]:
    course_id = str(uuid.uuid4())

    record = {
        "id": course_id,
        "title": title,
        "description": description,
        "detailedDescription": detailed_description,
        "videos": videos,
        "duration": duration,
        "level": level,
        "completed": False
    }

    add_course_record(record)
    return record


def update_course(
    course_id: str,
    title: str,
    description: str,
    detailed_description: str,
    videos: list,
    duration: str = None,
    level: str = None
) -> Optional[dict[str, Any]]:
    records = load_courses(force_refresh=True)
    for r in records:
        if r.get("id") == course_id:
            r["title"] = title
            r["description"] = description
            r["detailedDescription"] = detailed_description
            if videos is not None:
                r["videos"] = videos
            if duration is not None:
                r["duration"] = duration
            if level is not None:
                r["level"] = level
            save_courses(records)
            return r
    return None


def delete_course(course_id: str) -> bool:
    records = load_courses(force_refresh=True)
    target = next((r for r in records if r.get("id") == course_id), None)
    if target is None:
        return False

    remaining = [r for r in records if r.get("id") != course_id]
    save_courses(remaining)
    return True
