import os, glob, re

pages_dir = r'c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages'

for filepath in glob.glob(os.path.join(pages_dir, '*Page.tsx')):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the Map tab contents (from <TabsContent value="map"> to the <div className="h-[520px]")
    # We want to extract the "switcher" which could be a div with flex gap-2, or the "Map Layer Switcher Header"
    m_map_tab = re.search(r'<TabsContent value="map"[^>]*>([\s\S]*?)<div\s+className="h-\[520px\]', content)
    if not m_map_tab:
        continue
    
    switcher_content = m_map_tab.group(1).strip()
    
    # Remove `{mapMutation.isPending && !mapData ? ... : mapData ? (` if it exists
    switcher_content = re.sub(r'\{[a-zA-Z0-9_]+\.isPending && ![a-zA-Z0-9_]+ \?\s*\([\s\S]*?\)\s*:\s*[a-zA-Z0-9_]+\s*\?\s*\(\s*<>', '', switcher_content).strip()
    
    # Remove any stray <> or </> from the start
    if switcher_content.startswith('<>'):
        switcher_content = switcher_content[2:].strip()
    
    # If it's empty, skip
    if not switcher_content:
        continue
        
    # Now find the static-map tab
    static_map_m = re.search(r'(<TabsContent value="static-map"[^>]*>[\s\S]*?<div[^>]*High-quality static maps[^<]*</p>\s*</div>)', content)
    if not static_map_m:
        continue
        
    static_map_head = static_map_m.group(1)
    
    # If the static map tab already has a switcher, we don't want to duplicate it.
    # Let's check if the switcher_content is already in the static-map tab (after the header).
    # Or better yet, we can completely replace the switcher in the static map tab.
    # Let's find the start of <div className="bg-card border rounded-lg p-4">
    
    m_static_tab_content = re.search(r'(<TabsContent value="static-map"[^>]*>[\s\S]*?)<div className="bg-card border rounded-lg p-4">', content)
    
    if m_static_tab_content:
        old_static_header = m_static_tab_content.group(1)
        # Rebuild the static tab up to the MapExportControls
        # The new static header should be the static_map_head + the switcher
        
        # Avoid double-inserting if it already looks inserted
        if 'Map Symbology:' in old_static_header or 'Map Layer Switcher Header' in old_static_header or 'Select Map to Export' in old_static_header:
            # We already have some switcher. Let's remove it.
            # We will just reconstruct from static_map_head + switcher_content + "\n              <div className="bg-card border rounded-lg p-4">"
            pass
            
        new_static_header = static_map_head + "\n\n              " + switcher_content + "\n\n              "
        content = content.replace(old_static_header, new_static_header)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {os.path.basename(filepath)}")

