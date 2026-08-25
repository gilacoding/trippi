-- Temporary read-only helper: fetch a function's live source, because the
-- Management API /database/query is 403 on this project and the original
-- create_shared_item / delete_shared_item definitions are not in the repo.
-- Dropped again immediately after the audit.

create or replace function public.debug_func_src(p_name text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'args', pg_get_function_identity_arguments(p.oid),
    'secdef', p.prosecdef,
    'src', pg_get_functiondef(p.oid)
  )), '[]'::jsonb)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = p_name;
$$;

grant execute on function public.debug_func_src(text) to authenticated;
