import json
import uuid
from typing import Optional, Any
from storage.dataset_storage import _get_client

import os

COURSES_METADATA_KEY = "courses_metadata.json"
LOCAL_FALLBACK_FILE = os.path.join(os.path.dirname(__file__), 'local_courses_metadata.json')

def load_courses() -> list[dict[str, Any]]:
    client = _get_client()
    try:
        if client.exists(COURSES_METADATA_KEY):
            raw = client.download_as_text(COURSES_METADATA_KEY)
            data = json.loads(raw)
            if isinstance(data, list) and len(data) > 0:
                return data
    except Exception as e:
        import logging
        logging.error(f"Error loading courses metadata from hub: {e}")
        
    try:
        if os.path.exists(LOCAL_FALLBACK_FILE):
            with open(LOCAL_FALLBACK_FILE, 'r') as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
    except Exception as e:
        import logging
        logging.error(f"Error loading courses metadata from local fallback: {e}")
        
    return []

def save_courses(records: list[dict[str, Any]]) -> None:
    client = _get_client()
    data_str = json.dumps(records, indent=2)
    try:
        client.upload_from_text(COURSES_METADATA_KEY, data_str)
    except Exception as e:
        import logging
        logging.error(f"Failed to upload courses metadata to hub: {e}")
        
    try:
        with open(LOCAL_FALLBACK_FILE, 'w') as f:
            f.write(data_str)
    except Exception as e:
        import logging
        logging.error(f"Failed to save courses metadata to local fallback: {e}")

def add_course_record(record: dict[str, Any]) -> None:
    records = load_courses()
    records.append(record)
    save_courses(records)

def create_course(title: str, description: str, detailed_description: str, videos: list, duration: str = "New", level: str = "Beginner") -> dict[str, Any]:
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

def update_course(course_id: str, title: str, description: str, detailed_description: str, videos: list, duration: str = None, level: str = None) -> Optional[dict[str, Any]]:
    records = load_courses()
    for r in records:
        if r["id"] == course_id:
            r["title"] = title
            r["description"] = description
            r["detailedDescription"] = detailed_description
            if videos is not None: r["videos"] = videos
            if duration is not None: r["duration"] = duration
            if level is not None: r["level"] = level
            save_courses(records)
            return r
    return None

def delete_course(course_id: str) -> bool:
    records = load_courses()
    target = next((r for r in records if r["id"] == course_id), None)
    if target is None:
        return False
        
    remaining = [r for r in records if r["id"] != course_id]
    save_courses(remaining)
    return True
