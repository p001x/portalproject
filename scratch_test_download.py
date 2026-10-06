import ee
import os
import sys

sys.path.append(os.path.abspath('backend'))
from gee.auth import initialize_gee
from gee.rusle import _build_rusle_images

initialize_gee()

aoi_config = {"type": "world"}
year = 2023
res = _build_rusle_images(aoi_config=aoi_config, start_year=year, end_year=year)
A_image = res["factor_images"]["A"]
world_geom = ee.Geometry.BBox(-180, -60, 180, 85)

print("Getting download URL...")
url = A_image.getDownloadURL(dict(
    region=world_geom,
    scale=10000,
    format='GEO_TIFF',
    crs='EPSG:4326'
))
print("Download URL:", url)
