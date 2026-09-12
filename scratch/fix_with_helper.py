import os
import re

gee_dir = r"c:\Users\user\Documents\blacportal\backend\gee"
files_with_error = ["accessibility.py", "drought.py", "dvi.py", "flood.py", "habitat.py", 
                    "irrigation.py", "landfill.py", "landslide.py", "lst.py", "uhi.py", "water_harvesting.py"]

helper = """
def get_dynamic_scale(geom):
    try:
        area_sqkm = geom.area().divide(1e6).getInfo()
        if area_sqkm > 10000: return 500
        elif area_sqkm > 2000: return 250
        elif area_sqkm > 500: return 100
        else: return 30
    except:
        return 250
"""

for filename in files_with_error:
    filepath = os.path.join(gee_dir, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Remove all previous injected dynamic_scale definitions
    content = re.sub(r'[ \t]*# Calculate dynamic scale.*?dynamic_scale = 30\n', '', content, flags=re.DOTALL)
    content = re.sub(r'[ \t]*# Calculate dynamic scale.*?dynamic_scale = 30\s*# Sector or small polygon\n', '', content, flags=re.DOTALL)

    # Insert helper at the top (after imports)
    if "def get_dynamic_scale" not in content:
        # Find first 'import ee'
        content = content.replace("import ee", "import ee\n" + helper, 1)

    # Replace scale=dynamic_scale with scale=get_dynamic_scale(...)
    # We will use eval to grab whatever geometry variable is available in scope
    replacement = "scale=get_dynamic_scale(locals().get('aoi', locals().get('geometry', locals().get('aoi_geom'))))"
    content = content.replace("scale=dynamic_scale", replacement)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Fixed {filename}")

