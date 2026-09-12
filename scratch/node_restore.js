const fs = require('fs');
const path = require('path');

const PAGES_DIR = path.join(__dirname, 'artifacts/geoportal/src/pages');
const MODULES = [
    "AccessibilityPage.tsx", "AirPollutionPage.tsx", "BiomassPage.tsx", 
    "ChangeDetectionPage.tsx", "DroughtPage.tsx", "FloodPage.tsx", 
    "HabitatSuitabilityPage.tsx", "IrrigationPage.tsx", "LSTPage.tsx", 
    "LandfillPage.tsx", "LandslidePage.tsx", "MicroScalePage.tsx", 
    "NDVIPage.tsx", "RUSLEPage.tsx", "SlopePage.tsx", "UHIPage.tsx", 
    "WaterHarvestingPage.tsx", "WellScopePage.tsx"
];

for (const filename of MODULES) {
    const filepath = path.join(PAGES_DIR, filename);
    if (!fs.existsSync(filepath)) continue;

    try {
        const rawBytes = fs.readFileSync(filepath);
        
        // Let's check the first few bytes. 
        // If it starts with BOM FF FE or looks like UTF-16LE
        let text;
        if (rawBytes.length >= 2 && rawBytes[0] === 0xFF && rawBytes[1] === 0xFE) {
            text = rawBytes.toString('utf16le');
        } else if (rawBytes.length > 2 && rawBytes[1] === 0x00 && rawBytes[3] === 0x00) {
            text = rawBytes.toString('utf16le');
        } else {
            text = rawBytes.toString('utf8');
        }

        // Clean up text
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }
        
        fs.writeFileSync(filepath, text, 'utf8');
        console.log(`Successfully restored ${filename}`);
    } catch (e) {
        console.error(`Failed to process ${filename}:`, e.message);
    }
}
