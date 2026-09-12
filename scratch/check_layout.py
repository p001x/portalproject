import os
import re

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
        
    has_wrapper = '<div className="flex h-full">' in content
    
    aside_match = re.search(r'<aside className="([^"]+)">', content)
    aside_class = aside_match.group(1) if aside_match else None
    
    main_match = re.search(r'<main className="([^"]+)">', content)
    main_class = main_match.group(1) if main_match else None
    
    print(f"{filename}: has_wrapper={has_wrapper}, aside='{aside_class}', main='{main_class}'")
