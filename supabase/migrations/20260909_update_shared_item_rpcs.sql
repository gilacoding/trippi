-- Update create_shared_item RPC to accept p_day_number parameter
-- This was added to the JS caller but never updated in the SQL function

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
set search_path to ''
as $function$
declare
  v_created_by uuid := auth.uid();
begin
  if v_created_by is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_created_by
  ) then
    raise exception 'not a group member' using errcode = 'P0001';
  end if;
  -- Guest participants are read-only on the itinerary.
  if public.is_anonymous_caller() then
    raise exception 'guests cannot modify the itinerary' using errcode = 'P0001';
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
$function$;

-- Also update update_shared_item RPC to accept p_day_number
create or replace function public.update_shared_item(
  p_item_id uuid,
  p_title text default null,
  p_note text default null,
  p_link text default null,
  p_done boolean default null,
  p_date date default null,
  p_time text default null,
  p_budget integer default null,
  p_day_number integer default null
)
returns table(id uuid, group_id uuid, title text, note text, link text,
              done boolean, date text, "time" text, budget numeric, day_number integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_created_by uuid := auth.uid();
begin
  if v_created_by is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.group_members gm
    join public.shared_items si on si.group_id = gm.group_id
    where si.id = p_item_id and gm.user_id = v_created_by
  ) then
    raise exception 'not a group member or item not found' using errcode = 'P0001';
  end if;
  if public.is_anonymous_caller() then
    raise exception 'guests cannot modify the itinerary' using errcode = 'P0001';
  end if;
  return query
  update public.shared_items si
  set
    title = coalesce(p_title, si.title),
    note = coalesce(p_note, si.note),
    link = coalesce(p_link, si.link),
    done = coalesce(p_done, si.done),
    date = coalesce(p_date, si.date),
    "time" = coalesce(p_time, si."time"),
    budget = coalesce(p_budget, si.budget),
    day_number = coalesce(p_day_number, si.day_number)
  where si.id = p_item_id
  returning
    si.id as "id", si.group_id as "group_id", si.title, si.note, si.link,
    si.done, si.date as "date", si."time" as "time", si.budget, si.day_number;
end;
$function$;
