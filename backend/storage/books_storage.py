import json
import os
import uuid
from typing import Optional, Any
from storage.dataset_storage import _get_client, push_to_storage, download_dataset_bytes, _delete_from_huggingface

BOOKS_METADATA_KEY = "books_metadata.json"
BOOKS_PREFIX = "academy/books/"

def load_books() -> list[dict[str, Any]]:
    client = _get_client()
    try:
        if not client.exists(BOOKS_METADATA_KEY):
            return []
        raw = client.download_as_text(BOOKS_METADATA_KEY)
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except Exception as e:
        import logging
        logging.error(f"Error loading books metadata: {e}")
        return []

def save_books(records: list[dict[str, Any]]) -> None:
    client = _get_client()
    client.upload_from_text(BOOKS_METADATA_KEY, json.dumps(records, indent=2))

def add_book_record(record: dict[str, Any]) -> None:
    records = load_books()
    records.append(record)
    save_books(records)

def process_and_store_book_upload(filename: str, file_bytes: bytes, title: str, author: str, description: str, pages: int) -> dict[str, Any]:
    size_mb = len(file_bytes) / (1024 * 1024)
    book_id = str(uuid.uuid4())
    storage_key = f"{BOOKS_PREFIX}{book_id}_{filename}"
    
    # Push to HF / R2 / local
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
        "volumeId": "" # Unused for local PDFs, but kept for schema compatibility
    }
    
    add_book_record(record)
    return record

def update_book(book_id: str, title: str, author: str, description: str, pages: int) -> Optional[dict[str, Any]]:
    records = load_books()
    for r in records:
        if r["id"] == book_id:
            r["title"] = title
            r["author"] = author
            r["description"] = description
            r["pages"] = pages
            save_books(records)
            return r
    return None

def delete_book(book_id: str) -> bool:
    import logging
    records = load_books()
    target = next((r for r in records if r["id"] == book_id), None)
    if target is None:
        return False
        
    storage_key = target.get("storage_key", "")
    if storage_key:
        client = _get_client()
        try:
            if client.exists(storage_key):
                client.delete(storage_key)
        except Exception as e:
            logging.error(f"delete_book: Error deleting file from storage: {e}")
            
        # Also clean up HF if needed
        import threading
        filename = storage_key.split("/")[-1]
        threading.Thread(target=_delete_from_huggingface, args=(filename,), daemon=True).start()
            
    remaining = [r for r in records if r["id"] != book_id]
    save_books(remaining)
    return True

def get_book_bytes(storage_key: str) -> bytes:
    return download_dataset_bytes(storage_key)
