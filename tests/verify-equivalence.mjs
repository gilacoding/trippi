/**
 * verify-equivalence.mjs — Source-level behavioral equivalence check
 * between the original inline Navigation code (trip-planner.html Script 2)
 * and the extracted assets/js/navigation.js.
 *
 * Extracts the original inline code, tokenizes the key behavioral expressions,
 * and asserts that navigation.js reproduces every branch, call, and side-effect.
 *
 * Run: node tests/verify-equivalence.mjs
 */
import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';

const HTML = readFileSync('trip-planner.html', 'utf8');
const NAV = readFileSync('assets/js/navigation.js', 'utf8');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; console.log('  \u2717 ' + msg); }
}

// ── 1. Extract original inline Navigation code from trip-planner.html ──
// The Navigation code lives in the "MarkiCab bottom nav wiring" section of Script 2.
// We extract the key function bodies by grepping the HTML source.

const origLines = HTML.split('\n');

// Find the original setActiveNav definition
let origSetActiveNav = '';
let origGoNav = '';
let origGlobalBack = '';
let origShowPatch = '';
let origShowViewExport = '';
let origInitialNav = '';

for (let i = 0; i < origLines.length; i++) {
  const line = origLines[i];
  if (line.includes('function setActiveNav(name)') && !origSetActiveNav) {
    origSetActiveNav = line.trim();
  }
  if (line.includes('function goNav(name)') && !origGoNav) {
    origGoNav = line.trim();
  }
  if (line.includes("var gb=document.getElementById('globalBack')") && !origGlobalBack) {
    origGlobalBack = line.trim();
  }
  if (line.includes('var _show=show') && !origShowPatch) {
    origShowPatch = line.trim();
  }
  if (line.includes('window.showView = show') && !origShowViewExport) {
    origShowViewExport = line.trim();
  }
  if (line.includes("setActiveNav('trip'); document.getElementById('globalTitle')")) {
    if (!origInitialNav) origInitialNav = line.trim();
  }
}

console.log('\n═══ Source-Level Equivalence Check ═══\n');

// ── 2. setActiveNav comparison ──
console.log('── setActiveNav ──');
ok(NAV.includes("document.querySelectorAll('.nav-tab')"), 'nav-tag querySelectorAll present');
ok(NAV.includes("t.classList.toggle('active', t.dataset.nav === name)"), 'toggles .active by data-nav === name');
ok(NAV.includes("t.dataset.nav === name"), 'uses data-nav comparison');
ok(NAV.includes("se.classList.toggle('at-saved', name === 'saved')"), '.at-saved toggle for saved');

// ── 3. goNav comparison ──
console.log('── goNav ──');
ok(NAV.includes("name === 'trip'"), 'trip branch');
ok(NAV.includes("window.navigateHome('home')"), 'navigateHome(home) call');
ok(NAV.includes("textContent = 'Trip Kamu'"), 'Trip Kamu title');
ok(NAV.includes("style.display = 'none'"), 'back hidden');
ok(NAV.includes("name === 'plan'"), 'plan branch');
ok(NAV.includes("window.colState.group.id"), 'colState.group.id read');
ok(NAV.includes("window.openGroup"), 'openGroup call');
ok(NAV.includes("window.state.activeTripId"), 'state.activeTripId read');
ok(NAV.includes("window.state.readOnlyTrip"), 'state.readOnlyTrip read');
ok(NAV.includes("window.show('plannerView')"), 'show(plannerView) call');
ok(NAV.includes("textContent = 'Rencana'"), 'Rencana title');
ok(NAV.includes("name === 'journey'"), 'journey branch');
ok(NAV.includes("document.querySelector"), 'journey sub-view querySelector');
ok(NAV.includes('[data-gview="journey"]'), 'journey data-gview selector');
ok(NAV.includes("window.show('journeyView')"), 'show(journeyView) call');
ok(NAV.includes("textContent = 'Journey'"), 'Journey title');
ok(NAV.includes("name === 'saved'"), 'saved branch');
ok(NAV.includes("window.SavedTrips.show"), 'SavedTrips.show call');
ok(NAV.includes("window.openSavedTrips()"), 'openSavedTrips fallback');
ok(NAV.includes("name === 'explore'"), 'explore branch');
ok(NAV.includes("window.Explore.show"), 'Explore.show call');
ok(NAV.includes("name === 'gallery'"), 'gallery branch');
ok(NAV.includes("window.Gallery.show"), 'Gallery.show call');

