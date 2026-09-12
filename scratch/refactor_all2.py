import os
import re

PAGES_DIR = r"c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages"
MODULES = [
    "BiomassPage.tsx", "FloodPage.tsx", 
    "HabitatSuitabilityPage.tsx", "IrrigationPage.tsx", "MicroScalePage.tsx", 
    "WaterHarvestingPage.tsx", "WellScopePage.tsx"
]

updated_count = 0

for filename in MODULES:
    filepath = os.path.join(PAGES_DIR, filename)
    if not os.path.exists(filepath):
        continue

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Skip files that already have DistrictMap in their empty state
    if "basemap=\"satellite\"" in content:
        continue

    # Add DistrictMap import
    if "import DistrictMap" not in content:
        content = re.sub(r'(import .*?;?\n)', r'\1import DistrictMap from "@/components/DistrictMap";\n', content, count=1)
        
    # Add Play icon import if not there
    if "Play" not in content and "lucide-react" in content:
        content = re.sub(r'import\s+\{([^}]+)\}\s+from\s+"lucide-react";', r'import {\1, Play} from "lucide-react";', content)
    elif "Play" not in content:
        content = content.replace('from "lucide-react";', 'from "lucide-react";\nimport { Play } from "lucide-react";')

    icon_match = re.search(r'<\s*([A-Z][a-zA-Z0-9]*)\s+className="w-[0-9]+ h-[0-9]+.*?"\s*/>', content)
    icon_name = icon_match.group(1) if icon_match else "Map"
    
    title_match = re.search(r'Calculate\s+([^"<]+)', content, re.IGNORECASE)
    if not title_match:
        title_match = re.search(r'Analyze\s+([^"<]+)', content, re.IGNORECASE)
    title = title_match.group(1).strip() if title_match else filename.replace("Page.tsx", "")

    empty_state_pattern = re.compile(
        r'\{!(?:data|anyData(?:\s*as\s*boolean)?)\s*&&\s*!isPending\s*(?:&&\s*!error\s*)?&&\s*\(\s*<div[^>]*>.*?</div>\s*\)\}',
        re.DOTALL
    )
    
    match = empty_state_pattern.search(content)
    
    replacement = f"""{{!(data if 'data' in locals() else anyData) && !isPending && (
          <div className="h-full relative bg-muted/20">
            <DistrictMap aoi={{aoi}} basemap="satellite" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4">
              <div className="bg-background/80 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-primary/20 text-center max-w-sm pointer-events-auto transition-all hover:scale-105 duration-300">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 text-primary shadow-inner">
                  <{icon_name} className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Select a district and parameters from the sidebar, then run the analysis to visualize results here.
                </p>
                <Button 
                  onClick={{() => runAnalysis ? runAnalysis() : mutate()}} 
                  className="w-full gap-2 rounded-xl shadow-md hover:shadow-lg transition-all"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Run Analysis
                </Button>
              </div>
            </div>
          </div>
        )}}"""

    if match:
        original = match.group(0)
        cond = "!anyData" if "anyData" in original else "!data"
        error_cond = " && !error" if "!error" in original else ""
        
        replacement_formatted = replacement.replace("!(data if 'data' in locals() else anyData)", f"{cond}{error_cond}")
        
        content = content[:match.start()] + replacement_formatted + content[match.end():]
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filename} | Icon: {icon_name}, Title: {title}")
        updated_count += 1
    else:
        # Check for BiomassPage specific ternary pattern
        biomass_match = re.search(r'\)\s*:\s*null\}', content)
        if biomass_match and filename == "BiomassPage.tsx":
             # We will insert the empty state before null, making it check for !anyData && !isPending
             # But BiomassPage does: error ? ... : isPending && !anyData ? ... : anyData ? ... : null}
             # So replacing `null}` with `( <EmptyState /> )}`
             empty_state_jsx = f"""(
          <div className="h-full relative bg-muted/20 rounded-lg overflow-hidden border">
            <DistrictMap aoi={{aoi}} basemap="satellite" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4 z-10">
              <div className="bg-background/80 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-primary/20 text-center max-w-sm pointer-events-auto transition-all hover:scale-105 duration-300">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 text-primary shadow-inner">
                  <Flame className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-foreground">Biomass Tracking</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Select a district and parameters from the sidebar, then run the analysis to visualize results here.
                </p>
                <Button 
                  onClick={{runAnalysis}} 
                  className="w-full gap-2 rounded-xl shadow-md hover:shadow-lg transition-all"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Run Analysis
                </Button>
              </div>
            </div>
          </div>
        )"""
             content = content[:biomass_match.start()] + ") : " + empty_state_jsx + "}" + content[biomass_match.end():]
             with open(filepath, 'w', encoding='utf-8') as f:
                 f.write(content)
             print(f"Updated BiomassPage.tsx")
             updated_count += 1
        else:
            print(f"Could not find empty state block in {filename}")

print(f"Successfully updated {updated_count} files.")
