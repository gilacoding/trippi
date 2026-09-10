SELECT 
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args
FROM pg_proc p
WHERE p.proname = 'update_group';
