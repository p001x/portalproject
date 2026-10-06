import sys
import os
import io
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def download_completed_global_maps():
    print("[+] Connecting to Google Drive...")
    
    # Load Service Account Credentials
    key_file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "gee_key.json"))
    if not os.path.exists(key_file_path):
        # Fallback to .env if gee_key.json doesn't exist
        from dotenv import load_dotenv
        load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")))
        key_json = os.environ.get("GEE_SERVICE_ACCOUNT_KEY")
        if not key_json:
            print("[!] Could not find service account key.")
            return
        creds_dict = json.loads(key_json)
        creds = service_account.Credentials.from_service_account_info(creds_dict, scopes=['https://www.googleapis.com/auth/drive'])
    else:
        creds = service_account.Credentials.from_service_account_file(key_file_path, scopes=['https://www.googleapis.com/auth/drive'])
        
    drive_service = build('drive', 'v3', credentials=creds)

    print("[+] Searching for completed Global RUSLE maps...")
    
    # Earth Engine exports images to Drive by default.
    query = "name contains 'rusle_global_' and mimeType='image/tiff'"
    results = drive_service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
    items = results.get('files', [])

    if not items:
        print("[-] No global maps found on Google Drive yet. Google might still be calculating them!")
        return

    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "files"))
    os.makedirs(output_dir, exist_ok=True)

    for item in items:
        file_id = item['id']
        file_name = item['name']
        file_path = os.path.join(output_dir, file_name)
        
        if os.path.exists(file_path):
            print(f"[*] {file_name} already downloaded. Skipping.")
            continue
            
        print(f"[+] Downloading {file_name} to {file_path}...")
        request = drive_service.files().get_media(fileId=file_id)
        
        with io.FileIO(file_path, 'wb') as fh:
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while done is False:
                status, done = downloader.next_chunk()
                if status:
                    print(f"    Download {int(status.progress() * 100)}%.", end='\r')
        print(f"\n[+] Successfully saved {file_name}")
        
    print("\n[+] All available global maps have been downloaded successfully!")
    print("They will now load instantly in the web application.")

if __name__ == '__main__':
    download_completed_global_maps()