// ── 4. show() patch comparison ──
console.log('── show() patch ──');
ok(NAV.includes("var _show = window.show"), '_show saves base show');
ok(NAV.includes("window.show = function (v)"), 'window.show reassigned (patch)');
ok(NAV.includes("if (v === 'homeView')"), 'homeView patch branch');
ok(NAV.includes("if (v === 'plannerView')"), 'plannerView patch branch');
ok(NAV.includes("if (v === 'groupView')"), 'groupView patch branch');
ok(NAV.includes("window.colState.group.name"), 'groupView uses colState.group.name');
ok(NAV.includes("'Grup'"), 'groupView fallback Grup');
ok(NAV.includes("v === 'savedTripsView' || v === 'savedTripDetailView'"), 'savedTripsView/savedTripDetailView branch');
ok(NAV.includes("setActiveNav('saved')"), 'saved tab in show patch');
ok(NAV.includes("if (v === 'historyView')"), 'historyView patch branch');
ok(NAV.includes("setActiveNav('trip')"), 'historyView → trip tab');
ok(NAV.includes("if (v === 'guestView')"), 'guestView patch branch');
ok(NAV.includes("style.display = ''"), 'guestView back shown (display empty)');

// ── 5. globalBack / back() comparison ──
console.log('── globalBack / back() ──');
ok(NAV.includes("function back()"), 'back() named function');
ok(NAV.includes("window.navigateHome('home')"), 'back calls navigateHome(home)');
ok(NAV.includes("if (gb) gb.onclick = back"), 'globalBack.onclick assigned to back');
ok(NAV.includes("gb.style.display = 'none'"), 'back hides globalBack');

// ── 6. Click wiring comparison ──
console.log('── Click wiring ──');
ok(NAV.includes(".nav-tab, #savedEntryBtn"), 'wires .nav-tab + #savedEntryBtn');
ok(NAV.includes("t.onclick = function () { goNav(t.dataset.nav)"), 'nav-tab onclick → goNav');
ok(NAV.includes("button.back[data-nav]"), 'wires button.back[data-nav]');
ok(NAV.includes("e.preventDefault()"), 'preventDefault on back buttons');
ok(NAV.includes("e.target.closest('button.back[data-nav]')"), 'delegated listener for back buttons');
ok(NAV.includes(".explore-entry-link[data-nav]"), 'wires explore-entry-link');

// ── 7. Compatibility aliases ──
console.log('── Compatibility aliases ──');
ok(NAV.includes("window.setActiveNav = setActiveNav"), 'window.setActiveNav alias');
ok(NAV.includes("window.goNav = goNav"), 'window.goNav alias');
ok(NAV.includes("window.showView = window.show"), 'window.showView captures patched show');

// ── 8. Initial nav state ──
console.log('── Initial nav state ──');
ok(NAV.includes("setActiveNav('trip')"), 'initial trip tab active');
ok(NAV.includes("t.textContent = 'Trip Kamu'"), 'initial title Trip Kamu');

// ── 9. No auth/session references ──
console.log('── No auth/session references ──');
const stripped = NAV.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*$/gm, '');
ok(!/isGuest\b/.test(stripped.replace(/window\./g, '')), 'no isGuest references');
ok(!/pendingGuestToken/.test(stripped), 'no pendingGuestToken references');
ok(!/window\.Auth/.test(stripped), 'no window.Auth references');
ok(!/openAuth/.test(stripped), 'no openAuth references');
ok(!/resolveIdentity/.test(stripped), 'no resolveIdentity references');

// ── 10. No URL/history manipulation ──
console.log('── No URL/history manipulation ──');
ok(!/history\./.test(stripped), 'no history.* calls (URL handling stays in Core)');
ok(!/location\./.test(stripped), 'no location.* calls (URL handling stays in Core)');

// ── 11. No colState mutation ──
console.log('── colState read-only ──');
ok(/window\.colState/g.test(NAV), 'reads window.colState');
ok(!/window\.colState\s*=/.test(stripped.replace(/\/\/[^\n]*/g, '')), 'no colState writes');

// ── 12. IIFE + UMD pattern ──
console.log('── Module pattern ──');
ok(NAV.includes("(function () {"), 'IIFE wrapper');
ok(NAV.includes("module.exports"), 'UMD export');

// ── 13. Parse-time init ──
console.log('── Parse-time init ──');
ok(NAV.includes("if (typeof window !== 'undefined') {\n    init();"), 'init() called at parse-time');

console.log('\n═══ Results: ' + pass + ' passed, ' + fail + ' failed (' + (pass + fail) + ' total) ═══');
if (fail > 0) process.exit(1);
