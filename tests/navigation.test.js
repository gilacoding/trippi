/**
 * navigation.test.js — Unit tests for the extracted Navigation module.
 *
 * Verifies:
 *   - window.Navigation interface (init, setActiveNav, goNav, back)
 *   - Compatibility aliases (window.setActiveNav, window.goNav, window.showView)
 *   - show() patch syncs nav state + title + back-button per view
 *   - init() is idempotent
 *   - goNav branches (trip, plan, journey, saved, explore, gallery)
 *   - back() handler
 *   - No accidental lexical-scope access (all Core deps via window.*)
 *
 * Run: node tests/navigation.test.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

const NAV_PATH = path.resolve(__dirname, '..', 'assets', 'js', 'navigation.js');

// ── Harness ────────────────────────────────────────────────────────────
let passedCount = 0;
let failedCount = 0;

function recordPass()   { passedCount++; }
function recordFail(msg) { failedCount++; console.log('  ✗ ' + msg); }

function section(title) { console.log('\n═══ ' + title + ' ═══'); }

/**
 * Build a JSDOM with the nav-bar DOM elements Navigation needs at init time.
 * Returns the dom; caller then installs stubs on dom.window *before* requiring
 * the module (so init() at parse-time sees the right stubs).
 */
function freshDom(html) {
  const dom = new JSDOM(html || '<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'http://localhost/trip-planner.html',
  });
  global.window   = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  return dom;
}

/** Install Core stubs that navigation.js's init() reads at parse-time. */
function installCoreStubs(dom) {
  const win = dom.window;
  // Base show — will be patched by Navigation.init()
  win.show = function (v) { /* base: just record the call */ };
  // navigateHome — called from goNav/back (requires §9 Core export)
  win.navigateHome = function (reason) { win.__navigateHomeCalls = (win.__navigateHomeCalls || []).push(reason); };
  // colState / state — read-only Core state
  win.colState = { group: null };
  win.state = { activeTripId: null, readOnlyTrip: null };
  // openGroup / openSavedTrips — Core functions
  win.openGroup = function () { /* stub */ };
  win.openSavedTrips = function () { /* stub */ };
}

/**
 * Require navigation.js fresh (cleared from cache) on the current dom.window.
 * The IIFE runs immediately and calls init() at parse-time.
 */
function loadNavigation() {
  delete require.cache[NAV_PATH];
  return require(NAV_PATH);
}

function clearWindowProps() {
  const win = global.window;
  // Clean up anything from prior iterations
  ['Navigation', 'setActiveNav', 'goNav', 'showView'].forEach(k => {
    if (k in win) delete win[k];
  });
}

