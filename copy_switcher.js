const fs = require('fs');
const path = require('path');

const pagesDir = 'c:\\Users\\user\\Documents\\blacportal\\artifacts\\geoportal\\src\\pages';
const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('Page.tsx'));

for (const file of files) {
    const filepath = path.join(pagesDir, file);
    let content = fs.readFileSync(filepath, 'utf-8');

    // Find the Map tab contents
    const mapTabRegex = /<TabsContent value="map"[^>]*>([\s\S]*?)<div\s+className="h-\[520px\]/;
    const mapTabMatch = content.match(mapTabRegex);
    if (!mapTabMatch) continue;

    let switcherContent = mapTabMatch[1].trim();

    // Remove {mapMutation.isPending && !mapData ? ...
    switcherContent = switcherContent.replace(/\{[a-zA-Z0-9_]+\.isPending && ![a-zA-Z0-9_]+ \?\s*\([\s\S]*?\)\s*:\s*[a-zA-Z0-9_]+\s*\?\s*\(\s*<>/, '').trim();

    // Remove any stray <> or </> from the start
    if (switcherContent.startsWith('<>')) {
        switcherContent = switcherContent.substring(2).trim();
    }

    if (!switcherContent) continue;

    // Now find the static-map tab
    const staticMapHeaderRegex = /(<TabsContent value="static-map"[^>]*>[\s\S]*?<div[^>]*High-quality static maps[^<]*<\/p>\s*<\/div>)/;
    const staticMapHeaderMatch = content.match(staticMapHeaderRegex);
    if (!staticMapHeaderMatch) continue;

    const staticMapHead = staticMapHeaderMatch[1];

    // Find the start of the MapExportControls block
    const staticTabRegex = /(<TabsContent value="static-map"[^>]*>[\s\S]*?)<div className="bg-card border rounded-lg p-4">/;
    const staticTabMatch = content.match(staticTabRegex);

    if (staticTabMatch) {
        const oldStaticHeader = staticTabMatch[1];
        
        // Avoid double-inserting
        if (oldStaticHeader.includes('Map Symbology:') || oldStaticHeader.includes('Map Layer Switcher Header') || oldStaticHeader.includes('Select Map to Export')) {
            // Already has something, replace the switcher part or skip if it's the beautiful one
            // We'll replace everything between staticMapHead and the <div className="bg-card border rounded-lg p-4">
            
            const newStaticHeader = staticMapHead + "\n\n              " + switcherContent + "\n\n              ";
            content = content.replace(oldStaticHeader, newStaticHeader);
            fs.writeFileSync(filepath, content, 'utf-8');
            console.log(`Updated ${file}`);
        } else {
            const newStaticHeader = staticMapHead + "\n\n              " + switcherContent + "\n\n              ";
            content = content.replace(oldStaticHeader, newStaticHeader);
            fs.writeFileSync(filepath, content, 'utf-8');
            console.log(`Updated ${file}`);
        }
    }
}
