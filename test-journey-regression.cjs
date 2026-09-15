const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  let filePath;
  if (urlPath === '/' || urlPath === '/index.html') {
    filePath = path.join(__dirname, 'test-journey-regression.html');
  } else if (urlPath.startsWith('/assets/')) {
    filePath = path.join(__dirname, urlPath);
  } else {
    filePath = path.join(__dirname, urlPath);
  }
  
  const ext = path.extname(filePath);
  const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
  
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found: ' + filePath); return; }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(9880, async () => {
  console.log('Server on http://localhost:9880');
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('MAP-TRACE') || text.includes('MAP-CRASH')) {
      console.log('BROWSER:', msg.type(), text);
    }
  });
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.message);
  });
  
  await page.goto('http://localhost:9880/', {
    waitUntil: 'load',
    timeout: 30000
  });
  
  await wait(3000);
  
  console.log('Page loaded, running tests...');
  
  // Run all tests
  await page.click('#runAll');
  await wait(10000);
  
  // Get the log output
  const logContent = await page.$eval('#log', el => el.textContent);
  console.log('\n=== FULL LOG ===');
  console.log(logContent);
  
  await browser.close();
  server.close();
  console.log('\nTest complete');
});
