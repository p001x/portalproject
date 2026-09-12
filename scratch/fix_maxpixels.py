import os
import re

gee_dir = r"c:\Users\user\Documents\blacportal\backend\gee"

for filename in os.listdir(gee_dir):
    if not filename.endswith(".py"):
        continue
        
    filepath = os.path.join(gee_dir, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
        
    # Replace maxPixels=something with maxPixels=1e10
    # and remove bestEffort=True (with optional comma and spaces)
    
    # 1. First remove bestEffort=True, completely
    new_content = re.sub(r',\s*bestEffort=True', '', content)
    new_content = re.sub(r'bestEffort=True,\s*', '', new_content)
    new_content = re.sub(r'bestEffort=True', '', new_content)
    
    # 2. Update maxPixels
    new_content = re.sub(r'maxPixels=[0-9eE]+', 'maxPixels=1e10', new_content)
    
    if new_content != content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated {filename}")
