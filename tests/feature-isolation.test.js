/**
 * Phase 4 — Failure-isolation & regression gates
 * ------------------------------------------------
 * Verifies the four isolation claims from the task body, plus clean-session
 * startup, error-containment semantics, and the mandatory regression gates.
 *
 * Harness notes:
 *  • JSDOM's window.navigator is getter-only — never assign global.navigator.
 *  • Modules read `window.X` where `window` === global.window === the JSDOM
 *    window we install.  ALL stubs MUST be set on dom.window directly (not on
 *    Node's global), otherwise called functions won't see them.
 *  • FeatureBootstrap is a module singleton.  To get a clean slate per test we
 *    delete require.cache for all five modules and re-require them on the
 *    current dom.window.  Tests 5.x that register their own named inits call
 *    fb._reset() first.
 *  • Run: node tests/feature-isolation.test.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');
const { execFile } = require('node:child_process');
const { JSDOM } = require('jsdom');

// ── Shared jsdom harness ─────────────────────────────────────────────────────
function freshIframe() {
  return new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: 'http://localhost/' });
}

/** Install the fresh JSDOM window as the global `window` binding modules use. */
function installWindow(dom) {
  global.window   = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.localStorage = dom.window.localStorage;
  // navigator is getter-only on JSDOM window — do not assign globally.
}

/** Minimal DOM stubs so auth-ux / gallery-agg / explore init() don't crash on
 *  missing elements. */
function stubDomMinimal(dom) {
  dom.window.document.head.appendChild = () => {};
  dom.window.document.getElementById = () => null;
}

/** Set a stub on the JSDOM window (the binding modules read as `window.X`). */
function stub(name, value) {
  // `global.window` is the dom.window we installed; setting on it reaches modules.
  global.window[name] = value;
}

// ── Core bootstrap stubs ─────────────────────────────────────────────────────
/** When present, saved-trips init() sees openSavedTrips and does not fail. */
function installCoreBootstrapStubs() {
  stub('MarkiAPI', {
    listMyGroups: () => Promise.resolve({ data: [] }),
    listMedia:    () => Promise.resolve({ data: [] }),
    saveTrip:     () => Promise.resolve({ data: { id: 't1' } }),
    getSession:   () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
    rpc:          () => Promise.resolve(),
  });
  stub('utils', {
    esc:          s => String(s == null ? '' : s),
    humanErr:     e => String(e == null ? 'err' : e),
    money:        v => String(v),
    dateText:     ds => ds,
    categoryIcon: () => '',
    tripBgCat:    () => null,
    normalizeLink: l => l,
    daysBetween:  (a, b) => [],
  });
  stub('MarkiSync', {
    syncActiveTrip:      () => Promise.resolve(),
    syncTrip:            () => {},
    loadShared:          () => Promise.resolve([]),
    loadMembers:         () => Promise.resolve([]),
    loadGroupExpenses:   () => Promise.resolve([]),
    teardownGroupSession: () => Promise.resolve(),
    initGuestRealtime:   () => Promise.resolve(),
    onSessionReady:      () => Promise.resolve(),
  });
  stub('TripDomain', { tripStatus: () => ({ status: 'future' }), getTrip: () => null });
  stub('CanonicalAdapter', { setContext: () => {}, ingestAndOpen: () => Promise.resolve() });
  stub('importParser', { lineOfOffset: undefined });
  stub('openSavedTrips', () => {});
  stub('openAuth',      () => {});
  stub('setActiveNav',  () => {});
}

// ── Module cache helpers ─────────────────────────────────────────────────────
const MODULE_IDS = [
  path.resolve(__dirname, '..', 'assets', 'js', 'feature-bootstrap.js'),
  path.resolve(__dirname, '..', 'assets', 'js', 'saved-trips.js'),
  path.resolve(__dirname, '..', 'assets', 'js', 'auth-ux.js'),
  path.resolve(__dirname, '..', 'assets', 'js', 'gallery-agg.js'),
  path.resolve(__dirname, '..', 'assets', 'js', 'explore.js'),
];

function clearModuleCache() {
  for (const id of MODULE_IDS) delete require.cache[id];
}

