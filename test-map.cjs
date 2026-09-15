const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Simple HTTP server
const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, req.url === '/' ? 'test-map.html' : req.url);
  const ext = path.extname(filePath);
  const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
  
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(9876, async () => {
  console.log('Server running on http://localhost:9876');
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log('CONSOLE:', msg.type(), msg.text());
  });
  
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.message);
  });
  
  await page.goto('http://localhost:9876/test-map.html');
  await wait(5000);
  
  const status = await page.$eval('#status', el => el.textContent);
  console.log('Status:', status);
  
  const mapEl = await page.$('#crewMap');
  if (mapEl) {
    const box = await mapEl.boundingBox();
    console.log('Map dimensions:', JSON.stringify(box));
    
    const leaflet = await page.$$('.leaflet-container');
    console.log('Leaflet containers:', leaflet.length);
    
    if (box && box.width > 0 && box.height > 0) {
      console.log('Attempting drag...');
      await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
      await page.mouse.down();
      await page.mouse.move(box.x + 50, box.y + 50, {steps: 5});
      await page.mouse.up();
      console.log('Drag complete');
      await wait(2000);
    }
  }
  
  await browser.close();
  server.close();
  console.log('Test complete');
});
