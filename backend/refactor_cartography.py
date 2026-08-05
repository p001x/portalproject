import re
import os

# Update cartography.py
cart_path = "c:/Users/user/Documents/blacportal/backend/reports/cartography.py"
with open(cart_path, "r", encoding="utf-8") as f:
    cart_content = f.read()

# Delete _DISTRICT_BOUNDS and _district_bounds function
# We can just replace them with empty string or comment out
cart_content = re.sub(r'# ── Hardcoded Rwanda district bounds ─────────────────────────────────────────.*?(?=# ── Colour helpers ────────────────────────────────────────────────────────────)', '', cart_content, flags=re.DOTALL)

# Update enhance_map_cartography signature
cart_content = re.sub(r'district:\s*str,', r'aoi_name: str,\n    bbox: list[float] = None,', cart_content)

# Update the geographic extent section
old_extent = r"""    # 3. Get geographic extent from static table
    bounds  = _district_bounds\(district\)
    extent  = bounds  # \[xmin, xmax, ymin, ymax\]
    y_center = \(\(bounds\[2\] \+ bounds\[3\]\) / 2\.0\) if bounds else 0\.0"""

new_extent = r"""    # 3. Get geographic extent from passed bbox
    extent  = bbox  # [xmin, xmax, ymin, ymax]
    y_center = ((bbox[2] + bbox[3]) / 2.0) if bbox else 0.0"""
cart_content = cart_content.replace(old_extent, new_extent)

with open(cart_path, "w", encoding="utf-8") as f:
    f.write(cart_content)

print("Updated cartography.py")

# Update main.py static_map_download_endpoint
main_path = "c:/Users/user/Documents/blacportal/backend/main.py"
with open(main_path, "r", encoding="utf-8") as f:
    main_content = f.read()

main_content = main_content.replace(
    'district: str = Form(...),',
    'district: str = Form(...),\n    bbox_json: Optional[str] = Form(None),'
)

main_content = main_content.replace(
    'carto_buf = enhance_map_cartography(\n            raw_png, district, title, class_areas, override_palette,',
    'bbox = json.loads(bbox_json) if bbox_json and bbox_json != "null" else None\n        carto_buf = enhance_map_cartography(\n            raw_png, district, bbox, title, class_areas, override_palette,'
)

main_content = main_content.replace(
    'def generate_static_map(\n    req: StaticMapRequest\n):',
    'def generate_static_map(\n    req: StaticMapRequest,\n    bbox: list[float] = None\n):'
)

with open(main_path, "w", encoding="utf-8") as f:
    f.write(main_content)

print("Updated main.py")
