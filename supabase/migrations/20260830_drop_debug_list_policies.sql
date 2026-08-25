-- Drop the temporary introspection helper added in 20260828.
-- It existed only to read pg_policies while the Management API returned 403;
-- the duplicate-policy audit is done, so remove the extra surface.

drop function if exists public.debug_list_policies(text);
