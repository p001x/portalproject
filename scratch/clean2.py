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

for filename in MODULES:
    filepath = os.path.join(PAGES_DIR, filename)
    if not os.path.exists(filepath):
        continue

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # The character "" is \ufffd
    content = content.replace("kmA\ufffd", "km²")
    content = content.replace("km\ufffd", "km²")
    content = content.replace("kmÂ²", "km²")
    
    content = content.replace("in A\ufffdC", "in °C")
    content = content.replace("in Â°C", "in °C")
    
    content = content.replace("A\ufffd", "·")
    content = content.replace("Â·", "·")
    
    content = content.replace("a\ufffd\ufffd", "—")
    content = content.replace("â€”", "—")
    
    content = content.replace("a\ufffd\ufffd", "→")
    content = content.replace("â†’", "→")

    content = content.replace("a\ufffd\ufffd", "…")
    content = content.replace("â€¦", "…")

    content = content.replace("a\ufffd\ufffd", "–")
    content = content.replace("â€“", "–")
    
    content = content.replace("a\ufffd\ufffd", "─")
    content = content.replace("â”€", "─")
    
    # Generic replacements if the exact mangled character is known
    content = content.replace("?", "–")
    content = content.replace("", "²") # Careful, could be other things, but mostly ²

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Cleaned {filename}")
