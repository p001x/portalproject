import os, glob, re

pages_dir = r'c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages'
for filepath in glob.glob(os.path.join(pages_dir, '*Page.tsx')):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Replace default district
    content = re.sub(r'const \[district, setDistrict\] = useState\([^)]+\);', 'const [district, setDistrict] = useState("none");', content)
    
    # 2. Add None option to SelectContent
    if '<SelectItem value="none">None</SelectItem>' not in content:
        content = content.replace('<SelectContent>', '<SelectContent>\n              <SelectItem value="none">None</SelectItem>')
    
    # 3. Disable Run Analysis button
    # Make sure we don't duplicate if already replaced
    if '!district || district === "none"' not in content:
        content = re.sub(r'disabled=\{isPending\}', 'disabled={isPending || !district || district === "none"}', content)
    
    # 4. Remove useEffect mutate hook
    content = re.sub(r'  useEffect\(\(\) => \{\n    mutate\(\);\n  \}, \[mutate\]\);\n', '', content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
print("done")
