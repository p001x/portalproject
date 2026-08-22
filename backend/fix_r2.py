import os
import sys
import json
import re

# ensure we can import from backend
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from storage.dataset_storage import _get_client, METADATA_KEYS

client = _get_client()
print(f"Client: {client.__class__.__name__}")

for source in ["community", "admin"]:
    key = METADATA_KEYS[source]
    print(f"Checking {key}")
    if not client.exists(key):
        print(f"Key {key} does not exist.")
        continue
    
    raw = client.download_as_text(key)
    data = json.loads(raw)
    
    modified = False
    for r in data:
        if r.get("description", "").startswith("Harvested from"):
            # Extract source_url if not present
            if not r.get("source_url"):
                r["source_url"] = r["description"].replace("Harvested from ", "").strip()
            r["description"] = ""
            modified = True
            
        if " - Google Drive" in r.get("name", ""):
            r["name"] = re.sub(r'\s*-\s*Google\s*Drive\s*$', '', r["name"]).strip()
            modified = True
            
        if " - Google Drive" in r.get("original_filename", ""):
            r["original_filename"] = re.sub(r'\s*-\s*Google\s*Drive\s*$', '', r["original_filename"]).strip()
            modified = True
            
        if r.get("file_type") == "other" and r.get("name", "").endswith((".tif", ".tiff")):
            r["file_type"] = "tiff"
            modified = True
            
    if modified:
        client.upload_from_text(key, json.dumps(data, indent=2))
        print(f"Updated {key}!")
    else:
        print(f"No changes needed for {key}.")
