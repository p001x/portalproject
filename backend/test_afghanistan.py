import json
from gee.auth import initialize_gee
from gee.drought import compute_drought_classify
initialize_gee()
aoi_config = {"type": "gaul0", "country": "Afghanistan", "name": "Afghanistan"}
try:
    res = compute_drought_classify(aoi_config, 2024, 2024, season="annual", drought_type="agricultural")
    print(json.dumps(res, indent=2))
except Exception as e:
    print("ERROR:", e)
