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
    if (text.includes('TEARDOWN') || text.includes('DRAGGABLE') || text.includes('CRASH')) {
      console.log('BROWSER:', msg.type(), text);
    }
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  // Test with production-like sequence
  await page.setContent(`
<!DOCTYPE html>
<html>
<head>
  <style>
    #container { width: 400px; height: 300px; border: 2px solid red; }
    #journeyContent { min-height: 400px; }
  </style>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
</head>
<body>
  <div id="journeyContent">
    <div id="container"></div>
  </div>
  
  <pre id="log"></pre>
  
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <script>
    var log = document.getElementById('log');
    var map = null;
    var container = document.getElementById('container');
    
    function addLog(msg) {
      log.textContent += msg + '\\n';
      console.log('[TEST]', msg);
    }
    
    function getLeafletElements() {
      var allLeaflet = document.querySelectorAll('[class*="leaflet-"]');
      var result = [];
      allLeaflet.forEach(function(el) {
        result.push({
          className: el.className.substring(0, 60),
          id: el.id || '',
          attached: document.contains(el),
          hasDraggable: el.classList.contains('leaflet-draggable'),
          width: el.offsetWidth,
          height: el.offsetHeight
        });
      });
      return result;
    }
    
    function countDraggables() {
      var count = 0;
      var allElements = document.querySelectorAll('*');
      allElements.forEach(function(el) {
        if (el.classList && el.classList.contains('leaflet-draggable')) {
          count++;
        }
      });
      return count;
    }
    
    // Instrument Draggable creation
    var origOnDown = L.Draggable.prototype._onDown;
    L.Draggable.prototype._onDown = function(e) {
      var el = this._element;
      console.log('[DRAGGABLE] _onDown', {
        elId: el ? el.id : '',
        elTag: el ? el.tagName : '',
        attached: el ? document.contains(el) : null,
        hasWidth: el ? el.offsetWidth : 0,
        hasHeight: el ? el.offsetHeight : 0
      });
      return origOnDown.apply(this, arguments);
    };
    
    // Step 1: Create map
    addLog('=== Step 1: CREATE MAP ===');
    map = L.map(container);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    map.setView([-6.247, 106.939], 13);
    
    addLog('Leaflet elements: ' + getLeafletElements().length);
    addLog('Draggables: ' + countDraggables());
    
    // Step 2: Replace DOM (simulating renderJourneyContent)
    addLog('\\n=== Step 2: REPLACE DOM ===');
    var jc = document.getElementById('journeyContent');
    jc.innerHTML = '<div id="container"></div>';
    container = document.getElementById('container');
    
    addLog('Leaflet elements after replace: ' + getLeafletElements().length);
    addLog('Draggables after replace: ' + countDraggables());
    addLog('Old map reference: ' + (map ? 'exists' : 'null'));
    
    // Step 3: Destroy map (simulating MapRenderer.destroy)
    addLog('\\n=== Step 3: DESTROY MAP ===');
    if (map) {
      addLog('Calling map.remove()...');
      map.remove();
      map = null;
    }
    
    addLog('Leaflet elements after destroy: ' + getLeafletElements().length);
    addLog('Draggables after destroy: ' + countDraggables());
    
    // Step 4: Create new map (simulating new MapRenderer.init)
    addLog('\\n=== Step 4: CREATE NEW MAP ===');
    map = L.map(container);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    map.setView([-6.247, 106.939], 13);
    
    addLog('Leaflet elements after new create: ' + getLeafletElements().length);
    addLog('Draggables after new create: ' + countDraggables());
    
    // Step 5: Test drag
    addLog('\\n=== Step 5: TEST DRAG ===');
    var rect = container.getBoundingClientRect();
    addLog('Container rect: ' + JSON.stringify({x: rect.x, y: rect.y, w: rect.width, h: rect.height}));
    
    var down = new MouseEvent('mousedown', {
      clientX: rect.x + rect.width/2,
      clientY: rect.y + rect.height/2,
      bubbles: true
    });
    container.dispatchEvent(down);
    
    setTimeout(function() {
      for (var i = 0; i < 5; i++) {
        var move = new MouseEvent('mousemove', {
          clientX: rect.x + rect.width/2 + (i+1)*10,
          clientY: rect.y + rect.height/2 + (i+1)*10,
          bubbles: true
        });
        document.dispatchEvent(move);
      }
      
      setTimeout(function() {
        var up = new MouseEvent('mouseup', { bubbles: true });
        document.dispatchEvent(up);
        addLog('\\nDrag complete');
        addLog('Final leaflet count: ' + getLeafletElements().length);
        addLog('Final draggable count: ' + countDraggables());
      }, 100);
    }, 100);
    
    addLog('Script loaded');
  <\/script>
</body>
</html>
  `);
  
  await wait(5000);
  
  // Get the log output
  const logContent = await page.$eval('#log', el => el.textContent);
  console.log('\n=== FULL LOG ===');
  console.log(logContent);
  
  await browser.close();
  console.log('\nTest complete');
})().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
