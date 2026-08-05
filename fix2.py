import os, glob

pages_dir = r'c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages'
for filepath in glob.glob(os.path.join(pages_dir, '*Page.tsx')):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Revert disabled condition
    content = content.replace('disabled={isPending || !district || district === "none"}', 'disabled={isPending}')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
print('done')
