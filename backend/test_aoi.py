from gee.auth import initialize_gee
from gee.aoi_utils import get_aoi_geometry

initialize_gee()

aoi_config_prov = {"type": "rwanda", "country": "Rwanda", "province": "Kigali City"}
aoi_config_dist = {"type": "rwanda", "country": "Rwanda", "province": "Kigali City", "district": "Gasabo"}

print("Testing Province only:")
geom1 = get_aoi_geometry(aoi_config_prov)
print("Province successful!", type(geom1))

print("Testing District:")
geom2 = get_aoi_geometry(aoi_config_dist)
print("District successful!", type(geom2))