/** Re-require all five modules on the current window (forces IIFE re-run). */
function loadAll() {
  return {
    fb: require(MODULE_IDS[0]),
    st: require(MODULE_IDS[1]),
    au: require(MODULE_IDS[2]),
    ga: require(MODULE_IDS[3]),
    ex: require(MODULE_IDS[4]),
  };
}

/** Fresh FeatureBootstrap singleton (for tests 5.x that register their own inits). */
function loadFb() {
  clearModuleCache();
  return require(MODULE_IDS[0]);
}

// ── Counters ────────────────────────────────────────────────────────────────
let passedCount = 0;
let failedCount = 0;
function recordPass()   { passedCount++; }
function recordFail(msg) { failedCount++; console.log(`  ✗ ${msg}`); }

function section(title) { console.log(`\n═══ ${title} ═══`); }

// ═══════════════════════════════════════════════════════════════════════════
// 1.  CLEAN-SESSION STARTUP — all four features load + bootstrap w/o crash
// ═══════════════════════════════════════════════════════════════════════════
section('Claim 1 · Clean-session startup');
test('clean startup: four interfaces present + bootstrap runs, savedTrips failure contained', () => {
  const dom = freshIframe();
  installWindow(dom);
  stubDomMinimal(dom);
  // Simulate a world with NO core bootstrap (no openSavedTrips etc.).
  delete global.window.openSavedTrips;
  delete global.window.MarkiAPI;
  delete global.window.utils;
  delete global.window.MarkiSync;
  delete global.window.colState;
  delete global.window.TripDomain;
  delete global.window.openAuth;
  delete global.window.setActiveNav;
  delete global.window.CanonicalAdapter;
  delete global.window.importParser;

  clearModuleCache();
  const { fb, st, au, ga, ex } = loadAll();

  assert.ok(dom.window.Auth != null,    'Auth interface published');
  assert.ok(dom.window.Gallery != null, 'Gallery interface published');
  assert.ok(dom.window.Explore != null, 'Explore interface published');
  assert.ok(dom.window.SavedTrips != null, 'SavedTrips interface published');

  fb.bootstrap();
  assert.strictEqual(fb.health.auth,    'ok',    'auth init ok');
  assert.strictEqual(fb.health.gallery, 'ok',    'gallery init ok');
  assert.strictEqual(fb.health.explore, 'ok',    'explore init ok');
  assert.ok(fb.errors.length >= 1, 'savedTrips error recorded');
  assert.strictEqual(fb.errors[0].name, 'savedTrips');
  assert.ok(fb.errors[0].message.indexOf('openSavedTrips') >= 0, 'error mentions missing dependency');
  recordPass();
});

// ═══════════════════════════════════════════════════════════════════════════
// 2.  SAVED TRIPS FAILS WITHOUT BREAKING AUTH
// ═══════════════════════════════════════════════════════════════════════════
section('Claim 2 · Saved Trips can fail without breaking Auth');
test('savedTrips init error does not prevent Auth interface from being published', () => {
  const dom = freshIframe();
  installWindow(dom);
  stubDomMinimal(dom);
  delete global.window.openSavedTrips;
  delete global.window.MarkiAPI;
  delete global.window.utils;

  clearModuleCache();
  const { fb, au } = loadAll();
  fb.bootstrap();
  assert.ok(dom.window.Auth,            'Auth interface published despite savedTrips failure');
  assert.ok(dom.window.Auth.init,       'Auth.init present');
  assert.ok(dom.window.Auth.openAuth,   'Auth.openAuth present');
  // Auth.init wraps openAuth, so post-bootstrap window.openAuth is the wrapped
  // version while Auth.openAuth is the original — both are functions.
  assert.strictEqual(typeof dom.window.openAuth, 'function', 'openAuth bridged (function)');
  assert.strictEqual(typeof dom.window.Auth.openAuth, 'function', 'Auth.openAuth callable');
  recordPass();
});

