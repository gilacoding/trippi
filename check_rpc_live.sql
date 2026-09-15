-- Check if get_crew_locations exists in production
SELECT 
  p.proname as rpc_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  obj_description(p.oid, 'pg_proc') as description
FROM pg_proc p
WHERE p.proname = 'get_crew_locations';

-- Also check all crew/journey/location related functions
SELECT 
  p.proname as rpc_name,
  pg_get_function_identity_arguments(p.oid) as arguments
FROM pg_proc p
WHERE p.proname LIKE '%journey%' 
   OR p.proname LIKE '%crew%'
   OR p.proname LIKE '%location%'
   OR p.proname = 'get_crew_locations'
ORDER BY p.proname;
