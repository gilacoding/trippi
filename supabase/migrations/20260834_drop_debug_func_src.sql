-- Drop the temporary introspection helper from 20260832.
-- It only existed to read live function definitions while the Management API
-- returned 403; the audit is complete, so remove the extra surface.

drop function if exists public.debug_func_src(text);