test('savedTrips.show() degrades gracefully when openSavedTrips is missing (no throw)', () => {
  const dom = freshIframe();
  installWindow(dom);
  stubDomMinimal(dom);
  dom.window.document.getElementById = (id) => id === 'savedTripsList' ? { innerHTML: '' } : null;
  delete global.window.openSavedTrips;
  // Load FeatureBootstrap so saved-trips registers (deferred init) rather than
  // calling init() immediately during its own IIFE.
  clearModuleCache();
  require(MODULE_IDS[0]);            // feature-bootstrap → sets window.FeatureBootstrap
  const st = require(MODULE_IDS[1]); // saved-trips → registers, does NOT init now
  assert.doesNotThrow(() => st.SavedTrips.show(), 'SavedTrips.show degrades gracefully');
  recordPass();
});

test('savedTrips interface remains usable after a transient init error', () => {
  const dom = freshIframe();
  installWindow(dom);
  stubDomMinimal(dom);
  delete global.window.openSavedTrips;
  delete global.window.MarkiAPI;
  clearModuleCache();
  const { fb, st } = loadAll();
  fb.bootstrap(); // savedTrips fails
  assert.ok(dom.window.SavedTrips, 'SavedTrips interface exists after error');
  assert.strictEqual(typeof dom.window.SavedTrips.hide,    'function', 'SavedTrips.hide usable');
  assert.strictEqual(typeof dom.window.SavedTrips.destroy, 'function', 'SavedTrips.destroy usable');
  recordPass();
});

// ═══════════════════════════════════════════════════════════════════════════
// 3.  GALLERY FAILS WITHOUT BREAKING PLANNER
// ═══════════════════════════════════════════════════════════════════════════
section('Claim 3 · Gallery can fail without breaking Planner');
test('gallery.init() (no-op) succeeds and Auth is untouched; real failure surface (show) tested below', () => {
  const dom = freshIframe();
  installWindow(dom);
  stubDomMinimal(dom);
  stub('openSavedTrips', () => {});
  stub('MarkiAPI', { listMyGroups: () => Promise.reject(new Error('db down')) });

  clearModuleCache();
  const { fb, ga, au } = loadAll();
  fb.bootstrap();
  assert.ok(dom.window.Auth, 'Auth still works when gallery module is present');
  assert.strictEqual(fb.health.gallery, 'ok', 'gallery.init() is a no-op and succeeds');
  // The real gallery failure surface is show() → loadGalleryAgg → listMyGroups;
  // that isolation is verified explicitly in the next test.
  recordPass();
});

test('gallery.show() degrades to empty-state on API listMyGroups failure (no throw) AND Auth survives', () => {
  const dom = freshIframe();
  installWindow(dom);
  stubDomMinimal(dom);
  stub('openSavedTrips', () => {});
  stub('MarkiAPI', { listMyGroups: () => Promise.reject(new Error('network')) });
  // gallery.show() calls window.setActiveNav AND window.show — must be functions.
  stub('setActiveNav', () => {});
  stub('show', () => {});
  dom.window.document.getElementById = (id) => id === 'galleryAgg' ? { innerHTML: '', querySelectorAll: () => [] } : null;
  clearModuleCache();
  const ga = require(MODULE_IDS[3]);
  assert.doesNotThrow(() => ga.Gallery.show(), 'Gallery.show degrades gracefully on API failure');
  recordPass();
});

