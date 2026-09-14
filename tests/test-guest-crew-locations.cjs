/**
 * Targeted test for guest crew locations fix.
 * Verifies:
 * 1. get_crew_locations accepts p_is_guest parameter
 * 2. Guest path skips Gate 4 (consent check)
 * 3. Member path still requires consent
 * 4. Old 1-arg overload is gone (no PGRST203)
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/../trip-planner.html', 'utf8');
const apiJs = fs.readFileSync(__dirname + '/../backend/markicab-api.js', 'utf8');

let pass = 0, fail = 0;

// ── Test 1: API.getCrewLocations passes p_is_guest ──
if (apiJs.includes('p_is_guest: !!isGuest')) {
  console.log('PASS: API.getCrewLocations passes p_is_guest');
  pass++;
} else {
  console.log('FAIL: API.getCrewLocations does not pass p_is_guest');
  fail++;
}

// ── Test 2: All 3 callers pass isGuest() ──
const callerCount = (html.match(/API\.getCrewLocations\(isGuest\(\)\)/g) || []).length;
if (callerCount === 3) {
  console.log('PASS: All 3 callers pass isGuest()');
  pass++;
} else {
  console.log(`FAIL: Expected 3 callers, found ${callerCount}`);
  fail++;
}

// ── Test 3: No bare getCrewLocations() calls remain ──
const bareCalls = (html.match(/API\.getCrewLocations\(\)/g) || []).length;
if (bareCalls === 0) {
  console.log('PASS: No bare getCrewLocations() calls remain');
  pass++;
} else {
  console.log(`FAIL: ${bareCalls} bare getCrewLocations() calls still present`);
  fail++;
}

// ── Test 4: Guest view skips consent banner ──
if (html.includes("if(isGuest()){\n      innerHtml += '<div class=\"consent-banner consent-denied\" id=\"consentBanner\"><p>📍 Melihat lokasi crew (read-only).</p></div>'")) {
  console.log('PASS: Guest view shows read-only banner, not consent prompt');
  pass++;
} else {
  console.log('FAIL: Guest view does not have read-only banner');
  fail++;
}

// ── Test 5: Guest view does NOT wire up share/deny/stop buttons ──
// (the buttons are inside consentHtml which is only added for !isGuest)
const guestBlock = html.indexOf("if(isGuest()){\n      innerHtml += '<div class=\"consent-banner consent-denied\"");
if (guestBlock !== -1) {
  const after = html.slice(guestBlock, guestBlock + 300);
  if (!after.includes("shareLocationBtn") && !after.includes("denyLocationBtn") && !after.includes("stopSharingBtn")) {
    console.log('PASS: Guest view does not expose share/deny/stop buttons');
    pass++;
  } else {
    console.log('FAIL: Guest view exposes consent buttons');
    fail++;
  }
} else {
  console.log('FAIL: Could not find guest block');
  fail++;
}

// ── Test 6: Guest view does NOT start location watch ──
if (html.includes("if(!isGuest() && colState.locationConsent === 'granted'")) {
  console.log('PASS: Guest view does not start location watch');
  pass++;
} else {
  console.log('FAIL: Guest view may start location watch');
  fail++;
}

// ── Test 7: Migration file has DROP for old overload ──
const migration = fs.readFileSync(__dirname + '/../supabase/migrations/20260914_guest_crew_locations.sql', 'utf8');
if (migration.includes('DROP FUNCTION IF EXISTS public.get_crew_locations(p_group_id uuid)')) {
  console.log('PASS: Migration drops old 1-arg overload');
  pass++;
} else {
  console.log('FAIL: Migration does not drop old overload');
  fail++;
}

// ── Test 8: Migration has p_is_guest with DEFAULT false ──
if (migration.includes('p_is_guest boolean DEFAULT false')) {
  console.log('PASS: Migration has p_is_guest with DEFAULT false');
  pass++;
} else {
  console.log('FAIL: Migration missing p_is_guest parameter');
  fail++;
}

// ── Test 9: Migration skips Gate 4 for guests ──
if (migration.includes("if not p_is_guest then")) {
  console.log('PASS: Migration skips Gate 4 for guests');
  pass++;
} else {
  console.log('FAIL: Migration does not skip Gate 4 for guests');
  fail++;
}

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
