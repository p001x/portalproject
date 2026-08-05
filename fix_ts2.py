import os

pages_dir = 'c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages'
for p in ['LandfillPage.tsx', 'UHIPage.tsx']:
    path = os.path.join(pages_dir, p)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix bad property access
    content = content.replace('data.(aoi.name || "Custom")', 'data.district')
    
    # Fix standalone strings
    content = content.replace('Select a (aoi.name || "Custom")', 'Select a district')
    content = content.replace('per-(aoi.name || "Custom")', 'per-district')
    
    # In LandfillPage, the title has: Landfill Suitability Report — ${data.district} which got mangled
    # Wait, earlier we replaced it to `${data.(aoi.name || "Custom")}` which is now `${data.district}`
    # but there was also `<strong>${data.district}</strong> (aoi.name || "Custom") identifies `
    content = content.replace('</strong> (aoi.name || "Custom") identifies', '</strong> identifies')
    content = content.replace('</strong> (aoi.name || "Custom") identifies', '</strong> identifies')
    
    # `across the (aoi.name || "Custom")` -> `across the district`
    content = content.replace('across the (aoi.name || "Custom")', 'across the district')
    
    # In LandfillPage line 353: Reload weights when (aoi.name || "Custom") changes -> Reload weights when district changes
    content = content.replace('when (aoi.name || "Custom") changes', 'when district changes')

    # Fix other instances where aoi.name got parenthized unnecessarily but is valid syntax, or just invalid syntax
    # e.g. [(aoi.name || "Custom")] -> [aoi.name || "Custom"]
    content = content.replace('[(aoi.name || "Custom")]', '[aoi.name || "Custom"]')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Fixed bad replacements")
