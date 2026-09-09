import http from 'http';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function startServer() {
  const server = http.createServer((req, res) => {
    const filePath = path.join(process.cwd(), req.url === '/' ? 'trip-planner.html' : req.url);
    const ext = path.extname(filePath);
    const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  const { server, port } = await startServer();
  console.log(`Server running on http://localhost:${port}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-extensions'],
  });

  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/trip-planner.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  const tests = await page.evaluate(() => {
    const results = [];
    results.push({ name: 'utils.esc', pass: window.utils.esc('<b>') === '&lt;b&gt;' });
    results.push({ name: 'utils.money', pass: window.utils.money(50000).includes('50.000') });
    results.push({ name: 'utils.dateText', pass: window.utils.dateText('2026-09-09').length > 0 });
    results.push({ name: 'utils.daysBetween', pass: window.utils.daysBetween('2026-09-01','2026-09-03').length === 3 });
    results.push({ name: 'utils.normalizeLink', pass: window.utils.normalizeLink('google.com') === 'https://google.com' });
    results.push({ name: 'utils.categoryIcon', pass: window.utils.categoryIcon('Makan') === '🍜' });
    results.push({ name: 'utils.isPlaceholderName', pass: window.utils.isPlaceholderName('Guest') === true });
    results.push({ name: 'utils.isPlaceholderName real', pass: window.utils.isPlaceholderName('Gilang') === false });
    results.push({ name: 'utils.humanErr', pass: window.utils.humanErr({message: 'invalid login'}).length > 0 });
    const importRes = window.importParser.parseImport('{"name":"Test","items":[{"title":"A"}]}');
    results.push({ name: 'importParser.parseImport valid', pass: importRes.valid === true && importRes.preview.itemCount === 1 });
    const invalidRes = window.importParser.parseImport('not json');
    results.push({ name: 'importParser.parseImport invalid', pass: invalidRes.valid === false });
    results.push({ name: 'importParser.lineOfOffset', pass: window.importParser.lineOfOffset('abc\ndef', 5).line === 2 });
    results.push({ name: 'galleryLightbox loaded', pass: typeof window.galleryLightbox !== 'undefined' });
    results.push({ name: 'gallery loaded', pass: typeof window.gallery !== 'undefined' });
    results.push({ name: 'gallery.loadGallery', pass: typeof window.gallery.loadGallery === 'function' });
    results.push({ name: 'gallery.renderGallery', pass: typeof window.gallery.renderGallery === 'function' });
    results.push({ name: 'gallery.openGalleryLightbox', pass: typeof window.gallery.openGalleryLightbox === 'function' });
    results.push({ name: 'gallery.closeGalleryLightbox', pass: typeof window.gallery.closeGalleryLightbox === 'function' });
    results.push({ name: 'gallery.startCamera', pass: typeof window.gallery.startCamera === 'function' });
    results.push({ name: 'gallery.capturePhoto', pass: typeof window.gallery.capturePhoto === 'function' });
    results.push({ name: 'gallery._addBatchFiles', pass: typeof window.gallery._addBatchFiles === 'function' });
    return results;
  });

  console.log('\n=== Gallery Extraction Live Test Results ===');
  let passed = 0;
  tests.forEach(t => {
    const status = t.pass ? '✓' : '✗';
    console.log(status + ' ' + t.name);
    if (t.pass) passed++;
  });
  console.log('\n' + passed + '/' + tests.length + ' tests passed');

  await browser.close();
  server.close();
  process.exit(passed === tests.length ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
