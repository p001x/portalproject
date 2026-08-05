import os
import glob
import re

backend_gee_dir = r"c:\Users\user\Documents\blacportal\backend\gee"

count = 0
for filepath in glob.glob(os.path.join(backend_gee_dir, "*.py")):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Remove the download_url line which looks like: "download_url": ....getDownloadURL(...),
    new_content = re.sub(r'^\s*"download_url":\s*.*getDownloadURL.*$\n?', '', content, flags=re.MULTILINE)
    
    if new_content != content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        count += 1
        print(f"Fixed {os.path.basename(filepath)}")

print(f"Fixed {count} files.")
