import os
import re

pages_dir = r"c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages"
pages = [
    "SlopePage.tsx", "LandslidePage.tsx", "LandfillPage.tsx",
    "HabitatSuitabilityPage.tsx", "AirPollutionPage.tsx", "AccessibilityPage.tsx",
    "FloodPage.tsx", "DroughtPage.tsx"
]

for p in pages:
    p_path = os.path.join(pages_dir, p)
    if not os.path.exists(p_path):
        continue
        
    with open(p_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Find the activeAreas block using regex
    # It starts with "  const activeAreas = useMemo(() => {"
    # And ends with "}, [data, customClassNames]);" or similar
    pattern = re.compile(r'(\s*const activeAreas = useMemo\(\(\) => \{.*?\},\s*\[.*?\]\);\n)', re.DOTALL)
    
    match = pattern.search(content)
    if match:
        block = match.group(1)
        # Check if the block is already after the data definition
        # we can just blindly move it to just before `  return (`
        
        # Remove the block from its current location
        new_content = content[:match.start()] + content[match.end():]
        
        # Find `  return (`
        # E.g.
        #   return (
        #     <ResizablePanelGroup
        return_pattern = re.compile(r'(\s*return\s*\()')
        return_match = return_pattern.search(new_content)
        
        if return_match:
            # Insert the block just before the return
            final_content = new_content[:return_match.start()] + block + "\n" + new_content[return_match.start():]
            
            with open(p_path, "w", encoding="utf-8") as f:
                f.write(final_content)
            print(f"Moved activeAreas in {p}")
        else:
            print(f"Could not find return statement in {p}")
    else:
        print(f"Could not find activeAreas block in {p}")
