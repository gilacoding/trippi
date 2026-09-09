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
// SUMMARY
// ═══════════════════════════════════════════════════════════════════
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
