-- Drop and recreate list_my_groups RPC with members_can_add_itinerary
drop function if exists public.list_my_groups();

create or replace function public.list_my_groups()
returns table(
  id uuid, name text, destination text, start_date date, end_date date,
  created_by uuid, created_at timestamp with time zone, role text,
  member_count bigint, item_count bigint, expense_total numeric,
  members_can_add_itinerary boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
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
    (select count(*) from public.group_members gm2 where gm2.group_id = g.id) as member_count,
    (select count(*) from public.shared_items si where si.group_id = g.id) as item_count,
    (select coalesce(sum(si.budget), 0) from public.shared_items si where si.group_id = g.id) as expense_total,
    g.members_can_add_itinerary
  from public.groups g
  join public.group_members gm on gm.group_id = g.id
  where gm.user_id = v_uid
  order by g.created_at desc;
end;
$$;
