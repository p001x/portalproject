const fs = require('fs');
const path = require('path');

const srcDir = path.join('c:', 'Users', 'user', 'Documents', 'blacportal', 'artifacts', 'geoportal', 'src');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir(srcDir, function(filePath) {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // fetch("/api/..."), fetch('/api/...'), fetch(`/api/...`)
    content = content.replace(/fetch\(\s*(["'`])\/api\/(.*?)\1/g, (match, quote, urlRest) => {
      return `fetch(\`\${import.meta.env.VITE_API_URL || ""}/api/${urlRest}\``;
    });

    // form.action = "/api/..."
    content = content.replace(/form\.action\s*=\s*(["'`])\/api\/(.*?)\1/g, (match, quote, urlRest) => {
      return `form.action = \`\${import.meta.env.VITE_API_URL || ""}/api/${urlRest}\``;
    });

    // setNativePreviewUrl(`/api/...`)
    content = content.replace(/setNativePreviewUrl\(\s*(["'`])\/api\/(.*?)\1/g, (match, quote, urlRest) => {
      return `setNativePreviewUrl(\`\${import.meta.env.VITE_API_URL || ""}/api/${urlRest}\``;
    });
    
    // some fetches might be inside template literals but using variables inside, e.g. `/api/analytics/summary${daysQuery}`
    // My regex (.*?) will match until the next backtick, which is fine since the backtick is captured.

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  }
});

console.log("Done");
