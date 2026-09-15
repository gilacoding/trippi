const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Simple HTTP server
const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, req.url === '/' ? 'test-journey-lifecycle.html' : req.url);
  const ext = path.extname(filePath);
  const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
  
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(9877, async () => {
  console.log('Server running on http://localhost:9877');
  
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
  
  await page.goto('http://localhost:9877/test-journey-lifecycle.html');
  await wait(2000);
  
  // Test: Show journey, drag, hide, reinit, drag
  console.log('=== Test 1: Show Journey ===');
  await page.click('#showJourney');
  await wait(3000);
  
  console.log('=== Test 2: Drag Map ===');
  await page.click('#drag');
  await wait(2000);
  
  console.log('=== Test 3: Hide Journey ===');
  await page.click('#hideJourney');
  await wait(1000);
  
  console.log('=== Test 4: Reinitialize ===');
  await page.click('#reinit');
  await wait(3000);
  
  console.log('=== Test 5: Drag Again ===');
  await page.click('#drag');
  await wait(2000);
  
  const status = await page.$eval('#status', el => el.textContent);
  console.log('Final status:', status);
  
  await browser.close();
  server.close();
  console.log('Test complete');
});
