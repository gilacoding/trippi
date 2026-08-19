-- FIX: list_my_groups return types must match the actual groups columns.
-- start_date / end_date are type DATE in the groups table, so the RETURNS
-- TABLE must declare them as date (not text) or PostgREST/SQL raises
--   42804: structure of query does not match function result type
-- (same class of bug as the create_expense fix.)
drop function if exists public.list_my_groups();

create or replace function public.list_my_groups()
returns table (
  id uuid,
  name text,
  destination text,
  start_date date,
  end_date date,
  created_by uuid,
  created_at timestamptz,
  role text,
  member_count bigint,
  item_count bigint,
  expense_total numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;
  return query
  select
    g.id,
    g.name,
    g.destination,
    g.start_date,
    g.end_date,
    g.created_by,
    g.created_at,
    gm.role,
    (select count(*) from public.group_members where group_id = g.id) as member_count,
    (select count(*) from public.shared_items where group_id = g.id) as item_count,
    coalesce((select sum(amount) from public.group_expenses where group_id = g.id), 0) as expense_total
  from public.groups g
  join public.group_members gm on gm.group_id = g.id and gm.user_id = v_uid
  order by g.created_at desc;
end;
$$;
