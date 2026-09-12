import os

PAGES_DIR = r"c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages"

MODULES = [
    "AccessibilityPage.tsx", "AirPollutionPage.tsx", "BiomassPage.tsx", 
    "ChangeDetectionPage.tsx", "DroughtPage.tsx", "FloodPage.tsx", 
    "HabitatSuitabilityPage.tsx", "IrrigationPage.tsx", "LSTPage.tsx", 
    "LandfillPage.tsx", "LandslidePage.tsx", "MicroScalePage.tsx", 
    "NDVIPage.tsx", "RUSLEPage.tsx", "SlopePage.tsx", "UHIPage.tsx", 
    "WaterHarvestingPage.tsx", "WellScopePage.tsx"
]

replacements = {
    "Â²": "²",
    "Â°": "°",
    "â€”": "—",
    "â†’": "→",
    "â€¦": "…",
    "â€“": "–",
    "Â·": "·",
    "â”€": "─",
    "ï»¿": "" # BOM if it got inserted as text
}

for filename in MODULES:
    filepath = os.path.join(PAGES_DIR, filename)
    if not os.path.exists(filepath):
        continue

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    for bad, good in replacements.items():
        content = content.replace(bad, good)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print(f"Fixed encoding in {filename}")
