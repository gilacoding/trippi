-- list_my_groups: return groups the current user is a member of,
-- with role + member counts. Used by the home view after login
-- so groups persist across sessions.
create or replace function public.list_my_groups()
returns table (
  id uuid,
  name text,
  destination text,
  start_date text,
  end_date text,
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
