import os

pages_dir = "c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages"
pages = [
    "AirPollutionPage.tsx", "DroughtPage.tsx", "FloodPage.tsx", "LandfillPage.tsx",
    "LandslidePage.tsx", "LSTPage.tsx", "NDVIPage.tsx", "RUSLEPage.tsx", "SlopePage.tsx", "UHIPage.tsx"
]

import_statement = 'import { StudyAreaSelector } from "@/components/StudyAreaSelector";\n'

for p in pages:
    p_path = os.path.join(pages_dir, p)
    with open(p_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    if "import { StudyAreaSelector }" not in content:
        # insert it after the first import
        content = content.replace("import { useState } from \"react\";\n", "import { useState } from \"react\";\n" + import_statement)
        with open(p_path, "w", encoding="utf-8") as f:
            f.write(content)

print("Added missing imports")
