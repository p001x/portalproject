import glob, os, re

files = glob.glob(r'C:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages\*.tsx')
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    if 'Custom Study Area' not in content and 'const DISTRICTS = [' in content:
        # We need to replace "Rwamagana",\n]; with "Rwamagana",\n  "Custom Study Area",\n];
        # Since spacing may vary, let's use regex
        new_content = re.sub(
            r'"Rwamagana",?\s*\];', 
            r'"Rwamagana",\n  "Custom Study Area",\n];', 
            content
        )
        if new_content != content:
            with open(f, 'w', encoding='utf-8') as file:
                file.write(new_content)
            print('Updated', os.path.basename(f))