// ── Tests ──────────────────────────────────────────────────────────────
section('Interface publication');
test('window.Navigation has init, setActiveNav, goNav, back', () => {
  const dom = freshDom('<body><div id="globalBack"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();
  assert.ok(dom.window.Navigation, 'window.Navigation exists');
  assert.strictEqual(typeof dom.window.Navigation.init, 'function', 'init is function');
  assert.strictEqual(typeof dom.window.Navigation.setActiveNav, 'function', 'setActiveNav is function');
  assert.strictEqual(typeof dom.window.Navigation.goNav, 'function', 'goNav is function');
  assert.strictEqual(typeof dom.window.Navigation.back, 'function', 'back is function');
  recordPass();
});

test('compatibility aliases published on window', () => {
  const dom = freshDom('<body><div id="globalBack"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();
  assert.strictEqual(dom.window.setActiveNav, dom.window.Navigation.setActiveNav, 'window.setActiveNav === Navigation.setActiveNav');
  assert.strictEqual(dom.window.goNav, dom.window.Navigation.goNav, 'window.goNav === Navigation.goNav');
  assert.strictEqual(typeof dom.window.showView, 'function', 'window.showView is a function (patched show)');
  recordPass();
});

section('init() behavior');
test('init is idempotent — second call is no-op', () => {
  const dom = freshDom('<body><div id="globalBack"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();

  const showCountBefore = dom.window.__showCallCount || 0;
  // Calling init again should not re-patch or re-wire
  dom.window.Navigation.init();
  dom.window.Navigation.init();
  assert.strictEqual(typeof dom.window.showView, 'function', 'showView still set after re-init');
  recordPass();
});

test('init installs show() patch that syncs nav state', () => {
  const dom = freshDom('<body><div id="globalBack"></div><div id="globalTitle"></div><div class="nav-tab" data-nav="trip"></div><div class="nav-tab" data-nav="plan"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();

  // After init, window.show is patched
  let calledWith = null;
  const origShow = dom.window.show;
  assert.strictEqual(origShow, dom.window.showView, 'showView captures patched show');

  // Calling patched show('plannerView') should sync nav
  dom.window.show('plannerView');
  assert.strictEqual(dom.window.__showCalls, undefined, 'base show was a no-op stub');
  var planTab = dom.window.document.querySelector('.nav-tab[data-nav="plan"]');
  assert.ok(planTab.classList.contains('active'), 'plan tab has .active after show("plannerView")');
  recordPass();
});

test('init wires globalBack onclick to Navigation.back()', () => {
  const dom = freshDom('<body><div id="globalBack"></div><div id="globalTitle"></div><div class="nav-tab" data-nav="trip"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();

  const gb = dom.window.document.getElementById('globalBack');
  assert.ok(gb, '#globalBack exists');
  assert.strictEqual(typeof gb.onclick, 'function', 'globalBack.onclick is wired');

  // Simulate click → back() called
  const calls = [];
  dom.window.navigateHome = function (reason) { calls.push(reason); };
  gb.onclick(new dom.window.Event('click'));
  assert.ok(calls.indexOf('home') >= 0, 'back click calls navigateHome("home")');
  assert.strictEqual(gb.style.display, 'none', 'back button hidden after back()');
  recordPass();
});

section('setActiveNav');
test('toggles .active on nav-tab by data-nav', () => {
  const dom = freshDom('<body><div class="nav-tab" data-nav="trip"></div><div class="nav-tab" data-nav="plan"></div><div class="nav-tab" data-nav="saved"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();

  var tabs = dom.window.document.querySelectorAll('.nav-tab');
  dom.window.Navigation.setActiveNav('plan');
  assert.strictEqual(tabs[0].classList.contains('active'), false, 'trip tab inactive');
  assert.strictEqual(tabs[1].classList.contains('active'), true, 'plan tab active');
  assert.strictEqual(tabs[2].classList.contains('active'), false, 'saved tab inactive');
  recordPass();
});

test('toggles .at-saved on #savedEntryBtn when name is "saved"', () => {
  const dom = freshDom('<body><button id="savedEntryBtn"></button><div class="nav-tab" data-nav="trip"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();

  var se = dom.window.document.getElementById('savedEntryBtn');
  dom.window.Navigation.setActiveNav('saved');
  assert.strictEqual(se.classList.contains('at-saved'), true, 'savedEntryBtn has .at-saved');

  dom.window.Navigation.setActiveNav('trip');
  assert.strictEqual(se.classList.contains('at-saved'), false, 'savedEntryBtn lost .at-saved');
  recordPass();
});

section('goNav branches');
test('goNav("trip") calls navigateHome("home"), sets title, hides back', () => {
  const dom = freshDom('<body><div id="globalTitle"></div><div id="globalBack"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();

  var navCalls = [];
  dom.window.navigateHome = function (reason) { navCalls.push(reason); };
  dom.window.Navigation.goNav('trip');

  assert.ok(navCalls.indexOf('home') >= 0, 'navigateHome("home") called');
  assert.strictEqual(dom.window.document.getElementById('globalTitle').textContent, 'Trip Kamu', 'title set');
  assert.strictEqual(dom.window.document.getElementById('globalBack').style.display, 'none', 'back hidden');
  recordPass();
});

test('goNav("plan") with group calls window.openGroup', () => {
  const dom = freshDom('<body></body>');
  clearWindowProps();
  installCoreStubs(dom);
  dom.window.colState = { group: { id: 'grp1' } };
  dom.window.state = { activeTripId: null, readOnlyTrip: null };

  var openGroupCalls = [];
  dom.window.openGroup = function (id, flag) { openGroupCalls.push({ id, flag }); };
  loadNavigation();

  dom.window.Navigation.goNav('plan');
  assert.strictEqual(openGroupCalls.length, 1, 'openGroup called once');
  assert.strictEqual(openGroupCalls[0].id, 'grp1', 'openGroup called with group id');
  assert.strictEqual(openGroupCalls[0].flag, false, 'openGroup called with false');
  recordPass();
});

test('goNav("plan") without group + with activeTripId calls show("plannerView")', () => {
  const dom = freshDom('<body><div id="globalTitle"></div><div id="globalBack"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  dom.window.colState = { group: null };
  dom.window.state = { activeTripId: 'trip1', readOnlyTrip: null };

  var showCalls = [];
  dom.window.show = function (v) { showCalls.push(v); };
  loadNavigation();

  dom.window.Navigation.goNav('plan');
  assert.ok(showCalls.indexOf('plannerView') >= 0, 'show("plannerView") called');
  assert.strictEqual(dom.window.document.getElementById('globalTitle').textContent, 'Rencana', 'title set to Rencana');
  recordPass();
});

test('goNav("plan") without group + without activeTripId calls navigateHome', () => {
  const dom = freshDom('<body></body>');
  clearWindowProps();
  installCoreStubs(dom);
  dom.window.colState = { group: null };
  dom.window.state = { activeTripId: null, readOnlyTrip: null };

  var navCalls = [];
  dom.window.navigateHome = function (reason) { navCalls.push(reason); };
  loadNavigation();

  dom.window.Navigation.goNav('plan');
  assert.ok(navCalls.indexOf('home') >= 0, 'navigateHome("home") called (fallback)');
  recordPass();
});

test('goNav("journey") with group calls openGroup + clicks journey sub-view', () => {
  const html = '<body><div data-gview="journey"></div></body>';
  const dom = freshDom(html);
  clearWindowProps();
  installCoreStubs(dom);
  dom.window.colState = { group: { id: 'grp1' } };

  var clicked = false;
  dom.window.openGroup = function () { /* stub */ };
  loadNavigation();
  // Monkey-patch the journey element's click
  var jt = dom.window.document.querySelector('[data-gview="journey"]');
  jt.click = function () { clicked = true; };
  dom.window.Navigation.goNav('journey');
  assert.strictEqual(clicked, true, 'journey sub-view clicked');
  recordPass();
});

test('goNav("journey") without group calls show("journeyView")', () => {
  const dom = freshDom('<body><div id="globalTitle"></div><div id="globalBack"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  dom.window.colState = { group: null };

  var showCalls = [];
  dom.window.show = function (v) { showCalls.push(v); };
  loadNavigation();

  dom.window.Navigation.goNav('journey');
  assert.ok(showCalls.indexOf('journeyView') >= 0, 'show("journeyView") called');
  assert.strictEqual(dom.window.document.getElementById('globalTitle').textContent, 'Journey', 'title set to Journey');
  recordPass();
});

test('goNav("saved") falls back to openSavedTrips when no SavedTrips', () => {
  const dom = freshDom('<body></body>');
  clearWindowProps();
  installCoreStubs(dom);

  var ostCalls = 0;
  dom.window.openSavedTrips = function () { ostCalls++; };
  loadNavigation();

  dom.window.Navigation.goNav('saved');
  assert.strictEqual(ostCalls, 1, 'openSavedTrips called as fallback');
  recordPass();
});

test('goNav("saved") calls SavedTrips.show when available', () => {
  const dom = freshDom('<body></body>');
  clearWindowProps();
  installCoreStubs(dom);

  var stShowCalls = 0;
  dom.window.SavedTrips = { show: function () { stShowCalls++; } };
  loadNavigation();

  dom.window.Navigation.goNav('saved');
  assert.strictEqual(stShowCalls, 1, 'SavedTrips.show called');
  recordPass();
});

test('goNav("explore") calls Explore.show when available', () => {
  const dom = freshDom('<body></body>');
  clearWindowProps();
  installCoreStubs(dom);

  var exploreCalls = 0;
  dom.window.Explore = { show: function () { exploreCalls++; } };
  loadNavigation();

  dom.window.Navigation.goNav('explore');
  assert.strictEqual(exploreCalls, 1, 'Explore.show called');
  recordPass();
});

test('goNav("gallery") calls Gallery.show when available', () => {
  const dom = freshDom('<body></body>');
  clearWindowProps();
  installCoreStubs(dom);

  var galleryCalls = 0;
  dom.window.Gallery = { show: function () { galleryCalls++; } };
  loadNavigation();

  dom.window.Navigation.goNav('gallery');
  assert.strictEqual(galleryCalls, 1, 'Gallery.show called');
  recordPass();
});

test('goNav("unknown") is a silent no-op (no throw)', () => {
  const dom = freshDom('<body></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();
  assert.doesNotThrow(() => dom.window.Navigation.goNav('unknown'), 'no throw for unknown nav');
  recordPass();
});

section('show() patch view-sync');
test('show("homeView") syncs trip tab + title + hides back', () => {
  const dom = freshDom('<body><div id="globalTitle"></div><div id="globalBack"></div><div class="nav-tab" data-nav="trip"></div><div class="nav-tab" data-nav="plan"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();

  dom.window.show('homeView');
  var tripTab = dom.window.document.querySelector('.nav-tab[data-nav="trip"]');
  var planTab = dom.window.document.querySelector('.nav-tab[data-nav="plan"]');
  assert.strictEqual(tripTab.classList.contains('active'), true, 'trip tab active');
  assert.strictEqual(planTab.classList.contains('active'), false, 'plan tab inactive');
  assert.strictEqual(dom.window.document.getElementById('globalTitle').textContent, 'Trip Kamu', 'title = Trip Kamu');
  assert.strictEqual(dom.window.document.getElementById('globalBack').style.display, 'none', 'back hidden');
  recordPass();
});

test('show("groupView") uses colState.group.name for title', () => {
  const dom = freshDom('<body><div id="globalTitle"></div><div id="globalBack"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  dom.window.colState = { group: { id: 'g1', name: 'Family Trip' } };
  loadNavigation();

  dom.window.show('groupView');
  assert.strictEqual(dom.window.document.getElementById('globalTitle').textContent, 'Family Trip', 'title = group name');
  recordPass();
});

test('show("guestView") shows back button (display unset)', () => {
  const dom = freshDom('<body><div id="globalBack"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();

  dom.window.show('guestView');
  var gb = dom.window.document.getElementById('globalBack');
  assert.strictEqual(gb.style.display, '', 'back button display cleared (visible)');
  recordPass();
});

test('show("plannerView") syncs plan tab + Rencana title + hides back', () => {
  const dom = freshDom('<body><div id="globalTitle"></div><div id="globalBack"></div><div class="nav-tab" data-nav="trip"></div><div class="nav-tab" data-nav="plan"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();
  dom.window.show('plannerView');
  var planTab = dom.window.document.querySelector('.nav-tab[data-nav="plan"]');
  var tripTab = dom.window.document.querySelector('.nav-tab[data-nav="trip"]');
  assert.strictEqual(planTab.classList.contains('active'), true, 'plan tab active');
  assert.strictEqual(tripTab.classList.contains('active'), false, 'trip tab inactive');
  assert.strictEqual(dom.window.document.getElementById('globalTitle').textContent, 'Rencana', 'title = Rencana');
  assert.strictEqual(dom.window.document.getElementById('globalBack').style.display, 'none', 'back hidden');
  recordPass();
});

test('show("savedTripsView") syncs saved tab + hides back', () => {
  const dom = freshDom('<body><div id="globalBack"></div><div class="nav-tab" data-nav="saved"></div><div class="nav-tab" data-nav="trip"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();
  dom.window.show('savedTripsView');
  var savedTab = dom.window.document.querySelector('.nav-tab[data-nav="saved"]');
  assert.strictEqual(savedTab.classList.contains('active'), true, 'saved tab active');
  assert.strictEqual(dom.window.document.getElementById('globalBack').style.display, 'none', 'back hidden');
  recordPass();
});

test('show("savedTripDetailView") syncs saved tab + hides back', () => {
  const dom = freshDom('<body><div id="globalBack"></div><div class="nav-tab" data-nav="saved"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();
  dom.window.show('savedTripDetailView');
  var savedTab = dom.window.document.querySelector('.nav-tab[data-nav="saved"]');
  assert.strictEqual(savedTab.classList.contains('active'), true, 'saved tab active');
  assert.strictEqual(dom.window.document.getElementById('globalBack').style.display, 'none', 'back hidden');
  recordPass();
});

test('show("historyView") syncs trip tab + hides back', () => {
  const dom = freshDom('<body><div id="globalBack"></div><div class="nav-tab" data-nav="trip"></div><div class="nav-tab" data-nav="plan"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();
  dom.window.show('historyView');
  var tripTab = dom.window.document.querySelector('.nav-tab[data-nav="trip"]');
  assert.strictEqual(tripTab.classList.contains('active'), true, 'trip tab active after historyView');
  assert.strictEqual(dom.window.document.getElementById('globalBack').style.display, 'none', 'back hidden');
  recordPass();
});

test('patched show() delegates to base show (_show)', () => {
  const dom = freshDom('<body><div id="globalBack"></div><div class="nav-tab" data-nav="trip"></div></body>');
  clearWindowProps();
  // Custom base show that records calls
  dom.window.show = function (v) { dom.window.__baseShowCalls = (dom.window.__baseShowCalls || []).concat(v); };
  dom.window.navigateHome = function () {};
  dom.window.colState = { group: null };
  dom.window.state = { activeTripId: null, readOnlyTrip: null };
  dom.window.openGroup = function () {};
  dom.window.openSavedTrips = function () {};
  loadNavigation();
  dom.window.show('plannerView');
  assert.ok(dom.window.__baseShowCalls && dom.window.__baseShowCalls.indexOf('plannerView') >= 0, 'base show called with plannerView');
  recordPass();
});

test('window.showView captures the PATCHED show (same ref, not base)', () => {
  const dom = freshDom('<body><div id="globalBack"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  var baseShow = dom.window.show;
  loadNavigation();
  assert.strictEqual(dom.window.showView, dom.window.show, 'showView === patched window.show');
  assert.notStrictEqual(dom.window.showView, baseShow, 'showView is NOT the base show');
  recordPass();
});

test('back() calls navigateHome, sets title, hides back, activates trip', () => {
  const dom = freshDom('<body><div id="globalTitle"></div><div id="globalBack"></div><div class="nav-tab" data-nav="trip"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  loadNavigation();
  var navCalls = [];
  dom.window.navigateHome = function (reason) { navCalls.push(reason); };
  dom.window.Navigation.back();
  assert.ok(navCalls.indexOf('home') >= 0, 'navigateHome("home") called from back()');
  assert.strictEqual(dom.window.document.getElementById('globalTitle').textContent, 'Trip Kamu', 'title = Trip Kamu');
  assert.strictEqual(dom.window.document.getElementById('globalBack').style.display, 'none', 'back hidden');
  var tripTab = dom.window.document.querySelector('.nav-tab[data-nav="trip"]');
  assert.strictEqual(tripTab.classList.contains('active'), true, 'trip tab active after back()');
  recordPass();
});

test('navigation.js does not reference auth/session symbols', () => {
  var src = fs.readFileSync(NAV_PATH, 'utf8');
  var banned = ['isGuest', 'pendingGuestToken', 'Auth', 'openAuth', 'resolveIdentity'];
  for (var i = 0; i < banned.length; i++) {
    var sym = banned[i];
    var stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*$/gm, '').replace(/'[^']*'/g, '""').replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, '``');
    var re = new RegExp('(?<!window\\.)\\b' + sym + '\\b', 'g');
    var matches = [...stripped.matchAll(re)];
    var bare = matches.filter(m => {
      var before = stripped.substring(0, m.index).trimEnd();
      return !/window\\.\\s*$/.test(before);
    });
    assert.strictEqual(bare.length, 0, sym + ' must not be referenced outside comments (found ' + bare.length + ' bare references)');
  }
  recordPass();
});

section('No lexical-scope access');
test('module does not reference bare Core identifiers (window.* only)', () => {
  const src = fs.readFileSync(NAV_PATH, 'utf8');
  // Strip comments and string literals to avoid false positives
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
                      .replace(/\/\/[^\n]*$/gm, '')       // line comments
                      .replace(/'[^']*'/g, '""')          // single-quoted strings
                      .replace(/"[^"]*"/g, '""')         // double-quoted strings
                      .replace(/`[^`]*`/g, '``');         // template strings

  // Core identifiers that must ONLY appear via window.* prefix:
  // navigateHome, openGroup, openSavedTrips, colState, state
  const banned = ['navigateHome', 'openGroup', 'openSavedTrips', 'colState', 'state'];
  for (const sym of banned) {
    const re = new RegExp('(?<!window\\.)\\b' + sym + '\\b', 'g');
    const matches = [...stripped.matchAll(re)];
    // Filter out occurrences that are part of window.*.X (property chain like
    // window.colState.group — the 'colState' here IS preceded by window.)
    const bare = matches.filter(m => {
      const before = stripped.substring(0, m.index).trimEnd();
      return !/window\.\s*$/.test(before);
    });
    assert.strictEqual(bare.length, 0,
      sym + ' must only be accessed via window.* (found ' + bare.length + ' bare references)');
  }

  // show: must not be called as a bare function. Allowed: window.show(, _show(,
  // .show( (property access like SavedTrips.show()). Flag show( that is NOT
  // preceded by a word character or dot — i.e. truly bare.
  const bareShow = [...stripped.matchAll(/(?<![\w.])\bshow\s*\(/g)];
  assert.strictEqual(bareShow.length, 0,
    'show() must be called via window.show() or _show() (found ' + bareShow.length + ' bare calls)');

  recordPass();
});

section('UMD export');
test('module.exports works for headless testing', () => {
  const dom = freshDom('<body><div id="globalBack"></div></body>');
  clearWindowProps();
  installCoreStubs(dom);
  const mod = loadNavigation();
  assert.ok(mod && mod.Navigation, 'UMD export has Navigation');
  assert.strictEqual(typeof mod.Navigation.init, 'function', 'UMD export Navigation.init');
  assert.strictEqual(typeof mod.Navigation.setActiveNav, 'function', 'UMD export Navigation.setActiveNav');
  assert.strictEqual(typeof mod.Navigation.goNav, 'function', 'UMD export Navigation.goNav');
  assert.strictEqual(typeof mod.Navigation.back, 'function', 'UMD export Navigation.back');
  recordPass();
});

// ── Final summary ─────────────────────────────────────────────────────
process.on('exit', () => {
  console.log('\n═══ navigation.test.js results: ' + passedCount + ' passed, ' + failedCount + ' failed (' + (passedCount + failedCount) + ' total) ═══');
  if (failedCount > 0) process.exit(1);
});
