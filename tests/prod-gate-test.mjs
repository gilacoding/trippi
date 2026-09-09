import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'https://marki.cab';
const EMAIL = 'gilangila@gmail.com';
const PASS = 'H5Bs8iNBD2MbRyp';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const evidence = {
  metadata: { timestamp: new Date().toISOString(), baseUrl: BASE },
  login: {},
  trip: {},
  beforeEdit: {},
  ui: {},
  api: [],
  afterEdit: {},
  afterReconcile: {},
  afterReload: {},
  final: {}
};

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    slowMo: 200,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Capture console
  page.on('console', msg => {
    const text = msg.text();
    if (!text.includes('[sync]') && text.length < 300) {
      console.log(`  [console] ${text}`);
    }
  });

  // Capture API calls
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/rest/v1/rpc/') || url.includes('/rest/v1/groups') || url.includes('/rest/v1/shared_items')) {
      try {
        const json = await response.json();
        evidence.api.push({
          url: url.replace('https://ishflkcsdzlhhxtanhxf.supabase.co', ''),
          status: response.status(),
          body: json,
        });
        console.log(`  [API] ${url.replace('https://ishflkcsdzlhhxtanhxf.supabase.co', '')} → ${response.status()}`);
      } catch (e) {}
    }
  });

  // ── Step 1: Login ──────────────────────────────────────────────
  console.log('\n═══ Step 1: Login ═══');
  await page.goto(`${BASE}/trip-planner`, { waitUntil: 'networkidle0', timeout: 30000 });
  await wait(2000);

  const needLogin = await page.$('#loginEmail');
  if (needLogin) {
    await page.type('#loginEmail', EMAIL);
    await page.type('#loginPass', PASS);
    await page.click('#loginSubmit');
    await wait(5000);
  }

  const headerText = await page.$eval('#headerAvatar', el => el.textContent).catch(() => '?');
  console.log('Header avatar:', headerText);

  // Get auth UID
  const authUid = await page.evaluate(async () => {
    const sb = window.MarkiAPI && window.MarkiAPI._getSb && window.MarkiAPI._getSb();
    if (sb) {
      const { data } = await sb.auth.getUser();
      return data?.user?.id;
    }
    return window.colState?.uid;
  });
  evidence.login.uid = authUid;
  console.log('Auth UID:', authUid);

  // ── Step 2: Create a test trip ──────────────────────────────────
  console.log('\n═══ Step 2: Create Test Trip ═══');
  await page.waitForSelector('#newTripBtn', { visible: true, timeout: 10000 });
  await page.click('#newTripBtn');
  await wait(1000);

  const tripName = `PROD GATE ${Date.now()}`;
  await page.type('#tripName', tripName);
  await page.type('#tripStart', '2026-11-01');
  await page.type('#tripEnd', '2026-11-05');
  await page.click('#newTripSubmit');
  await wait(2000);

  // ── Step 3: Share the trip ──────────────────────────────────────
  console.log('\n═══ Step 3: Share Trip ═══');
  await page.waitForSelector('#shareTrip', { visible: true, timeout: 10000 });
  await page.click('#shareTrip');
  await wait(1000);

  await page.waitForSelector('#shareGroupBtn', { visible: true, timeout: 10000 });
  await page.click('#shareGroupBtn');
  await wait(3000);

  // ── Step 4: Capture trip state ──────────────────────────────────
  console.log('\n═══ Step 4: Capture Trip State ═══');
  const tripState = await page.evaluate(() => {
    const g = window.colState?.group;
    return {
      groupId: g?.id,
      groupName: g?.name,
      start_date: g?.start_date,
      end_date: g?.end_date,
      created_by: g?.created_by,
      role: g?.role,
    };
  });
  evidence.trip = tripState;
  console.log('Trip state:', JSON.stringify(tripState, null, 2));

  // Verify creator
  const isCreator = tripState.created_by === authUid;
  console.log('Is creator:', isCreator);

  // ── Step 5: Edit trip dates ─────────────────────────────────────
  console.log('\n═══ Step 5: Edit Trip Dates ═══');
  const editGroupBtnVisible = await page.$eval('#editGroupBtn', el => el.style.display !== 'none' && el.offsetParent !== null).catch(() => false);
  console.log('Edit group btn visible:', editGroupBtnVisible);
  evidence.beforeEdit.editGroupBtnVisible = editGroupBtnVisible;

  // Override prompt to return new dates
  await page.evaluate(() => {
    window.prompt = (msg, def) => {
      if (msg.includes('mulai')) return '2026-12-20';
      if (msg.includes('selesai')) return '2026-12-25';
      if (msg.includes('Nama')) return def;
      if (msg.includes('Destinasi')) return def;
      return def;
    };
  });

  await page.click('#editGroupBtn');
  await wait(3000);

  // ── Step 6: Capture after edit ──────────────────────────────────
  console.log('\n═══ Step 6: After Edit ═══');
  const afterEdit = await page.evaluate(() => {
    const g = window.colState?.group;
    return {
      start_date: g?.start_date,
      end_date: g?.end_date,
    };
  });
  evidence.afterEdit = afterEdit;
  console.log('After edit:', JSON.stringify(afterEdit, null, 2));

  // Check header
  const groupMeta = await page.$eval('#groupMeta', el => el.textContent).catch(() => 'N/A');
  console.log('Group meta:', groupMeta);

  // ── Step 7: Trigger reconciliation ──────────────────────────────
  console.log('\n═══ Step 7: Trigger Reconciliation ═══');
  await page.evaluate(() => {
    if (typeof reconcileTrip === 'function') {
      reconcileTrip('manual-test');
    }
  });
  await wait(3000);

  const afterReconcile = await page.evaluate(() => {
    const g = window.colState?.group;
    return {
      start_date: g?.start_date,
      end_date: g?.end_date,
    };
  });
  evidence.afterReconcile = afterReconcile;
  console.log('After reconcile:', JSON.stringify(afterReconcile, null, 2));

  // ── Step 8: Reload page ─────────────────────────────────────────
  console.log('\n═══ Step 8: Reload ═══');
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await wait(5000);

  // Navigate to the trip again
  const tripCards = await page.$$('.trip-card');
  let testCard = null;
  for (const card of tripCards) {
    const text = await card.evaluate(el => el.textContent);
    if (text.includes('PROD GATE')) {
      testCard = card;
      break;
    }
  }

  if (testCard) {
    await testCard.click();
    await wait(3000);
  }

  const afterReload = await page.evaluate(() => {
    const g = window.colState?.group;
    return {
      start_date: g?.start_date,
      end_date: g?.end_date,
    };
  });
  evidence.afterReload = afterReload;
  console.log('After reload:', JSON.stringify(afterReload, null, 2));

  // ── Step 9: Verify via direct database query ────────────────────
  console.log('\n═══ Step 9: Direct DB Verification ═══');
  const dbResult = await page.evaluate(async (groupId) => {
    const sb = window.MarkiAPI && window.MarkiAPI._getSb && window.MarkiAPI._getSb();
    if (!sb) return { error: 'No supabase client' };
    const { data, error } = await sb
      .from('groups')
      .select('id, name, start_date, end_date, created_by')
      .eq('id', groupId)
      .single();
    return { data, error: error?.message };
  }, tripState.groupId);
  evidence.final.dbDirect = dbResult;
  console.log('DB direct:', JSON.stringify(dbResult, null, 2));

  // ── Save evidence ───────────────────────────────────────────────
  const evidencePath = path.join(__dirname, '..', 'tests', 'evidence', `prod-gate-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log('\nEvidence saved to:', evidencePath);

  // ── Final verdict ───────────────────────────────────────────────
  console.log('\n═══ FINAL VERDICT ═══');
  const persisted = afterReload.start_date === '2026-12-20' && afterReload.end_date === '2026-12-25';
  const dbPersisted = dbResult.data?.start_date === '2026-12-20' && dbResult.data?.end_date === '2026-12-25';
  
  console.log('UI shows new dates:', persisted);
  console.log('DB has new dates:', dbPersisted);
  console.log('API calls made:', evidence.api.length);
  
  if (persisted && dbPersisted) {
    console.log('\nSTATUS: VERIFIED');
  } else {
    console.log('\nSTATUS: UNVERIFIED');
  }

  await browser.close();
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
