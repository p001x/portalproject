const fs = require('fs');
const path = require('path');

const pagesDir = path.join('c:', 'Users', 'user', 'Documents', 'blacportal', 'artifacts', 'geoportal', 'src', 'pages');
const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('Page.tsx') && f !== 'NDVIPage.tsx' && f !== 'SampleDigitizationPage.tsx');

files.forEach(file => {
    const filePath = path.join(pagesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // We just want to fix the MapExportControls for now.
    const pattern = /<MapExportControls[^>]*?\s*\/?>/g;
    content = content.replace(pattern, match => {
        let newMatch = match;
        if (!newMatch.includes('bbox=') && content.includes('data.bbox')) {
            newMatch = newMatch.replace('/>', '  bbox={data?.bbox}\n              />');
        }
        if (!newMatch.includes('classAreas=')) {
            if (content.includes('data.class_areas_km2')) {
                newMatch = newMatch.replace('/>', '  classAreas={data?.class_areas_km2}\n              />');
            } else if (content.includes('data.class_areas')) {
                newMatch = newMatch.replace('/>', '  classAreas={data?.class_areas}\n              />');
            }
        }
        return newMatch;
    });

    if (content !== fs.readFileSync(filePath, 'utf8')) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(Updated );
    }
});
