import os
import re

pages_dir = r"c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages"

# Buggy string to look for (use regex to be safe with whitespace)
buggy_pattern = re.compile(
    r"style=\{\{\s*background:\s*typeof\s*palette\s*===\s*'function'\s*\?\s*palette\(nClasses\)\[i\]\s*:\s*\(Array\.isArray\(palette\)\s*\?\s*palette\[i\]\s*:\s*\[\"#08306b\",\s*\"#313695\",\s*\"#74add1\",\s*\"#fee090\",\s*\"#f46d43\",\s*\"#a50026\",\s*\"#000000\",\s*\"#555555\",\s*\"#999999\",\s*\"#cccccc\"\]\[i\s*%\s*10\]\)\s*\}\}"
)

replacements = {
    "DroughtPage.tsx": "style={{ background: DVI_COLORS[i % DVI_COLORS.length] }}",
    "LandslidePage.tsx": "style={{ background: SUSCEPTIBILITY_COLORS[i % SUSCEPTIBILITY_COLORS.length] }}",
    "LandfillPage.tsx": "style={{ background: CLASS_COLOR_LIST[i % CLASS_COLOR_LIST.length] }}",
    "AirPollutionPage.tsx": 'style={{ background: ["#313695", "#74add1", "#fee090", "#f46d43", "#a50026"][i % 5] }}',
    "SlopePage.tsx": "style={{ background: palette(nClasses)[i % nClasses] }}"
}

for page, replacement in replacements.items():
    p_path = os.path.join(pages_dir, page)
    if not os.path.exists(p_path):
        print(f"Skipping {page}, not found.")
        continue
        
    with open(p_path, "r", encoding="utf-8") as f:
        content = f.read()

    new_content, count = buggy_pattern.subn(replacement, content)
    
    if count > 0:
        with open(p_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Fixed colors in {page} ({count} replacements)")
    else:
        print(f"No match found in {page}")
