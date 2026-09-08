/**
 * Screenshot smoke test for MarkiCab
 * Takes screenshots of key views for visual audit
 * Run: node tests/screenshot-smoke.mjs
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';

const SCREENSHOT_DIR = path.join(process.cwd(), 'tests', 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Platform-specific Chrome path
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
];

const CHROME_PATH = CHROME_PATHS.find(p => fs.existsSync(p)) || '/usr/bin/google-chrome';

const VIEWS = [
  { name: 'home', path: 'trip-planner.html', actions: [] },
  { name: 'new-trip', path: 'trip-planner.html', actions: [{ click: '#newTripBtn' }] },
  { name: 'import-modal', path: 'trip-planner.html', actions: [{ click: '#importTripBtn' }] },
  { name: 'auth-modal', path: 'trip-planner.html', actions: [{ click: '#headerAvatar' }] },
];

function startServer() {
  const server = http.createServer((req, res) => {
    const filePath = path.join(process.cwd(), req.url === '/' ? 'trip-planner.html' : req.url);
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    };
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, 'localhost', () => {
      const port = server.address().port;
      console.log(`Server running on http://localhost:${port}`);
      resolve({ server, port });
    });
  });
}

async function main() {
  const { server, port } = await startServer();
  
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 }); // iPhone 12

  const results = [];
  for (const view of VIEWS) {
    try {
      await page.goto(`http://localhost:${port}/${view.path}`, { waitUntil: 'networkidle0' });
      await new Promise(r => setTimeout(r, 500));
      
      for (const action of view.actions) {
        if (action.click) {
          await page.click(action.click);
          await new Promise(r => setTimeout(r, 300));
        }
      }

      const screenshotPath = path.join(SCREENSHOT_DIR, `${view.name}.png`);
      await page.screenshot({ path: screenshotPath });
      results.push({ view: view.name, status: 'ok', path: screenshotPath });
      console.log(`✓ ${view.name}`);
    } catch (e) {
      results.push({ view: view.name, status: 'error', error: e.message });
      console.log(`✗ ${view.name}: ${e.message}`);
    }
  }

  await browser.close();
  server.close();
  
  // Write summary
  const summary = { timestamp: new Date().toISOString(), results };
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  
  const passed = results.filter(r => r.status === 'ok').length;
  console.log(`\nResults: ${passed}/${results.length} screenshots captured`);
  
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
