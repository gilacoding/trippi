const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, req.url === '/' ? 'test-leaflet-minimal.html' : req.url);
  const ext = path.extname(filePath);
  const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(9878, async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('http://localhost:9878/test-leaflet-minimal.html');
  await wait(2000);
  
  console.log('=== Test: Check Leaflet Version ===');
  
  // Check Leaflet version
  const leafletInfo = await page.evaluate(() => {
    return {
      LExists: typeof L !== 'undefined',
      leafletVersion: L ? L.version : 'N/A'
    };
  });
  console.log('Leaflet info:', JSON.stringify(leafletInfo));
  
  console.log('=== Test: Init → No Drag → Check Map ===');
  
  console.log('1. Init map');
  await page.click('#init');
  await wait(3000);
  
  // Check internal map state
  const debug = await page.evaluate(() => {
    var el = document.getElementById('map');
    var container = el.querySelector('.leaflet-container');
    return {
      hasContainer: !!container,
      containerHTML: container ? container.outerHTML.substring(0, 200) : 'none',
      elWidth: el.offsetWidth,
      elHeight: el.offsetHeight,
      elStyle: el.style.cssText,
      mapPanes: container ? !!container.querySelector('.leaflet-map-pane') : false,
      mapPaneTransform: container ? (function() {
        var pane = container.querySelector('.leaflet-map-pane');
        return pane ? pane.style.transform : 'no pane';
      })() : 'no container'
    };
  });
  console.log('Debug:', JSON.stringify(debug, null, 2));
  
  console.log('=== Test: Drag via real mouse events ===');
  
  // Try using real mouse events instead of simulated ones
  const box = await page.$eval('#map', el => {
    var rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  });
  
  console.log('Map box:', JSON.stringify(box));
  
  // Real mouse drag
  await page.mouse.move(box.x + box.w/2, box.y + box.h/2);
  await page.mouse.down();
  await wait(100);
  await page.mouse.move(box.x + box.w/2 + 50, box.y + box.h/2 + 50, {steps: 5});
  await page.mouse.up();
  await wait(2000);
  
  console.log('Test complete');
  
  await browser.close();
  server.close();
});
