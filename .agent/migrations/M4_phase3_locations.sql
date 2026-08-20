-- ============================================================
-- M4.4 — Location Sharing Layer (built behind M4.3 immutable gate)
--
-- ADDITIVE ONLY. Does NOT modify M1-M3 tables, RLS, or RPC signatures.
-- Only: (1) adds member_locations table, (2) extends get_crew_locations
--       with the position JOIN behind the SAME 4 admission gates.
--
-- Security invariants (carried from M4.3, M4.4 does not relax):
--   - auth.uid() is sole identity source
--   - One position row per (group, user) — latest only (ON CONFLICT)
--   - No caller-supplied user_id param
--   - All new RPCs: SECURITY DEFINER, search_path=''
--   - No GPS in this SQL — coordinates come FROM the browser (M4.4 frontend)
-- ============================================================

-- 1. member_locations table (M4.4) --------------------------------
-- Holds ONLY latest known position per (group, user).
-- Written via RPC (upsert_member_location) behind the consent gate.
-- No history, no trails — latest wins (ON CONFLICT DO UPDATE).

create table if not exists public.member_locations (
  group_id       uuid not null references public.groups(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  latitude       double precision,
  longitude      double precision,
  accuracy_m     double precision,
  heading_deg    double precision,            -- 0-360, mobile heading if available
  speed_mps      double precision,            -- ground speed m/s if available
  timestamp      timestamptz default now(),   -- when THIS position was observed
  updated_at     timestamptz default now(),
  primary key (group_id, user_id)
);

-- Indexes for fast lookups
create index if not exists idx_member_locations_gps on public.member_locations (group_id, latitude, longitude);
create index if not exists idx_member_locations_ts on public.member_locations (group_id, updated_at desc);

-- 2. RLS (consistent with M3/M4.3 patterns) -----------------------
-- Only group members can see/write position rows.
-- Consent is checked by the RPC (get_crew_locations gate), not RLS,
-- because RLS can't read journey_sessions.status or consent atomically
-- in a single query layer — the RPC does that check.

alter table public.member_locations enable row level security;

drop policy if exists "ml_select_members" on public.member_locations cascade;
create policy "ml_select_members" on public.member_locations
  for select using (public.is_group_member(group_id));

drop policy if exists "ml_upsert_self" on public.member_locations cascade;
create policy "ml_upsert_self" on public.member_locations
  for insert with check (user_id = auth.uid());
create policy "ml_update_self" on public.member_locations
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "ml_delete_self" on public.member_locations
  for delete using (user_id = auth.uid());

-- 3. upsert_member_location RPC -------------------------------------
-- Writes caller's OWN position. Derives user_id from auth.uid().
-- Returns the updated row as jsonb. No p_user_id parameter.

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
  v_result jsonb;
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

  -- Return the updated row as jsonb
  return (
    select to_jsonb(ml)
    from public.member_locations ml
    where ml.group_id = p_group_id and ml.user_id = v_uid
  );
end;
$$;

-- 4. get_crew_locations — EXTEND (do NOT replace M4.3's gate)
-- M4.3 version returns '[]'. M4.4 version: same 4 gates, but joins
-- member_locations to return actual positions of consent-granted members.
-- The authorization contract is UNCHANGED — only the return data changes.

create or replace function public.get_crew_locations(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Return member_locations of all consent-granted members on active journey
  -- (NOT just caller — the whole crew that has consented)
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
  where ml.group_id = p_group_id
    and lp.permission = 'granted';

  return v_result;
end;
$$;

-- 5. Grants -------------------------------------------------------
grant execute on function public.upsert_member_location(uuid, double precision, double precision, double precision, double precision, double precision) to authenticated;
grant execute on function public.get_crew_locations(uuid) to authenticated;

revoke all on function public.upsert_member_location(uuid, double precision, double precision, double precision, double precision, double precision) from public;
revoke all on function public.get_crew_locations(uuid) from public;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.member_locations to authenticated;

-- 6. Notify PostgREST to reload schema cache ----------------------
-- (Does NOT propagate via Management API; must be run via SQL Editor or psql)
notify pgrst, 'reload schema';
