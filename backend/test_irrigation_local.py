import sys
sys.path.append('c:\\Users\\user\\Documents\\blacportal\\backend')
import ee
from gee.gee_auth import get_ee_service_account_credentials
from gee.irrigation import compute_irrigation_map

def run_test():
    credentials = get_ee_service_account_credentials()
    ee.Initialize(credentials, project="ee-petersonyang87")
    aoi_config = {"type": "rwanda", "country": "Rwanda", "province": "Eastern Province", "name": "Bugesera"}
    res = compute_irrigation_map(aoi_config, "2023-11-24", "2023-12-01", "2023-11-01", "Maize")
    print("Success. map_id returned.")

if __name__ == "__main__":
    run_test()
