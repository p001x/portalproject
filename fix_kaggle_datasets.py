import os
import sys

# Set Kaggle API token from user
os.environ['KAGGLE_API_TOKEN'] = "KGAT_9f60f536746b3125c7cd43c09112a80c"
os.environ['KAGGLE_USERNAME'] = "blacportal"

# Add backend to path so we can import dataset_storage
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

try:
    from storage.dataset_storage import load_metadata, save_metadata, push_to_kaggle, _get_client
except Exception as e:
    print(f"Error importing dataset_storage: {e}")
    sys.exit(1)

def main():
    print("Loading datasets metadata...")
    records = load_metadata(source="admin")
    updated_count = 0

    client = _get_client()

    for record in records:
        key = record.get("storage_key", "")
        if key.startswith("local://"):
            local_key = key.replace("local://", "")
            
            if client.exists(local_key):
                print(f"Uploading {record['name']} (ID: {record['id']}) to Kaggle...")
                file_bytes = client.download_as_bytes(local_key)
                
                try:
                    # push_to_kaggle returns the new kaggle:// URL
                    new_key = push_to_kaggle(local_key, file_bytes, record['name'] or record['original_filename'])
                    if new_key.startswith("kaggle://"):
                        record["storage_key"] = new_key
                        updated_count += 1
                        print(f"Successfully uploaded! New key: {new_key}")
                    else:
                        print(f"Failed to upload (returned local key): {new_key}")
                except Exception as e:
                    print(f"Error uploading to Kaggle: {e}")
            else:
                print(f"Warning: Local file not found for {record['name']}: {local_key}")

    if updated_count > 0:
        save_metadata(records, source="admin")
        print(f"\nUpdated {updated_count} datasets! Metadata saved.")
        print("\nPlease run the following commands to push the updated metadata to GitHub:")
        print("git add backend/data/files/datasets_metadata.json")
        print('git commit -m "Update datasets with Kaggle storage URLs"')
        print("git push origin main")
    else:
        print("\nNo datasets were updated. (Maybe they are already on Kaggle or local files were missing)")

if __name__ == "__main__":
    main()
