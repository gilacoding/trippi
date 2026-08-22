-- M4.5 Input validation fix: upsert_member_location coordinate/telemetry sanity.
-- Same signature (p_group_id uuid, p_lat float8, p_lng float8, p_accuracy_m,
-- p_heading_deg, p_speed_mps float8 default null) -> returns jsonb.
-- CREATE OR REPLACE preserves OID -> no PostgREST schema-cache reload needed.
-- Security model unchanged: SECURITY DEFINER, owner postgres, search_path='',
-- 4 admission gates unchanged. Adds Gate 5: input validation.
-- NaN detection for float8: `x <> x` (NaN is never equal to itself; isfinite()
-- does NOT exist for double precision). +-Infinity are caught by range checks.

create or replace function public.upsert_member_location(
  p_group_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m double precision default null,
  p_heading_deg double precision default null,
  p_speed_mps double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_active boolean;
  v_consent text;
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

  -- Gate 4: caller's own consent = granted
  select permission into v_consent
  from public.location_permissions lp
  where lp.group_id = p_group_id and lp.user_id = v_uid;
  if v_consent is null or v_consent != 'granted' then
    raise exception 'location permission not granted' using errcode = 'P0001';
  end if;

  -- Gate 5: input validation (lat/lng required; telemetry optional but sane)
  -- NOTE: isfinite() does NOT exist for double precision (only date/timestamp/
  -- interval/numeric). NaN detection for float8: NaN <> NaN (never equal to
  -- itself); +-Infinity are caught by the range checks (Inf > 90, -Inf < -90).
  if p_lat is null or p_lng is null then
    raise exception 'latitude and longitude are required' using errcode = 'P0001';
  end if;
  if p_lat <> p_lat or p_lat < -90 or p_lat > 90 then
    raise exception 'latitude out of range [-90, 90]' using errcode = 'P0001';
  end if;
  if p_lng <> p_lng or p_lng < -180 or p_lng > 180 then
    raise exception 'longitude out of range [-180, 180]' using errcode = 'P0001';
  end if;
  if p_accuracy_m is not null and (p_accuracy_m <> p_accuracy_m or p_accuracy_m < 0) then
    raise exception 'accuracy must be non-negative' using errcode = 'P0001';
  end if;
  if p_heading_deg is not null and (p_heading_deg <> p_heading_deg or p_heading_deg < 0 or p_heading_deg >= 360) then
    raise exception 'heading must be in [0, 360)' using errcode = 'P0001';
  end if;
  if p_speed_mps is not null and (p_speed_mps <> p_speed_mps or p_speed_mps < 0) then
    raise exception 'speed must be non-negative' using errcode = 'P0001';
  end if;

  -- UPSERT: latest position only
  insert into public.member_locations (
    group_id, user_id, latitude, longitude,
    accuracy_m, heading_deg, speed_mps, updated_at
  ) values (
    p_group_id, v_uid, p_lat, p_lng,
    p_accuracy_m, p_heading_deg, p_speed_mps, now()
  )
  on conflict (group_id, user_id) do update set
    latitude      = excluded.latitude,
    longitude     = excluded.longitude,
    accuracy_m    = excluded.accuracy_m,
    heading_deg   = excluded.heading_deg,
    speed_mps     = excluded.speed_mps,
    timestamp     = excluded.timestamp,
    updated_at    = now();

  -- Return the updated row as jsonb (same contract as before)
  return (
    select to_jsonb(ml)
    from public.member_locations ml
    where ml.group_id = p_group_id and ml.user_id = v_uid
  );
end;
$$;

-- Grants preserved (same as before: authenticated EXECUTE; function body only).
