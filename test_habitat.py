import json
from backend.gee.habitat import compute_habitat

try:
    print("Testing compute_habitat...")
    result = compute_habitat(
        aoi_config={"type": "rwanda", "country": "Rwanda", "name": "Rwanda"},
        reverse_flags={},
        n_classes=5,
        method="natural_breaks"
    )
    print("Success! Keys in result:")
    print(list(result.keys()))
except Exception as e:
    import traceback
    traceback.print_exc()
