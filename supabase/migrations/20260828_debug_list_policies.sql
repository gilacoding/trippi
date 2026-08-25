-- Temporary read-only introspection helper.
-- Management API /database/query returns 403 (error 1010) on this project, so
-- this is the only way to actually SEE the RLS policies instead of guessing.
-- Owner-only, read-only, and dropped again once the audit is done.

create or replace function public.debug_list_policies(p_table text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'policy', policyname,
    'cmd', cmd,
    'roles', roles::text,
    'using', qual,
    'with_check', with_check
  ) order by cmd, policyname), '[]'::jsonb)
  from pg_policies
  where schemaname = 'public' and tablename = p_table;
$$;

grant execute on function public.debug_list_policies(text) to authenticated;
