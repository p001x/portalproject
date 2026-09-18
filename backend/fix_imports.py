import os
import re

pages_dir = r"c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages"
pages = [
    "SlopePage.tsx", "LandslidePage.tsx", "LandfillPage.tsx",
    "HabitatSuitabilityPage.tsx", "AirPollutionPage.tsx", "AccessibilityPage.tsx",
    "FloodPage.tsx", "DroughtPage.tsx", "LSTPage.tsx"
]

for p in pages:
    p_path = os.path.join(pages_dir, p)
    if not os.path.exists(p_path):
        continue
        
    with open(p_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Find the react import using regex
    # E.g. import { useState, useEffect } from "react";
    react_import_regex = re.compile(r'import\s+\{[^}]+\}\s+from\s+["\']react["\'];')
    
    # We will just replace it with import { useState, useEffect, useMemo, useCallback } from "react";
    new_import = 'import { useState, useEffect, useMemo, useCallback } from "react";'
    
    if react_import_regex.search(content):
        content = react_import_regex.sub(new_import, content, count=1)
        with open(p_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Fixed imports in {p}")
    else:
        print(f"Could not find react import in {p}")
