const puppeteer = require('puppeteer-core');
const path = require('path');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  const filePath = 'file://' + path.resolve(__dirname, 'test-leaflet-teardown.html').replace(/\\/g, '/');
  console.log('Loading:', filePath);
  
  await page.goto(filePath, {
    waitUntil: 'load',
    timeout: 30000
  });
  
  await wait(5000);
  
  console.log('\n=== RUNNING FULL SEQUENCE ===');
  
  try {
    await page.waitForSelector('#full-sequence', { visible: true, timeout: 10000 });
    await page.click('#full-sequence');
    await wait(5000);
  } catch(e) {
    console.log('Sequence click failed:', e.message);
  }
  
  await browser.close();
  console.log('\nTest complete');
})().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
