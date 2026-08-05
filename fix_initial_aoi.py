import os
import glob

pages_dir = r"c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages"
target_string = 'level1: "Northern Province"'
replacement_string = 'level1: "North/Amajyaruguru"'

count = 0
for filepath in glob.glob(os.path.join(pages_dir, "*.tsx")):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    if target_string in content:
        content = content.replace(target_string, replacement_string)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        count += 1
        print(f"Fixed {filepath}")

print(f"Fixed {count} files.")
