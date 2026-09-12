import os
import re
import glob

directory = r"c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages"
files = glob.glob(os.path.join(directory, "*.tsx"))

for file in files:
    with open(file, "r", encoding="utf-8") as f:
        content = f.read()
    
    # We want to find <main id="report-container" className="..."> and ensure it has h-full and flex-col
    def replace_class(match):
        original = match.group(0)
        # Only modify if it doesn't already have h-full
        if 'h-full' not in original:
            return original.replace('className="', 'className="h-full flex flex-col ')
        return original
    
    new_content = re.sub(r'<main id="report-container" className="[^"]+"', replace_class, content)
    
    # Also find any other <main className="flex-1 ..."> that might not have an id
    def replace_main_flex1(match):
        original = match.group(0)
        if 'h-full' not in original:
            return original.replace('className="flex-1', 'className="h-full flex flex-col flex-1')
        return original
        
    new_content = re.sub(r'<main[^>]*className="flex-1[^"]*"', replace_main_flex1, new_content)
    
    if new_content != content:
        with open(file, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated {os.path.basename(file)}")

print("Done")
