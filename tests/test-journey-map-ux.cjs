// Verifies the two Journey-map UX fixes in the real (local) trip-planner.html:
//  1. markers carry resolved display_name, not user_id
//  2. fitToMarkers() fires once (initial), not on subsequent updates
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('trip-planner.html', 'utf8');

// Extract loadCrewMap body by brace matching from its declaration.
const marker = 'async function loadCrewMap(){';
const start = html.indexOf(marker);
if (start < 0) throw new Error('loadCrewMap not found');
let i = start + marker.length - 1; // at opening '{'
let depth = 0, end = -1;
for (; i < html.length; i++) {
  if (html[i] === '{') depth++;
  else if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
if (end < 0) throw new Error('unbalanced braces');
const fnSrc = html.slice(start, end);

// Harness state + stubs
const dom = new JSDOM('<div id="crewMap"></div><div id="crewEmpty"></div>');
const document = dom.window.document;

const calls = { init: 0, setMarkers: 0, fit: 0, clear: 0 };
const lastMarkers = [];

global.window = dom.window;
function MapRenderer() {}
MapRenderer.prototype.init = async function () { calls.init++; this.map = {}; return this; };
MapRenderer.prototype.setMarkers = function (pts) { calls.setMarkers++; lastMarkers.length = 0; lastMarkers.push(...pts); };
MapRenderer.prototype.fitToMarkers = function () { calls.fit++; };

const locs = [
  { user_id: '8f49a289-4fb7-46f8-89d4-bf795fd8b89c', latitude: -7.79, longitude: 110.38 },
  { user_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', latitude: -7.80, longitude: 110.39 }
];
const colState = { uid: '8f49a289-4fb7-46f8-89d4-bf795fd8b89c', crewLocations: [], group: { id: 'g1' } };
const API = { getCrewLocations: async () => ({ data: locs, error: null }) };
function nameOf(uid) { return uid === colState.uid ? 'Budi' : 'Siti'; }
function distanceMeters() { return 1234; }
function renderCrewStatusList() {}
function updateCrewStatus() {}

// Compile the function into this scope so it sees our stubs/globals.
eval(fnSrc);

(async () => {
  // Call 1: initial — should fit
  await loadCrewMap();
  const n1 = lastMarkers.map(m => m.name);
  console.log('T1 initial names =', JSON.stringify(n1), '(expect ["Budi","Siti"])');
  console.log('T1 fit count after first load =', calls.fit, '(expect 1)');
  console.log('T1 init count =', calls.init, '(expect 1)');

  // Call 2: realtime/poll update — should NOT fit
  await loadCrewMap();
  console.log('T2 fit count after update =', calls.fit, '(expect still 1)');
  console.log('T2 setMarkers count =', calls.setMarkers, '(expect 2)');
  console.log('T2 init count =', calls.init, '(expect still 1 — no new MapRenderer)');

  const pass =
    n1[0] === 'Budi' && n1[1] === 'Siti' &&
    calls.fit === 1 && calls.init === 1 && calls.setMarkers === 2;

  console.log(pass ? 'ALL VIEWPORT+NAME LOGIC TESTS PASS' : 'LOGIC TEST FAILURE');
  process.exit(pass ? 0 : 1);
})();
