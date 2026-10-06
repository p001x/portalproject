import os
import re

gee_dir = r"c:\Users\user\Documents\blacportal\backend\gee"

# We only want to replace geometry=aoi or geometry=geometry with geometry=aoi.bounds(maxError=1000)
# But we should ignore it if it's already .bounds
# We must be careful about supervised_classify.py, let's just skip supervised_classify.py
# and earthwork.py because poly might be very small anyway.

skip_files = ["supervised_classify.py", "earthwork.py"]

# Regex to match geometry=VAR where VAR is aoi or geometry, optionally followed by a comma or parenthesis
pattern = re.compile(r"geometry\s*=\s*(aoi|geometry)\s*([,)])")

count = 0
for file in os.listdir(gee_dir):
    if not file.endswith(".py") or file in skip_files:
        continue
        
    filepath = os.path.join(gee_dir, file)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
        
    new_content, subs = pattern.subn(r"geometry=\1.bounds(maxError=1000)\2", content)
    
    if subs > 0:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Replaced {subs} occurrences in {file}")
        count += 1

print(f"Total files updated: {count}")
