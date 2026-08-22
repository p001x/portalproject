import os
import glob
import re

directory = r"c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages"
files = glob.glob(os.path.join(directory, "*.tsx"))

for file in files:
    with open(file, "r", encoding="utf-8") as f:
        content = f.read()
    
    original = content
    # 1. Replace wrapper
    content = content.replace('<div className="flex h-full">', '<div className="flex flex-col md:flex-row h-full overflow-y-auto md:overflow-hidden">')
    
    # 2. Replace aside
    content = re.sub(
        r'<aside className="w-(\d+) shrink-0 border-r bg-card flex flex-col gap-(\d+) p-(\d+) overflow-y-auto">',
        r'<aside className="w-full md:w-\1 shrink-0 border-b md:border-b-0 md:border-r bg-card flex flex-col gap-\2 p-\3 md:overflow-y-auto">',
        content
    )
    
    # 3. Replace main
    content = re.sub(
        r'<main id="report-container" className="flex-1 overflow-y-auto p-(\d+) bg-background">',
        r'<main id="report-container" className="flex-1 md:overflow-y-auto p-4 md:p-\1 bg-background">',
        content
    )
    
    if content != original:
        with open(file, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Patched {os.path.basename(file)}")

print("Done patching.")
