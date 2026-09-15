const puppeteer = require('puppeteer-core');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('MAP-TRACE') || text.includes('MAP-CRASH') || text.includes('LEAFLET')) {
      console.log('BROWSER:', msg.type(), text);
    }
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  // Navigate to main page
  console.log('Loading main page...');
  await page.goto('https://marki.cab/trip-planner', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  
  await wait(3000);
  
  // Check page state
  const pageInfo = await page.evaluate(() => {
    return {
      loggedIn: !!document.getElementById('headerAvatar'),
      loginForm: !!document.getElementById('loginEmail'),
      tripCards: document.querySelectorAll('.trip-card').length,
      groupName: document.getElementById('groupName') ? document.getElementById('groupName').textContent : null,
      journeyTab: !!document.querySelector('[data-gview="journey"]'),
      mapEl: !!document.getElementById('crewMap'),
      bodyText: document.body.innerText.substring(0, 200)
    };
  });
  console.log('Page info:', JSON.stringify(pageInfo, null, 2));
  
  // Login if needed
  if (pageInfo.loginForm) {
    console.log('Logging in...');
    await page.type('#loginEmail', 'gilangila@gmail.com');
    await page.type('#loginPass', 'H5Bs8iNBD2MbRyp');
    await page.click('#loginSubmit');
    await wait(3000);
    
    // Re-check
    const afterLogin = await page.evaluate(() => {
      return {
        tripCards: document.querySelectorAll('.trip-card').length,
        groupName: document.getElementById('groupName') ? document.getElementById('groupName').textContent : null
      };
    });
    console.log('After login:', JSON.stringify(afterLogin, null, 2));
  }
  
  // Click trip card if available
  if (pageInfo.tripCards > 0) {
    console.log('Clicking trip card...');
    await page.click('.trip-card:first-child');
    await wait(3000);
  }
  
  // Click Journey tab if available
  if (pageInfo.journeyTab) {
    console.log('Clicking Journey tab...');
    await page.click('[data-gview="journey"]');
    await wait(3000);
  }
  
  // Final state
  const finalState = await page.evaluate(() => {
    var mapEl = document.getElementById('crewMap');
    return {
      mapExists: !!mapEl,
      mapDisplay: mapEl ? mapEl.style.display : 'N/A',
      mapWidth: mapEl ? mapEl.offsetWidth : 0,
      mapHeight: mapEl ? mapEl.offsetHeight : 0,
      leafletContainers: document.querySelectorAll('.leaflet-container').length
    };
  });
  console.log('Final state:', JSON.stringify(finalState, null, 2));
  
  await browser.close();
  console.log('Test complete');
})().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
