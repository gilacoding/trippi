const puppeteer = require('puppeteer-core');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  
  const page = await browser.newPage();
  
  let traces = [];
  let errors = [];
  let crashCount = 0;
  
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('MAP-TRACE') || text.includes('MAP-CRASH') || text.includes('MAP-STALE-DRAG')) {
      traces.push(text);
      if (text.includes('MAP-CRASH')) crashCount++;
    }
  });
  
  page.on('pageerror', err => {
    errors.push(err.message);
    console.log('PAGE ERROR:', err.message);
  });
  
  console.log('=== LOADING MARKI.CAB ===');
  await page.goto('https://marki.cab/trip-planner', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(8000);
  
  // Login if needed
  const loginForm = await page.$('#loginEmail');
  if (loginForm) {
    console.log('Logging in...');
    await page.type('#loginEmail', 'gilangila@gmail.com');
    await page.type('#loginPass', 'H5Bs8iNBD2MbRyp');
    await page.click('#loginSubmit');
    await wait(5000);
  }
  
  // Navigate to group
  console.log('Navigating to group...');
  await page.goto('https://marki.cab/trip-planner?group=acd64706-361b-41b4-8908-4c0262b6ae72', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await wait(8000);
  
  console.log('\n=== TEST 1: Click Journey tab ===');
  const journeyBtn = await page.$('[data-gview="journey"]');
  if (journeyBtn) {
    await journeyBtn.click();
    await wait(8000);
  }
  
  // Check state after first entry
  let state = await page.evaluate(() => {
    var mapEl = document.getElementById('crewMap');
    return {
      mapExists: !!mapEl,
      mapWidth: mapEl ? mapEl.offsetWidth : 0,
      mapHeight: mapEl ? mapEl.offsetHeight : 0,
      leafletContainers: document.querySelectorAll('.leaflet-container').length,
      journeyMapExists: !!window._journeyMap,
      journeyMapRendererId: window._journeyMap ? window._journeyMap._rendererId : null
    };
  });
  console.log('After first Journey entry:', JSON.stringify(state));
  
  console.log('\n=== TEST 2: Leave and re-enter Journey (x3) ===');
  for (var i = 0; i < 3; i++) {
    const itBtn = await page.$('[data-gview="itinerary"]');
    if (itBtn) { itBtn.click(); await wait(2000); }
    const jrBtn = await page.$('[data-gview="journey"]');
    if (jrBtn) { jrBtn.click(); await wait(3000); }
  }
  await wait(3000);
  
  state = await page.evaluate(() => {
    var mapEl = document.getElementById('crewMap');
    return {
      mapExists: !!mapEl,
      mapWidth: mapEl ? mapEl.offsetWidth : 0,
      mapHeight: mapEl ? mapEl.offsetHeight : 0,
      leafletContainers: document.querySelectorAll('.leaflet-container').length,
      journeyMapExists: !!window._journeyMap,
      journeyMapDestroyed: window._journeyMap ? window._journeyMap._destroyed : null,
      journeyMapRendererId: window._journeyMap ? window._journeyMap._rendererId : null
    };
  });
  console.log('After leave/re-enter x3:', JSON.stringify(state));
  
  console.log('\n=== TEST 3: Rapid tab switching (x5) ===');
  for (var i = 0; i < 5; i++) {
    const itBtn = await page.$('[data-gview="itinerary"]');
    if (itBtn) { itBtn.click(); await wait(500); }
    const jrBtn = await page.$('[data-gview="journey"]');
    if (jrBtn) { jrBtn.click(); await wait(500); }
  }
  await wait(5000);
  
  state = await page.evaluate(() => {
    var mapEl = document.getElementById('crewMap');
    return {
      mapExists: !!mapEl,
      mapWidth: mapEl ? mapEl.offsetWidth : 0,
      mapHeight: mapEl ? mapEl.offsetHeight : 0,
      leafletContainers: document.querySelectorAll('.leaflet-container').length,
      crewMapElements: document.querySelectorAll('#crewMap').length,
      journeyMapExists: !!window._journeyMap,
      journeyMapDestroyed: window._journeyMap ? window._journeyMap._destroyed : null,
      journeyMapRendererId: window._journeyMap ? window._journeyMap._rendererId : null
    };
  });
  console.log('After rapid switching x5:', JSON.stringify(state));
  
  console.log('\n=== TEST 4: Diagnose map state ===');
  const diag = await page.evaluate(() => {
    if (window._diagnoseMapCrash) return window._diagnoseMapCrash();
    return null;
  });
  console.log('Diagnosis:', JSON.stringify(diag, null, 2));
  
  console.log('\n=== TEST 5: Check for duplicate MapRenderers ===');
  const rendererCheck = await page.evaluate(() => {
    if (window._getMapLog) {
      var log = window._getMapLog();
      var creates = log.filter(e => e.msg === 'RENDERER_CREATED');
      var destroys = log.filter(e => e.msg === 'DESTROY');
      return {
        totalCreated: creates.length,
        totalDestroyed: destroys.length,
        creates: creates.map(c => ({ id: c.data.rendererId, el: c.data.elementId })),
        destroys: destroys.map(d => ({ id: d.data.rendererId, hadMap: d.data.hadMap }))
      };
    }
    return null;
  });
  console.log('Renderer lifecycle:', JSON.stringify(rendererCheck, null, 2));
  
  console.log('\n=== TEST 6: Drag map ===');
  const mapEl = await page.$('#crewMap');
  if (mapEl) {
    const box = await mapEl.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width/2 + 30, box.y + box.height/2 + 30, {steps: 5});
      await page.mouse.move(box.x + box.width/2 + 60, box.y + box.height/2 + 60, {steps: 5});
      await page.mouse.up();
      await wait(3000);
      console.log('Drag completed');
    }
  }
  
  state = await page.evaluate(() => {
    var mapEl = document.getElementById('crewMap');
    return {
      mapExists: !!mapEl,
      mapWidth: mapEl ? mapEl.offsetWidth : 0,
      mapHeight: mapEl ? mapEl.offsetHeight : 0,
      leafletContainers: document.querySelectorAll('.leaflet-container').length,
      journeyMapExists: !!window._journeyMap,
      journeyMapDestroyed: window._journeyMap ? window._journeyMap._destroyed : null
    };
  });
  console.log('After drag:', JSON.stringify(state));
  
  await browser.close();
  
  console.log('\n========================================');
  console.log('=== FINAL VERIFICATION SUMMARY ===');
  console.log('========================================');
  console.log('Total errors:', errors.length);
  console.log('offsetWidth crashes:', errors.filter(e => e.includes('offsetWidth')).length);
  console.log('baseVal crashes:', errors.filter(e => e.includes('baseVal')).length);
  console.log('MAP-CRASH diagnostics:', crashCount);
  console.log('Unique error types:', [...new Set(errors)]);
  
  console.log('\n=== VERIFICATION CHECKLIST ===');
  console.log('1. No crashes during load:', errors.filter(e => e.includes('offsetWidth')).length === 0 ? 'PASS' : 'FAIL');
  console.log('2. No duplicate renderers:', rendererCheck && rendererCheck.totalCreated <= 2 ? 'PASS' : 'CHECK');
  console.log('3. No MAP-CRASH diagnostics:', crashCount === 0 ? 'PASS' : 'FAIL');
  console.log('4. Map attached after interactions:', state && state.mapExists && state.mapWidth > 0 ? 'PASS' : 'FAIL');
  console.log('5. Renderer not destroyed mid-use:', state && state.journeyMapDestroyed === false ? 'PASS' : 'FAIL');
  console.log('6. Single Leaflet container:', state && state.leafletContainers === 1 ? 'PASS' : 'CHECK');
})().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
