import glob
import os

pages_dir = r"c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages\*.tsx"
files = glob.glob(pages_dir)

for f in files:
    with open(f, "r", encoding="utf-8") as file:
        content = file.read()
    
    # If it has both, we just remove the default import
    if 'import { DistrictMap } from "@/components/DistrictMap";' in content and 'import DistrictMap from "@/components/DistrictMap";' in content:
        content = content.replace('import DistrictMap from "@/components/DistrictMap";\n', '')
        content = content.replace('import DistrictMap from "@/components/DistrictMap";', '')
        with open(f, "w", encoding="utf-8") as file:
            file.write(content)
        print(f"Removed duplicate from {os.path.basename(f)}")
    # If it only has the default import, we replace it with named import
    elif 'import DistrictMap from "@/components/DistrictMap";' in content:
        content = content.replace('import DistrictMap from "@/components/DistrictMap";', 'import { DistrictMap } from "@/components/DistrictMap";')
        with open(f, "w", encoding="utf-8") as file:
            file.write(content)
        print(f"Replaced default with named in {os.path.basename(f)}")
