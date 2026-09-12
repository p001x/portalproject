import os
import subprocess

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
    
    # Run git show to get the raw content from the HEAD commit
    git_path = f"artifacts/geoportal/src/pages/{filename}"
    cmd = ["git", "show", f"HEAD:{git_path}"]
    
    try:
        # Capture as raw bytes
        result = subprocess.run(cmd, capture_output=True, check=True)
        raw_bytes = result.stdout
        
        # Write exactly those bytes back to the file
        with open(filepath, "wb") as f:
            f.write(raw_bytes)
            
        print(f"Successfully restored {filename}")
    except subprocess.CalledProcessError as e:
        print(f"Failed to restore {filename}: {e}")
