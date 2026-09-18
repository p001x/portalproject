import ee
import sys

def main():
    try:
        from google.oauth2 import service_account
        import json
        with open("credentials.json", "r") as f:
            credentials = service_account.Credentials.from_service_account_info(json.load(f))
        ee.Initialize(credentials, project="ee-petersonyang87")
    except Exception as e:
        print("Fallback to normal init", e)
        ee.Initialize(project="ee-petersonyang87")
    
    assets = ee.data.getList({'id': 'projects/earthengine-legacy/assets/OpenLandMap/SOL'})
    for asset in assets:
        if "WATERCONTENT" in asset['id']:
            print(asset['id'])

if __name__ == "__main__":
    main()
