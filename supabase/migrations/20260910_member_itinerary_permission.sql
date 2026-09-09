-- Add members_can_add_itinerary permission to groups table
-- Default: false (members cannot add itinerary items)

alter table if exists public.groups
  add column if not exists members_can_add_itinerary boolean not null default false;

-- Update trip_permissions RPC to return the new permission
create or replace function public.trip_permissions(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_group record;
  v_is_member boolean;
  v_is_owner boolean;
  v_is_anon boolean;
begin
  -- Get group details
  select g.id, g.created_by, g.members_can_add_itinerary
  into v_group
  from public.groups g
  where g.id = p_group_id;

  if not found then
    return jsonb_build_object('error', 'group not found');
  end if;

  -- Check membership
  select exists(
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_uid
  ) into v_is_member;

  v_is_owner := (v_group.created_by = v_uid);
  v_is_anon := public.is_anonymous_caller();

  return jsonb_build_object(
    'is_owner', v_is_owner,
    'is_member', v_is_member,
    'is_anonymous', v_is_anon,
    'can_edit', v_is_owner,
    'can_invite', v_is_owner,
    'can_manage_members', v_is_owner,
    'can_add_itinerary', v_is_owner or (v_is_member and not v_is_anon and coalesce(v_group.members_can_add_itinerary, false))
  );
end;
$$;

-- Update create_shared_item RPC to check members_can_add_itinerary
create or replace function public.create_shared_item(
  p_group_id uuid, p_title text, p_note text, p_link text,
  p_done boolean, p_date date, p_time text, p_budget integer,
  p_day_number integer default null
)
returns table(id uuid, group_id uuid, created_by uuid, title text, note text,
              link text, done boolean, created_at timestamp with time zone,
              date text, "time" text, budget numeric, day_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by uuid := auth.uid();
  v_group record;
  v_can_add boolean;
begin
  -- Get group details
  select g.id, g.created_by, g.members_can_add_itinerary
  into v_group
  from public.groups g
  where g.id = p_group_id;

  if not found then
    raise exception 'group not found' using errcode = 'P0001';
  end if;

  -- Creator can always add
  if v_group.created_by = v_created_by then
    v_can_add := true;
  -- Anonymous guests can never add
  elsif public.is_anonymous_caller() then
    v_can_add := false;
  -- Registered members need permission
  elsif not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_created_by
  ) then
    v_can_add := false;
  else
    v_can_add := coalesce(v_group.members_can_add_itinerary, false);
  end if;

  if not v_can_add then
    raise exception 'permission denied: cannot add itinerary' using errcode = 'P0001';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'title is required';
  end if;

  return query
  with ins as (
    insert into public.shared_items as si
      (group_id, created_by, title, note, link, done, date, "time", budget, day_number)
    values
      (p_group_id, v_created_by, trim(p_title),
       coalesce(p_note, ''), coalesce(p_link, ''),
       coalesce(p_done, false), p_date, p_time, p_budget, p_day_number)
    returning
      si.id as "id", si.group_id as "group_id", si.created_by as "created_by",
      si.title as title, si.note as note, si.link as link, si.done as done,
      si.created_at as created_at, si.date as "date", si."time" as "time",
      si.budget as budget, si.day_number as day_number
  )
  select
    ins."id" as "id", ins."group_id" as "group_id", ins."created_by" as "created_by",
    ins.title, ins.note, ins.link, ins.done, ins.created_at,
    ins."date" as "date", ins."time" as "time", ins.budget, ins.day_number
  from ins;
end;
$$;

-- Update updateGroup RPC to accept members_can_add_itinerary
create or replace function public.update_group(
  p_group_id uuid,
  p_name text default null,
  p_destination text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_members_can_add_itinerary boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Only creator can update
  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.created_by = v_uid
  ) then
    raise exception 'only the trip creator can update group settings' using errcode = 'P0001';
  end if;

  update public.groups
  set
    name = coalesce(p_name, name),
    destination = coalesce(p_destination, destination),
    start_date = coalesce(p_start_date, start_date),
    end_date = coalesce(p_end_date, end_date),
    members_can_add_itinerary = coalesce(p_members_can_add_itinerary, members_can_add_itinerary)
  where id = p_group_id;

  return jsonb_build_object('success', true);
end;
$$;
