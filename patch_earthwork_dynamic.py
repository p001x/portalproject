import re
import sys

path = r"c:\Users\user\Documents\blacportal\backend\gee\earthwork.py"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add import at the top
if "from gee.aoi_utils import get_dynamic_scale" not in content:
    content = content.replace("import numpy as np", "import numpy as np\nfrom gee.aoi_utils import get_dynamic_scale")

# 2. Inject dynamic_scale = get_dynamic_scale(poly) after the `get_earthwork_base` call in all functions.
functions_to_patch = [
    "def _analyze_single_zone",
    "def _optimize_grading_surface",
    "def _compute_volumes_only",
    "def profile_earthwork_line",
    "def get_earthwork_3d_grid",
    "def get_earthwork_3d_surface"
]

# Specifically, right after `poly, dem = get_earthwork_base(...)`
# or right after `def _compute_volumes_only(...)` since it takes poly directly.
# Let's do it safely.

content = content.replace("poly, dem = get_earthwork_base(polygon_coords, custom_dem_id)", 
                          "poly, dem = get_earthwork_base(polygon_coords, custom_dem_id)\n    dynamic_scale = get_dynamic_scale(poly)")

content = re.sub(
    r"(def _compute_volumes_only\([\s\S]*?\):\n)", 
    r"\1    dynamic_scale = get_dynamic_scale(poly)\n", 
    content
)
content = re.sub(
    r"(def _optimize_grading_surface\([\s\S]*?\):\n)", 
    r"\1    dynamic_scale = get_dynamic_scale(poly)\n", 
    content
)

# 3. Replace scale=30 with scale=dynamic_scale
content = content.replace("scale=30,", "scale=dynamic_scale,")
content = content.replace("scale=30)", "scale=dynamic_scale)")
content = content.replace("maxPixels=1e9", "maxPixels=1e10")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched earthwork.py successfully!")
