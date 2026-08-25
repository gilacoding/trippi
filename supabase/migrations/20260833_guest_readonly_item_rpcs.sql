-- P0 security fix, part 3: close the same hole in the SECURITY DEFINER write RPCs.
--
-- Parts 1-2 fixed RLS on shared_items, but the app writes through
-- create_shared_item / delete_shared_item, which are SECURITY DEFINER and
-- therefore bypass RLS entirely. A joined anonymous guest could still do:
--     POST /rest/v1/rpc/create_shared_item  -> 200, row inserted
--     POST /rest/v1/rpc/delete_shared_item  -> 200, row deleted
--
-- Both functions are re-created verbatim from their live definitions with ONE
-- added guard: anonymous participants are read-only on the itinerary. Owners and
-- registered members are unaffected (this matches trip_permissions.can_edit).

create or replace function public.create_shared_item(
  p_group_id uuid, p_title text, p_note text, p_link text,
  p_done boolean, p_date date, p_time text, p_budget integer
)
returns table(id uuid, group_id uuid, created_by uuid, title text, note text,
              link text, done boolean, created_at timestamp with time zone,
              date text, "time" text, budget numeric)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_created_by uuid := auth.uid();
begin
  if v_created_by is null then
    raise exception 'unauthorized: auth.uid() is null' using ERRCODE = 'P0001';
  end if;
  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_created_by
  ) then
    raise exception 'not a group member' using ERRCODE = 'P0001';
  end if;
  -- Guest participants are read-only on the itinerary.
  if public.is_anonymous_caller() then
    raise exception 'guests cannot modify the itinerary' using ERRCODE = 'P0001';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'title is required';
  end if;
  return query
  with ins as (
    insert into public.shared_items as si
      (group_id, created_by, title, note, link, done, date, "time", budget)
    values
      (p_group_id, v_created_by, trim(p_title),
       coalesce(p_note, ''), coalesce(p_link, ''),
       coalesce(p_done, false), p_date, p_time, p_budget)
    returning
      si.id as "id", si.group_id as "group_id", si.created_by as "created_by",
      si.title as title, si.note as note, si.link as link, si.done as done,
      si.created_at as created_at, si.date as "date", si."time" as "time", si.budget as budget
  )
  select
    ins."id" as "id", ins."group_id" as "group_id", ins."created_by" as "created_by",
    ins.title, ins.note, ins.link, ins.done, ins.created_at,
    ins."date" as "date", ins."time" as "time", ins.budget
  from ins;
end;
$function$;

create or replace function public.delete_shared_item(p_item_id uuid)
returns table(deleted_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_created_by uuid := auth.uid();
  v_group_id   uuid;
  v_deleted    uuid;
begin
  if v_created_by is null then
    raise exception 'unauthorized: auth.uid() is null' using ERRCODE = 'P0001';
  end if;

  select group_id into v_group_id
  from public.shared_items
  where id = p_item_id;

  if not found then
    return query select null::uuid as deleted_id;
    return;
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = v_group_id and user_id = v_created_by
  ) then
    raise exception 'not a group member' using ERRCODE = 'P0001';
  end if;

  -- Guest participants are read-only on the itinerary.
  if public.is_anonymous_caller() then
    raise exception 'guests cannot modify the itinerary' using ERRCODE = 'P0001';
  end if;

  delete from public.shared_items
  where id = p_item_id
  returning id into v_deleted;

  return query select v_deleted as deleted_id;
end;
$function$;
