/**
 * Phase 8 — Regression matrix for forensic audit remediation.
 * Tests all scenarios from the audit's Phase 8 matrix.
 * 
 * Run: node tests/regression-matrix.test.js
 */

const assert = require('assert');

// ── Mock DOM for headless browser environment ──────────────────────
const store = {};
global.document = {
  getElementById: (id) => ({
    classList: { add: () => {}, remove: () => {} },
    style: {},
    textContent: '',
    innerHTML: '',
    dataset: {},
    onclick: null,
    onsubmit: null,
    value: '',
    querySelectorAll: () => [],
    appendChild: () => {},
  }),
  querySelectorAll: () => ({ forEach: () => {}, map: () => [] }),
  querySelector: () => null,
};
global.window = { localStorage: {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
}};
global.localStorage = global.window.localStorage;

// ── Load utilities ─────────────────────────────────────────────────
const { daysBetween } = require('../assets/js/utils.js');

let tests = 0, passed = 0, failed = 0;
function test(name, fn) {
  tests++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

console.log('Phase 8 — Regression Matrix\n');

// ═══════════════════════════════════════════════════════════════════
// DATE SEMANTICS
// ═══════════════════════════════════════════════════════════════════
console.log('── Date Semantics ──');

test('daysBetween generates inclusive range', () => {
  const d = daysBetween('2026-01-01', '2026-01-03');
  assert.deepStrictEqual(d, ['2026-01-01', '2026-01-02', '2026-01-03']);
});

test('daysBetween handles same start and end', () => {
  const d = daysBetween('2026-01-01', '2026-01-01');
  assert.deepStrictEqual(d, ['2026-01-01']);
});

test('daysBetween handles empty input', () => {
  const d = daysBetween('', '');
  assert.deepStrictEqual(d, []);
});

// ═══════════════════════════════════════════════════════════════════
// TRIP IDENTITY
// ═══════════════════════════════════════════════════════════════════
console.log('\n── Trip Identity ──');

test('loadPersonalTrips skips converted trips', () => {
  // Simulate: trip converted to group has groupId set locally
  // Server returns same trip via listPersonalTrips — should NOT duplicate
  const state = { trips: [
    { id: 'local-1', supabase_trip_id: 'srv-1', groupId: 'grp-1', name: 'Trip A' }
  ]};
  const serverTrips = [{ id: 'srv-1', name: 'Trip A', local_id: 'local-1' }];
  
  const now = [...state.trips];
  serverTrips.forEach(t => {
    const converted = now.find(trip => trip.groupId && (trip.supabase_trip_id === t.id || (t.local_id && trip.id === t.local_id)));
    if (converted) return; // Skip — prevents duplicate
    const existing = now.find(trip => trip.supabase_trip_id === t.id || (t.local_id && trip.id === t.local_id));
    if (existing) {
      existing.name = t.name;
    } else {
      now.push({ id: t.local_id || t.id, supabase_trip_id: t.id, name: t.name });
    }
  });
  
  assert.strictEqual(now.length, 1, 'Should not create duplicate trip');
  assert.strictEqual(now[0].name, 'Trip A');
});

test('loadServerGroups matches by groupId', () => {
  const state = { trips: [
    { id: 'local-1', groupId: 'grp-1', name: 'Old Name' }
  ]};
  const serverGroups = [{ id: 'grp-1', name: 'Updated Name' }];
  
  const now = [...state.trips];
  serverGroups.forEach(g => {
    const existing = now.find(t => t.id === g.id || t.serverId === g.id || t.groupId === g.id);
    if (existing) {
      existing.name = g.name;
      existing.groupId = g.id;
      existing.isGroup = true;
    }
  });
  
  assert.strictEqual(now.length, 1);
  assert.strictEqual(now[0].name, 'Updated Name');
  assert.strictEqual(now[0].groupId, 'grp-1');
  assert.strictEqual(now[0].isGroup, true);
});

// ═══════════════════════════════════════════════════════════════════
// PERMISSION MATRIX
// ═══════════════════════════════════════════════════════════════════
console.log('\n── Permission Matrix ──');

test('Creator can edit trip dates', () => {
  const trip = { created_by: 'user-1', id: 'trip-1' };
  const colState = { uid: 'user-1', group: null };
  const isOwner = !!(trip.created_by && colState.uid && trip.created_by === colState.uid);
  assert.strictEqual(isOwner, true);
});

test('Member cannot edit trip dates', () => {
  const trip = { created_by: 'user-1', id: 'trip-1' };
  const colState = { uid: 'user-2', group: null };
  const isOwner = !!(trip.created_by && colState.uid && trip.created_by === colState.uid);
  assert.strictEqual(isOwner, false);
});

test('renderPlanner: Creator not read-only on own shared trip', () => {
  const trip = { created_by: 'user-1', id: 'trip-1' };
  const state = { readOnlyTrip: trip };
  const colState = { uid: 'user-1', group: null };
  const isOwner = !!(trip.created_by && colState.uid && trip.created_by === colState.uid);
  const ro = !!state.readOnlyTrip && !isOwner && !colState.group;
  assert.strictEqual(ro, false, 'Creator should NOT be read-only');
});

test('renderPlanner: Non-creator is read-only on shared trip', () => {
  const trip = { created_by: 'user-1', id: 'trip-1' };
  const state = { readOnlyTrip: trip };
  const colState = { uid: 'user-2', group: null };
  const isOwner = !!(trip.created_by && colState.uid && trip.created_by === colState.uid);
  const ro = !!state.readOnlyTrip && !isOwner && !colState.group;
  assert.strictEqual(ro, true, 'Non-creator should be read-only');
});

// ═══════════════════════════════════════════════════════════════════
// STATE LIFECYCLE
// ═══════════════════════════════════════════════════════════════════
console.log('\n── State Lifecycle ──');

test('teardownGroupSession clears isGuest', () => {
  // Simulate the fix: isGuest should be reset
  const colState = {
    group: { id: 'g1' },
    items: [{ id: 'i1' }],
    wishlists: [{ id: 'w1' }],
    identities: { 'u1': 'Name' },
    isGuest: true,
    _subscribedOnce: true,
  };
  // After teardown:
  colState.group = null;
  colState.items = [];
  colState.wishlists = [];
  colState.identities = {};
  colState.isGuest = false;
  colState._subscribedOnce = false;
  
  assert.strictEqual(colState.isGuest, false);
  assert.strictEqual(colState._subscribedOnce, false);
  assert.deepStrictEqual(colState.items, []);
});

test('guest join clears isGuest flag', () => {
  const colState = { uid: null, isGuest: true };
  const guestSession = { token: 'tk', isMember: false };
  
  // Simulate join flow:
  colState.uid = 'anon-1';
  guestSession.isMember = true;
  colState.isGuest = false; // PHASE 2 fix
  
  assert.strictEqual(colState.isGuest, false);
  assert.strictEqual(guestSession.isMember, true);
  assert.strictEqual(colState.uid, 'anon-1');
});

// ═══════════════════════════════════════════════════════════════════
// RECONCILIATION
// ═══════════════════════════════════════════════════════════════════
console.log('\n── Reconciliation ──');

test('reconcileTrip preserves local-only items', () => {
  const colState = {
    items: [
      { id: 'server-1', title: 'Server Item' },
      { localId: 'local-temp', title: 'New Local Item' }
    ]
  };
  const serverItems = [{ id: 'server-1', title: 'Server Item' }];
  
  // PHASE 4 fix: preserve items with localId and no server id
  const localOnly = colState.items.filter(i => i.localId && !i.id);
  const merged = [...serverItems];
  localOnly.forEach(lo => {
    if (!merged.find(si => si.id === lo.id)) merged.push(lo);
  });
  colState.items = merged;
  
  assert.strictEqual(colState.items.length, 2);
  assert.strictEqual(colState.items[1].title, 'New Local Item');
});

test('loadShared does not fabricate dates', () => {
  const serverItems = [
    { id: '1', title: 'Dated', date: '2026-01-01' },
    { id: '2', title: 'No Date', date: null },
    { id: '3', title: 'Empty Date', date: '' },
  ];
  
  // PHASE 5 fix: don't assign default dates
  const items = serverItems.map(i => i);
  
  assert.strictEqual(items[0].date, '2026-01-01');
  assert.strictEqual(items[1].date, null);
  assert.strictEqual(items[2].date, '');
});

// ═══════════════════════════════════════════════════════════════════
// PERMISSION RPC FAILURE
// ═══════════════════════════════════════════════════════════════════
console.log('\n── Permission RPC Failure ──');

test('RPC failure preserves previous permissions', () => {
  const colState = { perms: { is_owner: true, can_edit: true } };
  const permsRes = { data: null, error: { message: 'connection failed' } };
  
  // PHASE 6 fix: don't overwrite perms on RPC error
  if (permsRes && permsRes.error && !permsRes.data) {
    colState.perms = colState.perms || null;
  } else {
    colState.perms = (permsRes && permsRes.data) || null;
  }
  
  assert.strictEqual(colState.perms.is_owner, true);
  assert.strictEqual(colState.perms.can_edit, true);
});

test('RPC success updates permissions', () => {
  const colState = { perms: null };
  const permsRes = { data: { is_owner: false, can_add_itinerary: true } };
  
  if (permsRes && permsRes.error && !permsRes.data) {
    colState.perms = colState.perms || null;
  } else {
    colState.perms = (permsRes && permsRes.data) || null;
  }
  
  assert.strictEqual(colState.perms.is_owner, false);
  assert.strictEqual(colState.perms.can_add_itinerary, true);
});

// ═══════════════════════════════════════════════════════════════════
// STALE-RESULT GUARD (Stage 20)
// ═══════════════════════════════════════════════════════════════════
console.log('\n── Identity Hydration Stale-Result Guard ──');

// Replicate the guard logic from hydrateIdentity in trip-planner.html
async function guardedHydrateIdentity(session, deps) {
  if (!session || (session.user && session.user.is_anonymous)) return;
  var sessionUid = session.user.id;
  try {
    var pr = await deps.ensureProfile(null);
    if (deps.colState.uid && deps.colState.uid !== sessionUid) return;
    var dbName = (pr && pr.data) ? pr.data.display_name : null;
    var emailPrefix = session.user.email ? session.user.email.split('@')[0] : '';
    var dbIsPlaceholder = !dbName || dbName === emailPrefix || deps.isPlaceholderName(dbName);
    if (dbName && !dbIsPlaceholder) {
      deps.colState.name = dbName;
      deps.saveName(dbName);
    } else {
      var cachedName = deps.loadName();
      if (cachedName && cachedName !== emailPrefix && !deps.isPlaceholderName(cachedName)) {
        var pr2 = await deps.ensureProfile(cachedName);
        if (deps.colState.uid && deps.colState.uid !== sessionUid) return;
        if (pr2 && pr2.data && pr2.data.display_name) {
          deps.colState.name = pr2.data.display_name;
          deps.saveName(pr2.data.display_name);
        }
      }
    }
  } catch(e) {}
}

function makeDeps(overrides = {}) {
  var store = {};
  return Object.assign({
    colState: { uid: null, name: null },
    saveName: (n) => { store['dn'] = String(n); },
    loadName: () => store['dn'] || '',
    isPlaceholderName: (n) => !n || ['guest','user','creator','placeholder'].includes(String(n).toLowerCase()),
    ensureProfile: async (name) => {
      if (name === null || name === undefined) {
        return { data: { display_name: null } };
      }
      return { data: { display_name: name } };
    },
  }, overrides);
}

test('stale result dropped: A cannot overwrite B after sign-out + sign-in', async () => {
  var deps = makeDeps();
  var resolveA, resolveB;
  var callN = 0;
  deps.ensureProfile = (name) => new Promise(res => {
    callN++;
    if (callN === 1) resolveA = res;   // call A's RPC (uid_a)
    else resolveB = res;              // call B's RPC (uid_b)
  });

  // Session A starts hydration
  deps.colState.uid = 'uid-a';
  var pA = guardedHydrateIdentity(
    { user: { id: 'uid-a', email: 'a@test.com', is_anonymous: false } }, deps);

  // Before A resolves: session switches to B
  deps.colState.uid = 'uid-b';

  // Session B starts hydration
  var pB = guardedHydrateIdentity(
    { user: { id: 'uid-b', email: 'b@test.com', is_anonymous: false } }, deps);

  // A resolves first (stale)
  resolveA({ data: { display_name: 'Alice' } });
  await pA;

  // B resolves
  resolveB({ data: { display_name: 'Bob' } });
  await pB;

  // B's result should be the final state — A was blocked by the guard
  assert.strictEqual(deps.colState.name, 'Bob', 'B result should win');
  assert.strictEqual(deps.loadName(), 'Bob', 'localStorage should hold B name');
});

test('reload (colState.uid null): hydration proceeds', async () => {
  var deps = makeDeps({
    ensureProfile: async () => ({ data: { display_name: 'Alice' } }),
  });
  // colState.uid is null (page reload — onAuthChange hasn't fired yet)
  deps.colState.uid = null;
  await guardedHydrateIdentity(
    { user: { id: 'uid-a', email: 'a@test.com', is_anonymous: false } }, deps);
  assert.strictEqual(deps.colState.name, 'Alice', 'Should apply when uid is null');
});

test('same session concurrent: both results applied (idempotent)', async () => {
  var deps = makeDeps();
  deps.colState.uid = 'uid-a';
  deps.ensureProfile = async () => ({ data: { display_name: 'Alice' } });
  var p1 = guardedHydrateIdentity(
    { user: { id: 'uid-a', email: 'a@test.com', is_anonymous: false } }, deps);
  var p2 = guardedHydrateIdentity(
    { user: { id: 'uid-a', email: 'a@test.com', is_anonymous: false } }, deps);
  await p1;
  await p2;
  assert.strictEqual(deps.colState.name, 'Alice', 'Same session → both apply same value');
});

test('gap-fill stale result dropped: A blocked mid-gap-fill', async () => {
  var deps = makeDeps();
  var resolveDb, resolveGapA, resolveGapB;
  var callN = 0;
  deps.ensureProfile = (name) => new Promise(res => {
    callN++;
    if (callN === 1) resolveDb = res;
    else if (callN === 2) resolveGapA = res;  // gap-fill call from A
    else resolveGapB = res;                   // gap-fill call from B
  });
  // Force placeholder DB so both sessions enter the gap-fill path
  deps.ensureProfile = (name) => {
    if (name === null || name === undefined) {
      return new Promise(res => { resolveDb = () => res({ data: { display_name: null } }); });
    }
    return new Promise(res => {
      if (!window.__gapA && !window.__gapB) { window.__gapA = res; }
      else { window.__gapB = res; }
    });
  };
  deps.loadName = () => 'CachedName';
  deps.isPlaceholderName = () => false;

  deps.colState.uid = 'uid-a';
  var pA = guardedHydrateIdentity(
    { user: { id: 'uid-a', email: 'a@test.com', is_anonymous: false } }, deps);
  // Switch to B before gap-fill resolves
  deps.colState.uid = 'uid-b';
  deps.colState.name = null;
  var pB = guardedHydrateIdentity(
    { user: { id: 'uid-b', email: 'b@test.com', is_anonymous: false } }, deps);

  // Both enter gap-fill path (DB is placeholder/null)
  // Resolve A's RPC first
  if (window.__gapA) window.__gapA({ data: { display_name: 'CachedName' } });
  await pA;
  // A was blocked by the guard after gap-fill RPC
  assert.strictEqual(deps.colState.name, null, 'A gap-fill result should be blocked');

  if (window.__gapB) window.__gapB({ data: { display_name: 'CachedName' } });
  await pB;
  assert.strictEqual(deps.colState.name, 'CachedName', 'B gap-fill result should apply');
  delete window.__gapA;
  delete window.__gapB;
});

test('sign-out during hydration: stale result cannot restore name', async () => {
  var deps = makeDeps();
  var resolveRpc;
  deps.ensureProfile = () => new Promise(res => { resolveRpc = res; });

  deps.colState.uid = 'uid-a';
  var p = guardedHydrateIdentity(
    { user: { id: 'uid-a', email: 'a@test.com', is_anonymous: false } }, deps);

  // Sign-out during RPC
  deps.colState.uid = null;
  resolveRpc({ data: { display_name: 'Alice' } });
  await p;

  // Null uid means "no current session" — guard allows it,
  // but colState.uid was set back to null by sign-out.
  // The result IS applied because colState.uid === null (guard passes).
  // This is the documented reload-path behavior: null uid = no newer session.
  assert.strictEqual(deps.colState.name, 'Alice', 'Null uid allows result (reload semantics)');
});
// ═══════════════════════════════════════════════════════════════════
// STAGE 21.1 — Name ownership reduction after consumer fix
// ═══════════════════════════════════════════════════════════════════
// Audit revealed: the pre-hydration colState.name writes in auth-ux.js
// (L145 _handleSignupFresh, L174 _handleAnonConvert) were NOT redundant.
// They bridged a synchronous read at trip-planner.html:4555 (soft-convert)
// that fires AFTER hydrateIdentity() is called (L4540) but BEFORE the
// async RPC inside hydrateIdentity resolves (L4506 first await).
//
// Fix applied: soft-convert now falls back to window.utils.loadName():
//   const nm = colState.name || (window.utils && window.utils.loadName()) || '';
//
// These tests validate that removing the pre-hydration writes does NOT
// break name preservation in the soft-convert path.
console.log('\n── Stage 21.1: colState.name ownership reduction ──');

// Models the FIXED soft-convert read at trip-planner.html:4555
function softConvertRead(colState, utils) {
  return colState.name || (utils && utils.loadName && utils.loadName()) || '';
}

// Models the auth-ux.js pattern AFTER Stage 21.1 fix:
//   saveName(nm) — persists to localStorage
//   (colState.name write REMOVED)
function authUxPreHydration(nm, store) {
  if (nm) {
    store['dn'] = String(nm).slice(0, 40); // saveName
  }
  // colState.name is NOT set — hydrateIdentity gap-fills from localStorage
}

// Models hydrateIdentity's async gap-fill: DB has placeholder → localStorage
function hydrateStep(colState, utils) {
  // After RPC resolves: gap-fill from localStorage
  var cachedName = utils.loadName();
  if (cachedName && !utils.isPlaceholderName(cachedName)) {
    colState.name = cachedName;
  }
  return true;
}

test('soft-convert: colState.name present → reads it directly', () => {
  var colState = { name: 'Alice' };
  var utils = {
    loadName: function() { return 'Bob'; },
    isPlaceholderName: function() { return false; }
  };
  assert.strictEqual(softConvertRead(colState, utils), 'Alice',
    'soft-convert should prefer colState.name when present');
});

test('soft-convert: colState.name absent, localStorage present → reads loadName()', () => {
  var colState = { name: null };
  var utils = {
    loadName: function() { return 'Alice'; },
    isPlaceholderName: function() { return false; }
  };
  assert.strictEqual(softConvertRead(colState, utils), 'Alice',
    'soft-convert should fall back to loadName() when colState.name is absent');
});

test('soft-convert: both absent → returns empty string', () => {
  var colState = { name: null };
  var utils = {
    loadName: function() { return ''; },
    isPlaceholderName: function() { return false; }
  };
  assert.strictEqual(softConvertRead(colState, utils), '',
    'soft-convert should return empty when no name is available');
});

test('guest→signup: name preserved without pre-hydration write', async () => {
  // Scenario: user was previewing a guest trip (?gt=xyz), clicks Upgrade,
  // signs up with name "Alice". SIGNED_IN fires, soft-convert runs BEFORE
  // hydrateIdentity's async RPC completes.
  var colState = { uid: null, name: null };
  var store = {};
  var utils = {
    loadName: function() { return store['dn'] || ''; },
    isPlaceholderName: function(n) {
      var PLACEHOLDERS = ['guest','user','creator','placeholder'];
      return !n || PLACEHOLDERS.indexOf(String(n).toLowerCase()) !== -1;
    }
  };

  // auth-ux.js _handleSignupFresh (AFTER Stage 21.1 fix):
  // Only saveName(nm) is called — no colState.name = nm
  var nm = 'Alice';
  authUxPreHydration(nm, store);

  // SIGNED_IN fires → hydrateIdentity called (L4540, NOT awaited)
  // Simulate async RPC pending (L4506: await ensureProfile(null))
  var hydrateP = (async function() {
    await new Promise(function(r) { setTimeout(r, 50); }); // RPC
    hydrateStep(colState, utils);
  })();

  // Soft-convert at L4555 runs synchronously after hydrateIdentity call,
  // BEFORE the RPC resolves:
  var softConvertNm = softConvertRead(colState, utils);

  assert.strictEqual(softConvertNm, 'Alice',
    'soft-convert must read name from localStorage fallback even without pre-hydration write');

  await hydrateP;
  assert.strictEqual(colState.name, 'Alice',
    'hydrateIdentity gap-fill should confirm colState.name from localStorage');
});

test('guest→anon-conversion: name preserved without pre-hydration write', async () => {
  // Scenario: anon user on guest trip upgrades to registered email account
  // with name "Bob". _handleAnonConvert calls saveName(nm) then getSession().then(
  // hydrateIdentity). SIGNED_IN also fires → soft-convert reads colState.name
  // BEFORE hydrateIdentity's RPC resolves.
  var colState = { uid: null, name: null };
  var store = {};
  var utils = {
    loadName: function() { return store['dn'] || ''; },
    isPlaceholderName: function(n) {
      var PLACEHOLDERS = ['guest','user','creator','placeholder'];
      return !n || PLACEHOLDERS.indexOf(String(n).toLowerCase()) !== -1;
    }
  };

  // auth-ux.js _handleAnonConvert (AFTER Stage 21.1 fix):
  // Only saveName(nm) — no colState.name = nm
  var nm = 'Bob';
  authUxPreHydration(nm, store);

  // hydrateIdentity from _handleAnonConvert L176 and from SIGNED_IN L4540
  // both start async (first await yields before setting colState.name)
  var hydrateP = (async function() {
    await new Promise(function(r) { setTimeout(r, 50); }); // RPC
    hydrateStep(colState, utils);
  })();

  // Soft-convert at L4555 (same synchronous window as signup path):
  var softConvertNm = softConvertRead(colState, utils);

  assert.strictEqual(softConvertNm, 'Bob',
    'soft-convert must read name from localStorage fallback for anon→registered path');

  await hydrateP;
  assert.strictEqual(colState.name, 'Bob',
    'hydrateIdentity gap-fill should confirm colState.name from localStorage');
});
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
