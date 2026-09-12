const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\user\\Documents\\blacportal\\artifacts\\geoportal\\src\\pages';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

files.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let newContent = content.replace(/pointer-events-auto transition-all hover:scale-105/g, 'pointer-events-none transition-all');
    newContent = newContent.replace(/pointer-events-auto transition-transform hover:scale-105/g, 'pointer-events-none transition-transform');
    if (newContent !== content) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`Updated ${file}`);
    }
});
