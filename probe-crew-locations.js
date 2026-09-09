// Direct Supabase RPC probe for get_crew_locations 400 error
// Run: node probe-crew-locations.js
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://ishflkcsdzlhhxtanhxf.supabase.co';
const ANON_KEY = 'sb_publishable_ZfuXkk79bvWGZPcG4JL79w_8ppMuPR7';
const GROUP_ID = 'b552a792-9eca-437b-af07-ce76ac8ebf8d';

// Use a real test account from the bridge credentials
const TEST_EMAIL = 'gilangila@gmail.com';
const TEST_PASSWORD = 'H5Bs8iNBD2MbRyp';

async function main() {
  const sb = createClient(URL, ANON_KEY);
  
  // 1. Check current auth state
  console.log('=== Auth state ===');
  let { data: { user } } = await sb.auth.getUser();
  console.log('Logged in as:', user ? user.id : 'anonymous/no session');
  
  // 2. Try the RPC directly with the group ID from the URL
  console.log('\n=== get_crew_locations RPC ===');
  try {
    const res = await sb.rpc('get_crew_locations', { p_group_id: GROUP_ID });
    console.log('SUCCESS:', JSON.stringify(res, null, 2));
  } catch (e) {
    console.log('ERROR type:', e.name);
    console.log('ERROR message:', e.message);
    console.log('ERROR status:', e.status);
    console.log('ERROR body:', JSON.stringify(e, null, 2).slice(0, 2000));
  }
  
  // 3. Also try with explicit UUID cast via RPC with different shape
  console.log('\n=== Try with p_group_id as string (no cast) ===');
  try {
    const res = await sb.rpc('get_crew_locations', { p_group_id: GROUP_ID });
    console.log('SUCCESS:', JSON.stringify(res, null, 2));
  } catch (e) {
    console.log('ERROR message:', e.message);
    console.log('ERROR status:', e.status);
  }
  
  // 4. Check if journey session exists for this group
  console.log('\n=== Check journey_sessions table ===');
  try {
    const { data, error } = await sb
      .from('journey_sessions')
      .select('*')
      .eq('group_id', GROUP_ID)
      .single();
    if (error) console.log('journey_sessions error:', error.message);
    else console.log('journey_sessions:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // 5. Check member_locations for this group
  console.log('\n=== Check member_locations table ===');
  try {
    const { data, error } = await sb
      .from('member_locations')
      .select('*')
      .eq('group_id', GROUP_ID);
    if (error) console.log('member_locations error:', error.message);
    else console.log('Count:', data ? data.length : 0, 'rows');
    if (data && data.length) console.log('Sample:', JSON.stringify(data[0], null, 2));
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // 6. Check groups table
  console.log('\n=== Check groups table ===');
  try {
    const { data, error } = await sb
      .from('groups')
      .select('*')
      .eq('id', GROUP_ID)
      .single();
    if (error) console.log('groups error:', error.message);
    else console.log('group:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // 7. Check if start_journey_session function exists and works
  console.log('\n=== Try start_journey_session ===');
  try {
    const res = await sb.rpc('start_journey_session', { p_group_id: GROUP_ID });
    console.log('SUCCESS:', JSON.stringify(res, null, 2));
  } catch (e) {
    console.log('ERROR message:', e.message);
    console.log('ERROR status:', e.status);
  }
  
  // 8. After starting journey, try get_crew_locations again
  console.log('\n=== get_crew_locations AFTER start_journey ===');
  try {
    const res = await sb.rpc('get_crew_locations', { p_group_id: GROUP_ID });
    console.log('SUCCESS:', JSON.stringify(res, null, 2));
  } catch (e) {
    console.log('ERROR message:', e.message);
    console.log('ERROR status:', e.status);
  }
}

main().catch(console.error);