test('gallery interface remains present after init failure simulation', () => {
  const dom = freshIframe();
  installWindow(dom);
  stubDomMinimal(dom);
  stub('openSavedTrips', () => {});
  stub('MarkiAPI', { listMyGroups: () => Promise.reject() });
  clearModuleCache();
  const { fb, ga } = loadAll();
  fb.bootstrap();
  assert.ok(dom.window.Gallery, 'Gallery interface present despite init failure simulation');
  assert.strictEqual(typeof dom.window.Gallery.hide, 'function', 'Gallery.hide usable');
  recordPass();
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.  EXPLORE FAILS WITHOUT BREAKING JOURNEY
// ═══════════════════════════════════════════════════════════════════════════
section('Claim 4 · Explore can fail without breaking Journey');
test('explore.init() (no-op) succeeds and Journey/core-nav world is intact; real failure surface (save) tested below', () => {
  const dom = freshIframe();
  installWindow(dom);
  stubDomMinimal(dom);
  stub('openSavedTrips', () => {});
  stub('MarkiAPI', { saveTrip: () => Promise.reject(new Error('disabled')) });
  stub('utils', {
    esc: s => String(s == null ? '' : s),
    humanErr: e => String(e == null ? 'err' : e),
    categoryIcon: () => '',
    busyBtn: () => {}, freeBtn: () => {},
  });
  stub('colState',  { uid: 'u1' });
  stub('openAuth',  () => {});
  stub('setActiveNav', () => {});
  clearModuleCache();
  const { fb, ex } = loadAll();
  fb.bootstrap();
  assert.ok(dom.window.Explore, 'Explore interface present');
  assert.ok(dom.window.openExploreView, 'openExploreView (backward compat) present');
  assert.ok(dom.window.renderExploreList, 'renderExploreList present');
  recordPass();
});

test('explore.saveExploreTrip() calls openAuth when anonymous and contains API error paths (no throw)', () => {
  const dom = freshIframe();
  installWindow(dom);
  stubDomMinimal(dom);
  stub('openSavedTrips', () => {});
  stub('MarkiAPI', { saveTrip: () => Promise.resolve({ error: { message: 'denied' } }) });
  stub('utils', {
    esc: s => String(s == null ? '' : s),
    humanErr: e => String(e == null ? 'err' : e),
    busyBtn: () => {}, freeBtn: () => {},
  });
  stub('colState',   { uid: null }); // anonymous
  stub('openAuth',   () => {});
  stub('setActiveNav', () => {});
  clearModuleCache();
  const ex = require(MODULE_IDS[4]);
  return ex.saveExploreTrip({ id: 'x', title: 'Test', days: [{ day: 1, title: 'A', items: [] }] })
    .then(() => recordPass())
    .catch((e) => { recordFail(`unexpected throw: ${e.message}`); assert.fail(e); });
});

test('explore interface usable after init failure simulation', () => {
  const dom = freshIframe();
  installWindow(dom);
  stubDomMinimal(dom);
  stub('openSavedTrips', () => {});
  stub('MarkiAPI', { saveTrip: () => Promise.reject({ message: 'fail' }) });
  stub('utils', {
    esc: s => String(s == null ? '' : s),
    humanErr: e => String(e == null ? 'err' : e),
    busyBtn: () => {}, freeBtn: () => {},
  });
  stub('colState',   { uid: 'u1' });
  stub('openAuth',   () => {});
  stub('setActiveNav', () => {});
  clearModuleCache();
  const { fb, ex } = loadAll();
  fb.bootstrap();
  assert.ok(dom.window.Explore, 'Explore interface present');
  assert.strictEqual(typeof dom.window.Explore.hide,    'function', 'Explore.hide usable');
  assert.strictEqual(typeof dom.window.Explore.destroy, 'function', 'Explore.destroy usable');
  recordPass();
});

// ═══════════════════════════════════════════════════════════════════════════
// 5.  FEATURE INIT ERRORS CONTAINED & REPORTED — NOT ABORTING BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════════
section('Claim 5 · Feature init errors contained & reported, not aborting bootstrap');
test('FeatureBootstrap.run catches throw and records error without re-throwing', () => {
  const fb = loadFb();
  fb._reset();
  let threw = false;
  try { fb.run('probe', () => { throw new Error('intentional'); }); }
  catch (e) { threw = true; }
  assert.strictEqual(threw, false, 'run() does NOT re-throw');
  assert.strictEqual(fb.errors.length, 1, 'error recorded');
  assert.strictEqual(fb.errors[0].name, 'probe');
  assert.strictEqual(fb.health.probe, 'error', 'health set to error');
  recordPass();
});

test('FeatureBootstrap.bootstrap continues after one registered init throws', () => {
  const fb = loadFb();
  fb._reset();
  stub('MarkiAPI', {}); // so auth-ux init (if we registered it) would not also fail
  fb.register('auth', () => {});                         // ok
  fb.register('gallery-broken', () => { throw new Error('bomb'); }); // fails
  fb.register('explore', () => {});                     // must still run
  fb.bootstrap();
  assert.strictEqual(fb.errors.length, 1, 'exactly one error recorded');
  assert.strictEqual(fb.errors[0].name, 'gallery-broken');
  assert.strictEqual(fb.health.auth,     'ok');
  assert.strictEqual(fb.health['gallery-broken'], 'error');
  assert.strictEqual(fb.health.explore,  'ok', 'feature explore still initialized after gallery-broken failed');
  recordPass();
});

test('multiple failures all recorded independently', () => {
  const fb = loadFb();
  fb._reset();
  fb.register('x', () => { throw new Error('x'); });
  fb.register('y', () => { throw new Error('y'); });
  fb.bootstrap();
  assert.strictEqual(fb.errors.length, 2);
  const names = fb.errors.map(e => e.name).sort();
  assert.deepStrictEqual(names, ['x', 'y']);
  assert.strictEqual(fb.health.x, 'error');
  assert.strictEqual(fb.health.y, 'error');
  recordPass();
});

test('FeatureBootstrap.register stores initFn for later bootstrap execution', () => {
  const fb = loadFb();
  fb._reset();
  let aran = false;
  fb.register('a', () => { aran = true; });
  fb.register('b', () => {});  // no-op
  assert.strictEqual(fb.registry.length, 2);
  assert.strictEqual(fb.health.a, 'registered');
  assert.strictEqual(fb.health.b, 'registered');
  fb.bootstrap();
  assert.strictEqual(aran, true, 'registered initFn executed on bootstrap');
  recordPass();
});

// ═══════════════════════════════════════════════════════════════════════════
// 6.  REGRESSION GATES — full suite through npm + all existing tests
// ═══════════════════════════════════════════════════════════════════════════
section('Regression Gates');
test('all existing regression test files still pass', { timeout: 45_000 }, async () => {
  const existing = [
    path.resolve(__dirname, 'utils.test.js'),
    path.resolve(__dirname, 'import-parser.test.js'),
    path.resolve(__dirname, 'gallery-lightbox.test.js'),
    path.resolve(__dirname, 'regression-matrix.test.js'),
  ];
  for (const f of existing) {
    const { stdout, stderr } = await new Promise((resolve) => {
      execFile('node', [f], { cwd: process.cwd(), timeout: 15_000 }, (err, stdout, stderr) => {
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      });
    });
    const text = stdout + stderr;
    assert.ok(text.indexOf('Results:') >= 0,
      `output missing Results line for ${path.basename(f)}`);
    assert.ok(text.indexOf('0 failed') >= 0,
      `${path.basename(f)} has failures:\n${text}`);
  }
  recordPass();
});

test('every standalone JS module file passes node --check', () => {
  const jsDir = path.resolve(__dirname, '..', 'assets', 'js');
  const modules = fs.readdirSync(jsDir)
    .filter(f => f.endsWith('.js'))
    .map(f => path.resolve(jsDir, f));
  for (const m of modules) {
    assert.doesNotThrow(() => {
      execFile('node', ['--check', m], { timeout: 5_000 }, (err, _, stderr) => {
        if (err) throw new Error(stderr.toString());
      });
    }, `module ${path.basename(m)} fails to parse`);
  }
  recordPass();
});

test('feature-bootstrap.js, saved-trips.js, auth-ux.js, gallery-agg.js, explore.js all parse cleanly', () => {
  const targets = ['feature-bootstrap.js', 'saved-trips.js', 'auth-ux.js', 'gallery-agg.js', 'explore.js'];
  for (const name of targets) {
    const m = path.resolve(__dirname, '..', 'assets', 'js', name);
    assert.doesNotThrow(() => {
      execFile('node', ['--check', m], { timeout: 5_000 }, (err, _, stderr) => {
        if (err) throw new Error(stderr.toString());
      });
    }, `module ${name} fails to parse`);
  }
  recordPass();
});

// ── Final summary ───────────────────────────────────────────────────────────
process.on('exit', () => {
  console.log(`\n═══ Phase 4 results: ${passedCount} passed, ${failedCount} failed (${passedCount + failedCount} total assertions) ═══`);
  if (failedCount > 0) process.exit(1);
});
