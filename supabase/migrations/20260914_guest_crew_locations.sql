-- Fix: allow guests to see crew locations (read-only)
-- Root cause: get_crew_locations Gate 4 requires the CALLER to have granted
-- their own location consent. Guests (anonymous users) have never consented,
-- so they get "location permission not granted" and see an empty map.
-- Fix: add p_is_guest parameter; when true, skip the caller-consent gate.
-- Guests remain read-only: upsert_member_location / grant_location_permission
-- still enforce Gate 4 unconditionally.

-- Drop old 1-arg overload first (CREATE OR REPLACE with a new signature leaves
-- the old one live, causing PGRST203).
DROP FUNCTION IF EXISTS public.get_crew_locations(p_group_id uuid);

CREATE OR REPLACE FUNCTION public.get_crew_locations(p_group_id uuid, p_is_guest boolean DEFAULT false)
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

  -- Gate 4: caller has granted their own consent (SKIPPED for guests — they
  -- are read-only and never publish their own location)
  if not p_is_guest then
    select permission into v_consent
    from public.location_permissions lp
    where lp.group_id = p_group_id and lp.user_id = v_uid;
    if v_consent is null or v_consent != 'granted' then
      raise exception 'location permission not granted' using errcode = 'P0001';
    end if;
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
$$;
