import os
import glob
import re

def refactor():
    gee_dir = r"C:\Users\user\Documents\blacportal\backend\gee"
    for file in glob.glob(os.path.join(gee_dir, "*.py")):
        if os.path.basename(file) in ["aoi_utils.py", "auth.py", "classify_utils.py"]:
            continue
        with open(file, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Regex to match both multiline and singleline filter calls
        pattern = re.compile(
            r'([ \t]*)rwanda\s*=\s*ee\.FeatureCollection\("FAO/GAUL/2015/level2"\)\.filter\([\s\S]*?district_name[\s\S]*?\)\n([ \t]*)aoi\s*=\s*rwanda\.geometry\(\)',
            re.MULTILINE
        )

        def replacer(match):
            indent = match.group(1)
            return f"{indent}from gee.aoi_utils import get_district_geometry\n{indent}aoi = get_district_geometry(district_name)"
            
        new_content, count = pattern.subn(replacer, content)
        if count > 0:
            print(f"Replaced {count} instances in {os.path.basename(file)}")
            with open(file, "w", encoding="utf-8") as f:
                f.write(new_content)
        else:
            print(f"No match in {os.path.basename(file)}")

if __name__ == "__main__":
    refactor()
