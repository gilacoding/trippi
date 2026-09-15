SELECT 
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
WHERE p.proname LIKE '%crew%';
