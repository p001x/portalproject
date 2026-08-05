import os, glob, re

pages_dir = r'c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages'
for filepath in glob.glob(os.path.join(pages_dir, '*Page.tsx')):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Add TabsTrigger for static-map before Report
    if '<TabsTrigger value="static-map">Static Maps</TabsTrigger>' not in content:
        content = re.sub(
            r'(<TabsTrigger value="report".*?</TabsTrigger>)',
            r'<TabsTrigger value="static-map">Static Maps</TabsTrigger>\n              \1',
            content
        )
    
    # 2. Find MapExportControls
    # We need to extract it and replace it with nothing in its current place
    m = re.search(r'(\s*<MapExportControls[^>]+/>)', content)
    if m:
        export_controls_block = m.group(1)
        # Remove from current location
        content = content.replace(export_controls_block, '')
        
        # 3. Add TabsContent for static-map before TabsContent for report
        tabs_content_static = f'''
            {{/* Static Maps */}}
            <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">
              <div>
                <h2 className="font-semibold text-lg mb-1">Professional Cartography</h2>
                <p className="text-sm text-muted-foreground">High-quality static maps ready for presentation.</p>
              </div>
              <div className="bg-card border rounded-lg p-4">{export_controls_block}
              </div>
            </TabsContent>
'''
        content = re.sub(
            r'(<TabsContent value="report")',
            tabs_content_static.strip() + r'\n\n            \1',
            content
        )
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
print('done')
