import os
import re

def check_a11y(dir_path):
    issues = []
    print(f"Scanning {dir_path} for accessibility issues...")
    for root, _, files in os.walk(dir_path):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.jsx'):
                file_path = os.path.join(root, file)
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                    # Find all img tags (including multiline)
                    img_tags = re.finditer(r'<img\b[^>]*>', content, re.DOTALL)
                    for match in img_tags:
                        img_tag = match.group(0)
                        if 'alt=' not in img_tag:
                            issues.append(f"[MISSING ALT] {file_path}:\n{img_tag.strip()}")
                            
                    # Find all a tags missing href
                    a_tags = re.finditer(r'<a\b[^>]*>', content, re.DOTALL)
                    for match in a_tags:
                        a_tag = match.group(0)
                        # We only care if it doesn't have an href AND doesn't have an onClick
                        # But specifically missing href is an a11y issue if it's acting as a link
                        if 'href=' not in a_tag and 'href ' not in a_tag and 'href\n' not in a_tag:
                            issues.append(f"[MISSING HREF ON A] {file_path}:\n{a_tag.strip()}")

                    # Find icon-only buttons (roughly)
                    # Like <Button variant="ghost" size="icon"><Trash2 /></Button>
                    btn_tags = re.finditer(r'<Button\b([^>]*)>(.*?)</Button>', content, re.DOTALL)
                    for match in btn_tags:
                        attrs = match.group(1)
                        inner = match.group(2)
                        
                        # If the inner content seems to be just another tag (like an icon) and no text
                        # and no aria-label is provided.
                        if 'aria-label' not in attrs:
                            if re.match(r'^\s*<[A-Z][a-zA-Z0-9]+[^>]*/>\s*$', inner):
                                issues.append(f"[MISSING ARIA-LABEL ON ICON BUTTON] {file_path}:\n<Button{attrs}>{inner.strip()}</Button>")

    with open('c:/Users/user/Documents/blacportal/scratch/a11y_report.txt', 'w', encoding='utf-8') as f:
        f.write('\n\n'.join(issues))
    print(f"Found {len(issues)} potential issues. Wrote to a11y_report.txt")

if __name__ == "__main__":
    check_a11y("c:/Users/user/Documents/blacportal/artifacts/geoportal/src")
