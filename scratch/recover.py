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

    with open(filepath, 'rb') as f:
        raw = f.read()

    # The file might have been written by Node.js which preserved the \x00
    # Let's try to decode as UTF-16 LE
    try:
        # If it's pure UTF-16 LE
        text = raw.decode('utf-16le')
    except:
        try:
            # Maybe it's UTF-8 but with \x00 interspersed
            text = raw.decode('utf-8').replace('\x00', '')
        except:
            # Just strip null bytes manually from raw
            raw_clean = bytes([b for b in raw if b != 0])
            text = raw_clean.decode('utf-8', errors='ignore')

    # Now let's fix any remaining mangled characters like kmÂ²
    text = text.replace("kmÂ²", "km²")
    text = text.replace("in Â°C", "in °C")
    text = text.replace("Â·", "·")
    text = text.replace("â€”", "—")
    text = text.replace("â†’", "→")
    text = text.replace("â€¦", "…")
    text = text.replace("â€“", "–")
    text = text.replace("â”€", "─")
    text = text.replace("A", "") # The literal string A if it was actually written

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)
    
    print(f"Recovered {filename}")
