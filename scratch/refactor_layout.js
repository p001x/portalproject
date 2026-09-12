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
    
    // Add import
    if (!content.includes("ResizablePanelGroup")) {
        const importStmt = 'import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";\n';
        if (content.includes('import { api')) {
            content = content.replace('import { api', importStmt + 'import { api');
        } else {
            content = importStmt + content;
        }
    }

    // Replace <div className="flex h-full"> ... <aside ...>
    content = content.replace(
        /<div className="flex h-full">\s*\{\/\* ── Controls sidebar ─────────────────────────────────────── \*\/\}\s*<aside className="w-64 [^>]*?bg-card flex flex-col gap-5 p-5 overflow-y-auto">/,
        `<ResizablePanelGroup direction="horizontal" className="h-full w-full">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <ResizablePanel defaultSize={20} minSize={15} maxSize={40} className="bg-card flex flex-col gap-5 p-5 overflow-y-auto border-r">`
    );

    // Replace <aside className="w-72..."> (if any)
    content = content.replace(
        /<div className="flex h-full">\s*\{\/\* ── Controls sidebar ─────────────────────────────────────── \*\/\}\s*<aside className="w-72 [^>]*?bg-card flex flex-col gap-5 p-5 overflow-y-auto">/,
        `<ResizablePanelGroup direction="horizontal" className="h-full w-full">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <ResizablePanel defaultSize={25} minSize={15} maxSize={40} className="bg-card flex flex-col gap-5 p-5 overflow-y-auto border-r">`
    );

    // Replace </aside> ... <main ...>
    content = content.replace(
        /<\/aside>\s*(?:\{\/\* ── Results.*? \*\/\})?\s*<main className="flex-1 overflow-y-auto p-6">/,
        `</ResizablePanel>

      <ResizableHandle withHandle />

      {/* ── Results ──────────────────────────────────────────────── */}
      <ResizablePanel defaultSize={80} className="overflow-y-auto p-6">`
    );

    // Replace </main></div>
    content = content.replace(
        /<\/main>\s*<\/div>\s*\);\s*\}/,
        `</ResizablePanel>
    </ResizablePanelGroup>
  );
}`
    );

    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`Refactored ${filename}`);
});
