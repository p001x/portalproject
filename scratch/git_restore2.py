import os
import subprocess
import chardet

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
        result = subprocess.run(cmd, capture_output=True, check=True)
        raw_bytes = result.stdout
        
        # Detect encoding
        encoding = chardet.detect(raw_bytes)['encoding']
        print(f"{filename} detected as {encoding}")
        
        if encoding:
            # Decode the text
            text = raw_bytes.decode(encoding, errors='ignore')
            
            # Remove any BOM
            if text.startswith('\ufeff'):
                text = text[1:]
                
            # Remove null bytes if it was mis-decoded
            text = text.replace('\x00', '')
            
            # Write back as UTF-8 without BOM
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(text)
                
            print(f"Successfully decoded and wrote {filename}")
        else:
            print(f"Could not detect encoding for {filename}")
            
    except subprocess.CalledProcessError as e:
        print(f"Failed to restore {filename}: {e}")
