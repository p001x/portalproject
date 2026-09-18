import os, glob, re

pages_dir = r'c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages'
files = glob.glob(os.path.join(pages_dir, '*Page.tsx'))

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    changed = False

    # Find MapExportControls tags
    pattern = r'(<MapExportControls[^>]*?\s*\/?>)'
    def repl(m):
        tag = m.group(1)
        if 'bbox=' not in tag and 'data.bbox' in content:
            tag = tag.replace('/>', '  bbox={data?.bbox}\n              />')
        
        # If classAreas is missing, but data.class_areas_km2 exists, add it (basic attempt)
        if 'classAreas=' not in tag and 'data.class_areas_km2' in content:
            tag = tag.replace('/>', '  classAreas={data?.class_areas_km2}\n              />')
        elif 'classAreas=' not in tag and 'data.class_areas' in content:
            tag = tag.replace('/>', '  classAreas={data?.class_areas}\n              />')
            
        return tag

    new_content = re.sub(pattern, repl, content)
    if new_content != content:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {os.path.basename(file)}")

print("Done.")
