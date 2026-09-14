/**
 * Targeted test for P1-01 and P1-02 fixes.
 * Tests only the fixed logic expressions, not the full DOM functions.
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/../trip-planner.html', 'utf8');

let pass = 0, fail = 0;

// ── P1-01: renderJourneyContent perms null check ──
// Before: const isOwner = colState.perms && colState.perms.is_owner;
// After:  const isOwner = !!(colState.perms && colState.perms.is_owner);

// Check the fix is in the code
const p1Pattern = /const isOwner = !!\(colState\.perms && colState\.perms\.is_owner\)/;
if (p1Pattern.test(html)) {
  console.log('PASS P1-01 code: defensive double-negation present in source');
  pass++;
} else {
  console.log('FAIL P1-01 code: defensive double-negation not found');
  fail++;
}

// Check the OLD buggy line is gone
const oldPattern = /const isOwner = colState\.perms && colState\.perms\.is_owner;/;
if (!oldPattern.test(html)) {
  console.log('PASS P1-01 cleanup: old unguarded expression removed');
  pass++;
} else {
  console.log('FAIL P1-01 cleanup: old unguarded expression still present');
  fail++;
}

// Check expression logic
const ctx = vm.createContext({});
// null perms -> should be false (not throw)
const r1 = vm.runInContext('var colState={perms:null}; !!(colState.perms && colState.perms.is_owner)', ctx);
assert.strictEqual(r1, false);
console.log('PASS P1-01a: null perms -> false (no throw)');
pass++;

// perms without is_owner -> false
const r2 = vm.runInContext('var colState={perms:{is_owner:false}}; !!(colState.perms && colState.perms.is_owner)', ctx);
assert.strictEqual(r2, false);
console.log('PASS P1-01b: perms.is_owner=false -> false');
pass++;

// owner perms -> true
const r3 = vm.runInContext('var colState={perms:{is_owner:true}}; !!(colState.perms && colState.perms.is_owner)', ctx);
assert.strictEqual(r3, true);
console.log('PASS P1-01c: perms.is_owner=true -> true');
pass++;

// ── P1-02: startJourneyMode only sets colState.journey on success ──
// Before: colState.journey = {status:'active'};
// After:  if(res.data){ colState.journey = {status:'active'}; }

const p2Pattern = /if\(res\.data\)\{ colState\.journey = \{status:'active'\}; \}/;
if (p2Pattern.test(html)) {
  console.log('PASS P1-02 code: guarded cache set present in source');
  pass++;
} else {
  console.log('FAIL P1-02 code: guarded cache set not found');
  fail++;
}

// Check the OLD unguarded line is gone
const oldP2Pattern = /if\(res\.error\)\{.*?return; \}\s+colState\.journey = \{status:'active'\};/;
if (!oldP2Pattern.test(html)) {
  console.log('PASS P1-02 cleanup: old unguarded cache set removed');
  pass++;
} else {
  console.log('FAIL P1-02 cleanup: old unguarded cache set still present');
  fail++;
}

// Test: only set on truthy res.data
const testSuccess = vm.runInContext(`
  var colState = {journey: null};
  var res = {data: {status: 'active'}};
  if(res.data){ colState.journey = {status:'active'}; }
  JSON.stringify(colState.journey);
`, ctx);
assert.strictEqual(testSuccess, '{"status":"active"}');
console.log('PASS P1-02a: cache set when res.data is truthy');
pass++;

const testFailure = vm.runInContext(`
  var colState = {journey: null};
  var res = {error: {message: 'fail'}};
  if(res.error){ /* early return */ }
  else if(res.data){ colState.journey = {status:'active'}; }
  colState.journey;
`, ctx);
assert.strictEqual(testFailure, null);
console.log('PASS P1-02b: cache NOT set when only res.error present');
pass++;

const testUndef = vm.runInContext(`
  var colState = {journey: null};
  var res = {data: null};
  if(res.data){ colState.journey = {status:'active'}; }
  colState.journey;
`, ctx);
assert.strictEqual(testUndef, null);
console.log('PASS P1-02c: cache NOT set when res.data is null/falsy');
pass++;

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
