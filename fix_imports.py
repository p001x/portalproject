import os
import re

directory = 'c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages'

for filename in os.listdir(directory):
    if not filename.endswith('.tsx'):
        continue
    filepath = os.path.join(directory, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    changed = False
    
    # Fix StudyAreaSelector import
    if 'StudyAreaSelector' in content and 'import { StudyAreaSelector }' not in content:
        # Find the last import statement
        last_import = [m for m in re.finditer(r'^import .*$', content, re.MULTILINE)]
        if last_import:
            pos = last_import[-1].end()
            content = content[:pos] + '\nimport { StudyAreaSelector } from "@/components/StudyAreaSelector";' + content[pos:]
            changed = True

    # Fix AOIConfig import
    if 'AOIConfig' in content:
        match = re.search(r'(import \{)([^}]*)(\} from "@/lib/api")', content)
        if match and 'AOIConfig' not in match.group(2):
            content = content[:match.start()] + match.group(1) + match.group(2) + ', AOIConfig' + match.group(3) + content[match.end():]
            changed = True

    if changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Fixed {filename}')
