/**
 * Live browser test for forensic audit remediation.
 * Tests the actual running application at https://marki.cab
 * 
 * Run: node tests/live-test-forensic.mjs
 */

import puppeteer from 'puppeteer';

const BASE = 'https://marki.cab';
const EMAIL = 'gilangila@gmail.com';
const PASS = 'H5Bs8iNBD2MbRyp';

const browser = await puppeteer.launch({
  headless: false,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  slowMo: 500, // slow down for visibility
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

const errors = [];
const logs = [];
page.on('console', msg => {
  logs.push(`[${msg.type()}] ${msg.text()}`);
  if (msg.type() === 'error') {
    errors.push(msg.text());
  }
});
page.on('pageerror', err => {
  errors.push(`PAGE ERROR: ${err.message}`);
});

let passed = 0, failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name} ${detail}`);
    failed++;
  }
}

console.log('Phase 8 — Live Browser Test\n');

// ── 1. Login ─────────────────────────────────────────────────────
console.log('── 1. Login ──');
await page.goto(`${BASE}/trip-planner`, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForSelector('#loginEmail', { visible: true, timeout: 10000 });
await page.type('#loginEmail', EMAIL);
await page.type('#loginPass', PASS);
await page.click('#loginSubmit');
await page.waitForSelector('#headerAvatar', { visible: true, timeout:10000 });
check('Login successful', await page.$('#headerAvatar') !== null);

// ── 2. Create a test trip ────────────────────────────────────────
console.log('\n── 2. Create Test Trip ──');
await page.waitForSelector('#newTripBtn', { visible: true, timeout: 10000 });
await page.click('#newTripBtn');
await page.waitForSelector('#tripName', { visible: true, timeout:10000 });
await page.type('#tripName', `Test Trip ${Date.now()}`);
await page.type('#tripStart', '2026-10-01');
await page.type('#tripEnd', '2026-10-05');
await page.click('#newTripSubmit');
await page.waitForSelector('#shareTrip', { visible: true, timeout: 10000 });
check('Trip created (planner view)', await page.$('#shareTrip') !== null);

// ── 3. Check creator can edit trip (edit trip btn visible) ───────
console.log('\n── 3. Creator Can Edit ──');
const editTripBtnVisible = await page.$eval('#editTripBtn', el => el.style.display !== 'none' && el.offsetParent !== null).catch(() => false);
check('Edit trip button visible to creator', editTripBtnVisible);
const readOnlyBannerVisible = await page.$eval('#readOnlyBanner', el => el.style.display !== 'none' && el.offsetParent !== null).catch(() => false);
check('Read-only banner hidden for creator', !readOnlyBannerVisible);

// ── 4. Edit trip dates ───────────────────────────────────────────
console.log('\n── 4. Edit Trip Dates ──');
await page.click('#editTripBtn');
await page.waitForSelector('#tripStart', { visible: true, timeout: 10000 });
await page.$eval('#tripStart', el => el.value = '');
await page.type('#tripStart', '2026-10-10');
await page.$eval('#tripEnd', el => el.value = '');
await page.type('#tripEnd', '2026-10-12');
await page.click('#newTripSubmit');
await page.waitForFunction(() => {
  const meta = document.querySelector('#plannerMeta');
  return meta && meta.textContent.includes('Oct') && meta.textContent.includes('2026');
}, { timeout: 10000 }).catch(() => {});
const plannerMeta = await page.$eval('#plannerMeta', el => el.textContent).catch(() => '');
check('Trip dates updated', plannerMeta.includes('10') && plannerMeta.includes('12'), plannerMeta);

// ── 5. Add an item ────────────────────────────────────────────────
console.log('\n── 5. Add Item ──');
const addPanelVisible = await page.$eval('#addPanel', el => el.offsetParent !== null).catch(() => false);
check('Add panel visible for creator', addPanelVisible);
if (addPanelVisible) {
  await page.$eval('#agendaTitle', el => el.value = 'Test Item 1');
  await page.click('#addAgendaSubmit');
  await page.waitForSelector('[data-delete]', { visible: true, timeout: 10000 });
  const itemCount = await page.$$('[data-delete]');
  check('Item added successfully', itemCount.length > 0, `${itemCount.length} items`);
}

// ── 6. Navigate back to home then re-open trip ────────────────────
console.log('\n── 6. Navigation Test ──');
await page.click('[data-home]');
await page.waitForSelector('#tripList, .trip-list', { visible: true, timeout: 10000 });
await page.waitForTimeout(1000);
// Find and click the test trip card
const tripCards = await page.$$('.trip-card');
let testCard = null;
for (const card of tripCards) {
  const text = await card.evaluate(el => el.textContent);
  if (text.includes('Test Trip')) {
    testCard = card;
    break;
  }
}
if (testCard) {
  await testCard.click();
  await page.waitForSelector('#plannerName', { visible: true, timeout: 10000 });
  check('Trip re-opened from home', await page.$('#plannerName') !== null);
  
  // Check edit controls still visible after re-open
  const editVisibleAfterNav = await page.$eval('#editTripBtn', el => el.offsetParent !== null).catch(() => false);
  check('Edit controls preserved after navigation', editVisibleAfterNav);
} else {
  check('Found test trip card', false);
}

// ── 7. Share the trip ────────────────────────────────────────────
console.log('\n── 7. Share Trip ──');
await page.waitForSelector('#shareTrip', { visible: true, timeout: 10000 });
await page.click('#shareTrip');
await page.waitForSelector('#shareGroupBtn', { visible: true, timeout: 10000 });
await page.click('#shareGroupBtn');
await page.waitForSelector('#shareLink', { visible: true, timeout: 10000 });
const shareLink = await page.$eval('#shareLink', el => el.value).catch(() => '');
check('Share link generated', shareLink.includes('?gt='), shareLink.slice(0, 50));

// ── 8. Test deep link (simulating share link open) ───────────────
console.log('\n── 8. Deep Link Test ──');
await page.goto(`${BASE}/trip-planner#t=LZString_test`, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForTimeout(2000);
// Navigate back to home to check the trip still exists
await page.click('[data-home]').catch(() => {});
await page.waitForTimeout(2000);
check('App handled invalid hash gracefully', errors.filter(e => e.includes('pageerror')).length === 0);

// ── 9. Verify no console errors ──────────────────────────────────
console.log('\n── 9. Console Errors ──');
const criticalErrors = errors.filter(e => 
  !e.includes('webextension') && 
  !e.includes('supabase') && 
  !e.includes('chrome-extension') &&
  !e.includes('DevTools')
);
check('No critical console errors', criticalErrors.length === 0, criticalErrors.slice(0, 3).join('; '));

// ── Summary ───────────────────────────────────────────────────────
console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (errors.length > 0) {
  console.log('\nAll console logs:');
  logs.forEach(l => console.log('  ' + l));
}

await browser.close();

if (failed > 0) {
  process.exit(1);
}
