-- Audit all Journey Mode RPCs in production
SELECT 
  p.proname as rpc_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  CASE WHEN p.proname IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status
FROM pg_proc p
WHERE p.proname IN (
  'get_crew_locations',
  'start_journey_session', 
  'end_journey_session',
  'grant_location_permission',
  'revoke_location_permission',
  'upsert_member_location'
)
ORDER BY p.proname;

-- Also list ALL journey-related functions
SELECT 
  p.proname as rpc_name,
  pg_get_function_identity_arguments(p.oid) as arguments
FROM pg_proc p
WHERE p.proname LIKE '%journey%' 
   OR p.proname LIKE '%crew%'
   OR p.proname LIKE '%location%'
ORDER BY p.proname;
