import sys, os, requests, zipfile, io
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
from gee.auth import initialize_gee
initialize_gee()
from gee.rusle import _build_rusle_images

res = _build_rusle_images({'type': 'rwanda'}, 2024, 2024)
url = res['factor_images']['A'].getDownloadURL({'region': res['aoi'].bounds(), 'scale': 250, 'format': 'GEO_TIFF', 'crs': 'EPSG:4326'})
print(f"Downloading from {url}")
r = requests.get(url)
z = zipfile.ZipFile(io.BytesIO(r.content))
os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'data', 'files'), exist_ok=True)
out_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'files', 'rusle_rwanda_2024.tif')
with open(out_path, 'wb') as f:
    f.write(z.read(z.namelist()[0]))
print('Saved locally to', out_path)
