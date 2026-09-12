const fs = require('fs');
const path = require('path');

const PAGES_DIR = "c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages";

const MODULES = [
    "AccessibilityPage.tsx", "AirPollutionPage.tsx", "BiomassPage.tsx", 
    "ChangeDetectionPage.tsx", "DroughtPage.tsx", "FloodPage.tsx", 
    "HabitatSuitabilityPage.tsx", "IrrigationPage.tsx", "LSTPage.tsx", 
    "LandfillPage.tsx", "LandslidePage.tsx", "MicroScalePage.tsx", 
    "NDVIPage.tsx", "RUSLEPage.tsx", "SlopePage.tsx", "UHIPage.tsx", 
    "WaterHarvestingPage.tsx", "WellScopePage.tsx"
];

MODULES.forEach(filename => {
    const filepath = path.join(PAGES_DIR, filename);
    if (!fs.existsSync(filepath)) return;

    let content = fs.readFileSync(filepath, 'utf8');

    // Attempt to reverse the mangling:
    // 1. replace any "A" or specific mangled text with the original if reverse doesn't work.
    // Actually, looking at the output, the PowerShell script might have just written ANSI to UTF-8.
    
    // Instead of doing an encoding trick, let's just use exact regex replacements for the typical texts.
    content = content.replace(/km\s*[A-Z\uFFFD\u0080-\u00FF]+/g, 'km²');
    content = content.replace(/km[A-Z\uFFFD\u0080-\u00FF]+/g, 'km²');
    content = content.replace(/in\s*[A-Z\uFFFD\u0080-\u00FF]+C\s*derived/g, 'in °C derived');
    content = content.replace(/Statistics\s*[A-Z\uFFFD\u0080-\u00FF]+\s*\{data/g, 'Statistics — {data');
    content = content.replace(/Period:\s*\{data.start_date\}\s*[A-Z\uFFFD\u0080-\u00FF]+\s*\{data.end_date\}/g, 'Period: {data.start_date} → {data.end_date}');
    content = content.replace(/takes\s*15\s*[A-Z\uFFFD\u0080-\u00FF]+\s*60\s*seconds/g, 'takes 15–60 seconds');
    content = content.replace(/Computing\s*LST\s*for\s*\{.*?\}\s*[A-Z\uFFFD\u0080-\u00FF]+/g, (match) => match.replace(/[A-Z\uFFFD\u0080-\u00FF]+$/, '…'));
    content = content.replace(/metadata\s*[A-Z\uFFFD\u0080-\u00FF]+\s*LST/g, 'metadata · LST');
    content = content.replace(/std\)\s*[A-Z\uFFFD\u0080-\u00FF]+\s*Temperature/g, 'std) · Temperature');
    content = content.replace(/table\s*[A-Z\uFFFD\u0080-\u00FF]+\s*Quantile/g, 'table · Quantile');
    content = content.replace(/panels\s*[A-Z\uFFFD\u0080-\u00FF]+\s*Methodology/g, 'panels · Methodology');
    content = content.replace(/Classification\s*[A-Z\uFFFD\u0080-\u00FF]+\s*\{data\.district\}/g, 'Classification — {data.district}');
    content = content.replace(/Report\s*[A-Z\uFFFD\u0080-\u00FF]+\s*\{data\.district\}/g, 'Report — {data.district}');
    content = content.replace(/Map\s*[A-Z\uFFFD\u0080-\u00FF]+\s*\{data\.district\}/g, 'Map — {data.district}');
    content = content.replace(/Analysis\s*[A-Z\uFFFD\u0080-\u00FF]+\s*\{data\.district\}/g, 'Analysis — {data.district}');

    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`Cleaned encoding for ${filename}`);
});
