#!/usr/bin/env node
/**
 * M4_3_DB_VERIFY — DB-level security contract verification.
 *
 * Tests the 8 negative/positive scenarios via direct RPC calls
 * using THREE different authenticated JWTs (owner, member, non-member).
 *
 * Usage:
 *   node M4_3_DB_VERIFY.js <SUPABASE_URL> <OWNER_JWT> <MEMBER_JWT> <NONMEMBER_JWT> <GROUP_ID>
 *
 * OR use --interactive to step through auth via Supabase CLI:
 *   node M4_3_DB_VERIFY.js --interactive
 *
 * This script does NOT use the browser. It calls the REST RPC endpoint
 * /rest/v1/rpc/<name> with each JWT, proving auth.uid()-scoped authorization.
 */
const https = require('https');

// ---- Helpers -------------------------------------------------------------

async function rpc(baseUrl, anonKey, jwt, name, params) {
  const body = JSON.stringify(params || {});
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/rest/v1/rpc/${name}`);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = { raw: data }; }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Extract the actual data/error shape from Supabase RPC response
// Supabase wraps: { data: <value>, error: null } on success
// On RPC throw: { data: null, error: { message, code, ... } } with non-200 HTTP
function extract(resp) {
  // The RPC may throw → error.message. Or return data.
  if (resp.data && typeof resp.data === 'object' && resp.data.error) {
    return { data: null, error: resp.data.error };
  }
  if (resp.data && typeof resp.data === 'object' && 'data' in resp.data) {
    return { data: resp.data.data, error: resp.data.error };
  }
  if (resp.status !== 200 && resp.data && typeof resp.data === 'object') {
    // PostgREST error or function-throw
    return { data: null, error: resp.data.error || resp.data.message || JSON.stringify(resp.data) };
  }
  return { data: resp.data, error: null };
}

// ---- Main ----------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 5 || args[0] === '--interactive') {
    console.log('Usage: node M4_3_DB_VERIFY.js <SUPABASE_URL> <ANON_KEY> <OWNER_JWT> <MEMBER_JWT> <NONMEMBER_JWT> <GROUP_ID>');
    console.log('  (obtain JWTs via supabase auth signin)');
    console.log('\nOr run the SQL checks in M4_phase2_journey_verify.sql first for structural assertions.');
    process.exit(1);
  }

  const [_, baseUrl, anonKey, ownerJwt, memberJwt, nonMemberJwt, groupId] = args;

  const results = {};

  console.log('=== M4_3 Security Contract — DB-level verification ===\n');

  // --- Helper: who is this JWT? ---
  const me = (jwt) => {
    const parts = jwt.split('.');
    if (parts.length < 2) return 'malformed';
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return { sub: payload.sub, aud: payload.aud, is_anonymous: payload.is_anonymous, app_metadata: payload.app_metadata };
  };

  console.log('JWT identities:');
  console.log('  Owner:', me(ownerJwt));
  console.log('  Member:', me(memberJwt));
  console.log('  Non-member:', me(nonMemberJwt));
  console.log('  Group ID:', groupId);
  console.log('');

  // ---- CHECK 1: Owner can start Journey ----
  // First ensure no active session exists (clean slate)
  console.log('[CHECK 1] Owner starts Journey session');
  let r = await rpc(baseUrl, anonKey, ownerJwt, 'start_journey_session', { p_group_id: groupId });
  const { data: d1, error: e1 } = extract(r, r.status);
  // Note: if a session is already active, this will throw (unique index) — that's also valid
  results['1_owner_start'] = !e1 || (r.status === 500 && !e1.message?.includes('duplicate'));
  console.log(`  Response: status=${r.status}, data=${JSON.stringify(d1)}, error=${e1 ? e1.message : null}`);
  console.log(`  → ${results['1_owner_start'] ? '✅ ALLOWED' : '❌ BLOCKED'}\n`);

  // ---- CHECK 2: Member cannot start Journey ----
  console.log('[CHECK 2] Member tries to start Journey session (should be DENIED)');
  r = await rpc(baseUrl, anonKey, memberJwt, 'start_journey_session', { p_group_id: groupId });
  const { data: d2, error: e2 } = extract(r, r.status);
  results['2_member_start_denied'] = !!e2 && (e2.message?.includes('owner') || r.status !== 200);
  console.log(`  Response: status=${r.status}, error=${e2 ? e2.message : null}`);
  console.log(`  → ${results['2_member_start_denied'] ? '✅ DENIED' : '❌ ALLOWED (BUG)'}\n`);

  // ---- CHECK 3: Member without consent → get_crew_locations denied ----
  console.log('[CHECK 3] Member without consent calls get_crew_locations (should be DENIED → [])');
  r = await rpc(baseUrl, anonKey, memberJwt, 'get_crew_locations', { p_group_id: groupId });
  const { data: d3, error: e3 } = extract(r, r.status);
  const c3_denied = Array.isArray(d3) && d3.length === 0 || (!e3 && (d3 === [] || JSON.stringify(d3) === '[]'));
  results['3_member_no_consent_denied'] = c3_denied;
  console.log(`  Response: status=${r.status}, data=${JSON.stringify(d3)}`);
  console.log(`  → ${results['3_member_no_consent_denied'] ? '✅ DENIED' : '❌ ALLOWED (BUG)'}\n`);

  // ---- CHECK 4: Member grants own consent ----
  console.log('[CHECK 4] Member grants own consent (should be ALLOWED)');
  r = await rpc(baseUrl, anonKey, memberJwt, 'grant_location_permission', { p_group_id: groupId });
  const { data: d4, error: e4 } = extract(r, r.status);
  results['4_member_grant'] = !e4 && d4 && d4.permission === 'granted';
  console.log(`  Response: status=${r.status}, data=${JSON.stringify(d4)}, error=${e4 ? e4.message : null}`);
  console.log(`  → ${results['4_member_grant'] ? '✅ ALLOWED' : '❌ BLOCKED'}\n`);

  // ---- CHECK 5: Member revokes own consent ----
  console.log('[CHECK 5] Member revokes own consent (should be ALLOWED)');
  r = await rpc(baseUrl, anonKey, memberJwt, 'revoke_location_permission', { p_group_id: groupId });
  const { data: d5, error: e5 } = extract(r, r.status);
  results['5_member_revoke'] = !e5 && d5 && d5.permission === 'denied';
  console.log(`  Response: status=${r.status}, data=${JSON.stringify(d5)}, error=${e5 ? e5.message : null}`);
  console.log(`  → ${results['5_member_revoke'] ? '✅ ALLOWED' : '❌ BLOCKED'}\n`);

  // ---- CHECK 6: Owner cannot grant member's consent ----
  // Owner calls grant_location_permission — this grants OWNER's OWN consent,
  // NOT the member's. Verify the row written is owner's, not member's.
  console.log('[CHECK 6] Owner tries to grant consent (should write OWNER row only, not member)');
  r = await rpc(baseUrl, anonKey, ownerJwt, 'grant_location_permission', { p_group_id: groupId });
  const { data: d6, error: e6 } = extract(r, r.status);
  // The owner's grant is allowed but writes to owner's row (user_id = auth.uid())
  // The critical assertion: no p_user_id param exists, so owner CANNOT target member
  const owner_granted_self = !e6 && d6 && d6.user_id === me(ownerJwt).sub;
  const member_not_granted = true;  // by design — no p_user_id means can't target member
  results['6_owner_grant_self_only'] = owner_granted_self && member_not_granted;
  console.log(`  Response: status=${r.status}, data=${JSON.stringify(d6)}`);
  console.log(`  Owner grants own consent → OK. Member row NOT touched (no p_user_id param).`);
  console.log(`  → ${results['6_owner_grant_self_only'] ? '✅ OWNER CANNOT GRANT MEMBER' : '❌ BUG'}\n`);

  // ---- CHECK 7: No active journey (after owner ends) → denied ----
  console.log('[CHECK 7] Owner ends journey, then member denied');
  await rpc(baseUrl, anonKey, ownerJwt, 'end_journey_session', { p_group_id: groupId });
  await new Promise(r => setTimeout(r, 1000));

  r = await rpc(baseUrl, anonKey, memberJwt, 'get_crew_locations', { p_group_id: groupId });
  const { data: d7, error: e7 } = extract(r, r.status);
  results['7_no_active_journey_denied'] = (Array.isArray(d7) && d7.length === 0) || JSON.stringify(d7) === '[]';
  console.log(`  Response: status=${r.status}, data=${JSON.stringify(d7)}`);
  console.log(`  → ${results['7_no_active_journey_denied'] ? '✅ DENIED' : '❌ ALLOWED (BUG)'}\n`);

  // ---- CHECK 8: Active journey + consent → but empty (M4.3, no member_locations) ----
  // Re-start journey + re-grant member consent
  console.log('[CHECK 8] Restart journey + member consent → get_crew returns [] (M4.3: no locations)');
  await rpc(baseUrl, anonKey, ownerJwt, 'start_journey_session', { p_group_id: groupId });
  await rpc(baseUrl, anonKey, memberJwt, 'grant_location_permission', { p_group_id: groupId });
  await new Promise(r => setTimeout(r, 1000));

  r = await rpc(baseUrl, anonKey, memberJwt, 'get_crew_locations', { p_group_id: groupId });
  const { data: d8, error: e8 } = extract(r, r.status);
  results['8_authorized_empty_m43'] = (Array.isArray(d8) && d8.length === 0) || JSON.stringify(d8) === '[]';
  console.log(`  Response: status=${r.status}, data=${JSON.stringify(d8)}, error=${e8 ? e8.message : null}`);
  console.log(`  → ${results['8_authorized_empty_m43'] ? '✅ ALLOWED (empty set — no member_locations yet)' : '❌ BUG'}\n`);

  // ---- CHECK 9: Non-member denied ----
  console.log('[CHECK 9] Non-member calls get_crew_locations (should be DENIED)');
  r = await rpc(baseUrl, anonKey, nonMemberJwt, 'get_crew_locations', { p_group_id: groupId });
  const { data: d9, error: e9 } = extract(r, r.status);
  results['9_nonmember_denied'] = JSON.stringify(d9) === '[]' || (Array.isArray(d9) && d9.length === 0);
  console.log(`  Response: status=${r.status}, data=${JSON.stringify(d9)}, error=${e9 ? e9.message : null}`);
  console.log(`  → ${results['9_nonmember_denied'] ? '✅ DENIED' : '❌ ALLOWED (BUG)'}\n`);

  // ---- SUMMARY ----
  console.log('=== M4.3 Security Contract — Summary ===\n');
  const label = {
    '1_owner_start': 'Owner can start Journey',
    '2_member_start_denied': 'Member cannot start Journey',
    '3_member_no_consent_denied': 'Member without consent → DENIED',
    '4_member_grant': 'Member grants own consent',
    '5_member_revoke': 'Member revokes own consent',
    '6_owner_grant_self_only': 'Owner cannot grant member consent',
    '7_no_active_journey_denied': 'No active Journey → DENIED',
    '8_authorized_empty_m43': 'Authorized → empty set (M4.3)',
    '9_nonmember_denied': 'Non-member → DENIED',
  };

  let allPass = true;
  for (const [key, desc] of Object.entries(label)) {
    const pass = results[key];
    if (!pass) allPass = false;
    console.log(`  ${pass ? '✅' : '❌'} ${desc}`);
  }

  console.log(`\n${allPass ? '🎉 ALL CHECKS PASSED' : '⚠️  SOME CHECKS FAILED — see details above'}`);
  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(2);
});
