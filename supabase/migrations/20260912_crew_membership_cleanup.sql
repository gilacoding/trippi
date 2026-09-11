-- 2026-09-12: Crew = members only. Stale location/consent rows of former
-- members leaked into get_crew_locations (no membership join), so removed
-- "ghost members" kept showing on the Journey crew list and remove_member
-- returned false for them (silent no-op in UI).

-- 1) get_crew_locations: only report locations of CURRENT group members.
CREATE OR REPLACE FUNCTION public.get_crew_locations(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_is_member boolean;
  v_active    boolean;
  v_consent   text;
  v_result    jsonb;
begin
  -- Gate 1: caller authenticated
  if v_uid is null then
    raise exception 'unauthorized' using errcode = 'P0001';
  end if;

  -- Gate 2: caller is a group member
  if not public.is_group_member(p_group_id) then
    raise exception 'not a group member' using errcode = 'P0001';
  end if;

  -- Gate 3: active journey exists
  select exists(
    select 1 from public.journey_sessions js
    where js.group_id = p_group_id and js.status = 'active'
  ) into v_active;
  if not v_active then
    raise exception 'no active journey for this group' using errcode = 'P0001';
  end if;

  -- Gate 4: caller has granted their own consent
  select permission into v_consent
  from public.location_permissions lp
  where lp.group_id = p_group_id and lp.user_id = v_uid;
  if v_consent is null or v_consent != 'granted' then
    raise exception 'location permission not granted' using errcode = 'P0001';
  end if;

  -- Return member_locations of consent-granted CURRENT members on active journey.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', ml.user_id,
      'latitude', ml.latitude,
      'longitude', ml.longitude,
      'accuracy_m', ml.accuracy_m,
      'heading_deg', ml.heading_deg,
      'speed_mps', ml.speed_mps,
      'timestamp', ml.timestamp,
      'updated_at', ml.updated_at
    ) order by ml.updated_at desc
  ), '[]'::jsonb)
  into v_result
  from public.member_locations ml
  join public.location_permissions lp on lp.group_id = ml.group_id and lp.user_id = ml.user_id
  join public.journey_sessions js on js.group_id = ml.group_id and js.status = 'active'
  join public.group_members gm on gm.group_id = ml.group_id and gm.user_id = ml.user_id
  where ml.group_id = p_group_id
    and lp.permission = 'granted';

  return v_result;
end;
$function$;

-- 2) remove_member: deleting membership must also drop location + consent rows,
-- otherwise the next journey resurrects stale crew data.
CREATE OR REPLACE FUNCTION public.remove_member(p_group_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid          uuid := auth.uid();
  v_target_role  text;
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = v_uid and role = 'owner'
  ) then
    raise exception 'only the trip owner can manage members' using errcode = 'P0001';
  end if;
  select role into v_target_role
  from public.group_members where group_id = p_group_id and user_id = p_user_id;
  if not found then return false; end if;
  if v_target_role = 'owner' then
    raise exception 'cannot remove the trip owner' using errcode = 'P0001';
  end if;
  delete from public.member_locations where group_id = p_group_id and user_id = p_user_id;
  delete from public.location_permissions where group_id = p_group_id and user_id = p_user_id;
  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
  return true;
end;
$function$;

-- 3) One-time purge: location/consent rows left behind by past removals.
DELETE FROM public.member_locations ml
 WHERE NOT EXISTS (
   SELECT 1 FROM public.group_members gm
   WHERE gm.group_id = ml.group_id AND gm.user_id = ml.user_id
 );
DELETE FROM public.location_permissions lp
 WHERE NOT EXISTS (
   SELECT 1 FROM public.group_members gm
   WHERE gm.group_id = lp.group_id AND gm.user_id = lp.user_id
 );
