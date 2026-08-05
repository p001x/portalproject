import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText || 'Unknown'));

  // Wait for the app to load
  await page.goto('http://localhost:5173/digitization', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  
  const content = await page.evaluate(() => document.body.innerHTML);
  if (content.includes('leaflet-container')) {
    console.log("leaflet-container FOUND in DOM");
  } else {
    console.log("leaflet-container NOT FOUND in DOM");
  }

  await browser.close();
})();
