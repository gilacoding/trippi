-- ============================================================
-- MARKICAB M4 PHASE 2 — Journey Mode: permission model ONLY
-- No GPS, no watchPosition, no member_locations, no realtime.
-- Additive. Does NOT modify M1-M3 tables/RLS/RPCs.
--
-- Model (per founder-approved M4.3 architecture):
--   journey_sessions  : owner-activated, system-expired, one-active-per-group
--   location_permissions : per-member opt-in consent ledger
--   get_crew_locations     : the single privacy gate (returns EMPTY in M4.3)
-- ============================================================

-- 1. Tables -------------------------------------------------

create table if not exists public.journey_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  enabled_by uuid references auth.users(id),         -- owner who started Journey Mode
  started_at timestamptz,                             -- set when status -> active
  ended_at   timestamptz,                             -- set when status -> completed
  expires_at timestamptz,                             -- system-computed deadline (status -> expired)
  status text not null default 'planned'
     check (status in ('planned','active','completed','expired')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One ACTIVE session per group (enforced in DB, not just UI)
create unique index if not exists uniq_active_journey_per_group
  on public.journey_sessions (group_id)
  where (status = 'active');

-- Per-member consent ledger.
-- NOTE: NO trigger creates a row on join_group. Consent is opt-in at first choice.
create table if not exists public.location_permissions (
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  permission  text not null default 'denied'
     check (permission in ('granted','denied')),
  granted_at  timestamptz,                             -- set when permission -> granted
  revoked_at  timestamptz,                             -- set when permission -> denied (revoked/explicit-deny)
  updated_at  timestamptz default now(),
  primary key (group_id, user_id)
);

-- 2. RLS ----------------------------------------------------
-- Mirror M3 pattern: is_group_member(group_id) + user_id = auth.uid() for consent rows.

alter table public.journey_sessions enable row level security;
alter table public.location_permissions enable row level security;

-- journey_sessions: only members can see their group's sessions
drop policy if exists "journey_select_members" on public.journey_sessions cascade;
  create policy "journey_select_members" on public.journey_sessions
  for select using (public.is_group_member(group_id));

-- location_permissions: members can SELECT their group's rows (read own + view consent)
drop policy if exists "locperm_select_members" on public.location_permissions cascade;
  create policy "locperm_select_members" on public.location_permissions
  for select using (public.is_group_member(group_id));

-- location_permissions: member can INSERT only their OWN row (no p_user_id in RPCs)
drop policy if exists "locperm_insert_self" on public.location_permissions cascade;
  create policy "locperm_insert_self" on public.location_permissions
  for insert with check (user_id = auth.uid());

-- location_permissions: member can UPDATE only their OWN row
drop policy if exists "locperm_update_self" on public.location_permissions cascade;
  create policy "locperm_update_self" on public.location_permissions
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3. RPCs (SECURITY DEFINER, auth.uid()-gated, search_path='') ----------

-- 3a. start_journey_session — OWNER ONLY
--   Rejects if caller is not owner.
--   Rejects if trip end_date already passed (Journey must never outlive trip).
--   One active session per group enforced by partial unique index.
--   expires_at = min(groups.end_date + '23:59:59', started_at + 24h)
create or replace function public.start_journey_session(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_owner    uuid;
  v_end_date date;
  v_session  uuid;
  v_started  timestamptz := now();
  v_expires  timestamptz;
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;

  -- Owner check via trip_permissions (cannot_manage = not owner)
  select g.created_by into v_owner from public.groups g where g.id = p_group_id;
  if v_owner is null then
    raise exception 'group not found' using errcode = 'P0001';
  end if;
  if v_owner <> v_uid then
    raise exception 'only the owner can start a journey session' using errcode = 'P0001';
  end if;

  -- Reject if trip already ended
  select g.end_date into v_end_date from public.groups g where g.id = p_group_id;
  if v_end_date is not null and v_end_date < current_date then
    raise exception 'journey cannot start: trip end_date has passed' using errcode = 'P0001';
  end if;

  v_expires := least(
    (v_end_date + time '23:59:59')::timestamptz,
    v_started + interval '24 hours'
  );

  insert into public.journey_sessions
    (group_id, enabled_by, started_at, expires_at, status)
  values
    (p_group_id, v_uid, v_started, v_expires, 'active')
  returning id into v_session;

  update public.journey_sessions set updated_at = now() where id = v_session;

  return jsonb_build_object(
    'id',        v_session,
    'group_id',  p_group_id,
    'enabled_by', v_uid,
    'started_at', v_started,
    'expires_at', v_expires,
    'status',    'active'
  );
end;
$$;

-- 3b. end_journey_session — OWNER ONLY
create or replace function public.end_journey_session(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_session uuid;
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;

  select g.created_by into v_owner from public.groups g where g.id = p_group_id;
  if v_owner is null then
    raise exception 'group not found' using errcode = 'P0001';
  end if;
  if v_owner <> v_uid then
    raise exception 'only the owner can end a journey session' using errcode = 'P0001';
  end if;

  update public.journey_sessions
  set status = 'completed', ended_at = now(), updated_at = now()
  where group_id = p_group_id and status = 'active'
  returning id into v_session;

  if v_session is null then
    raise exception 'no active journey session to end' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'id', v_session, 'status', 'completed', 'ended_at', now()
  );
end;
$$;

-- 3c. grant_location_permission — SELF ONLY (no p_user_id param)
--   Creates/updates caller's OWN row only.
create or replace function public.grant_location_permission(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_member boolean;
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;

  -- Must be a member (is_group_member does the EXISTS check)
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_uid
  ) into v_is_member;
  if not v_is_member then
    raise exception 'only a group member can grant location permission' using errcode = 'P0001';
  end if;

  insert into public.location_permissions
    (group_id, user_id, permission, granted_at, revoked_at, updated_at)
  values
    (p_group_id, v_uid, 'granted', now(), null, now())
  on conflict (group_id, user_id)
  do update set
    permission   = 'granted',
    granted_at   = now(),
    revoked_at   = null,
    updated_at   = now();

  return jsonb_build_object(
    'group_id', p_group_id,
    'user_id',  v_uid,
    'permission', 'granted',
    'granted_at', now()
  );
end;
$$;

-- 3d. revoke_location_permission — SELF ONLY
create or replace function public.revoke_location_permission(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_is_member boolean;
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_uid
  ) into v_is_member;
  if not v_is_member then
    raise exception 'only a group member can revoke location permission' using errcode = 'P0001';
  end if;

  insert into public.location_permissions
    (group_id, user_id, permission, granted_at, revoked_at, updated_at)
  values
    (p_group_id, v_uid, 'denied', null, now(), now())
  on conflict (group_id, user_id)
  do update set
    permission   = 'denied',
    revoked_at   = now(),
    updated_at   = now();

  return jsonb_build_object(
    'group_id', p_group_id,
    'user_id',  v_uid,
    'permission', 'denied',
    'revoked_at', now()
  );
end;
$$;

-- 3e. explicit_deny_location_permission — SEMANTIC ALIAS for revoke
--   Revoking is the same as explicit-deny. Kept as a distinct RPC for audit clarity.
create or replace function public.explicit_deny_location_permission(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.revoke_location_permission(p_group_id);
end;
$$;

-- 3f. get_crew_locations — THE SINGLE PRIVACY GATE
--   In M4.3, member_locations table does NOT exist, so this returns an EMPTY set.
--   The authorization contract is identical to what M4.4 will use:
--     caller authenticated + is member + active journey + own consent = granted
--   Everything that passes the gate gets an empty array in M4.3; M4.4 only
--   adds the member_locations join behind the SAME predicate.
create or replace function public.get_crew_locations(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_is_member boolean;
  v_active   boolean;
  v_consent  boolean;
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;

  -- All four admission checks must be TRUE:
  --  1. caller is authenticated (v_uid not null - checked above)
  --  2. caller is a group member
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_uid
  ) into v_is_member;

  --  3. an active journey session exists for the group
  select exists (
    select 1 from public.journey_sessions js
    where js.group_id = p_group_id
      and js.status = 'active'
      and (js.expires_at is null or js.expires_at > now())
  ) into v_active;

  --  4. caller's OWN consent is granted
  select exists (
    select 1 from public.location_permissions lp
    where lp.group_id = p_group_id
      and lp.user_id = v_uid
      and lp.permission = 'granted'
  ) into v_consent;

  -- If ANY check fails, return empty (no positions leaked)
  if (not v_is_member) or (not v_active) or (not v_consent) then
    return '[]'::jsonb;
  end if;

  -- M4.3: member_locations table does NOT exist yet.
  -- M4.4 will replace the line below with a real join against member_locations
  -- filtered to the same admission predicate.
  return '[]'::jsonb;
end;
$$;

-- 4. Grants --------------------------------------------------
-- All RPCs are SECURITY DEFINER owned by postgres; grant execute to authenticated.
-- Guests use ?gt= token RPCs (not these) — they are NOT granted EXECUTE here for anon.

grant execute on function public.start_journey_session(uuid)           to authenticated;
grant execute on function public.end_journey_session(uuid)             to authenticated;
grant execute on function public.grant_location_permission(uuid)       to authenticated;
grant execute on function public.revoke_location_permission(uuid)      to authenticated;
grant execute on function public.explicit_deny_location_permission(uuid) to authenticated;
grant execute on function public.get_crew_locations(uuid)              to authenticated;

revoke all on function public.start_journey_session(uuid)                from public;
revoke all on function public.end_journey_session(uuid)                  from public;
revoke all on function public.grant_location_permission(uuid)           from public;
revoke all on function public.revoke_location_permission(uuid)          from public;
revoke all on function public.explicit_deny_location_permission(uuid)   from public;
revoke all on function public.get_crew_locations(uuid)                   from public;

-- Grant SELECT on the new tables to authenticated (RLS still gates rows)
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.journey_sessions         to authenticated;
grant select, insert, update, delete on public.location_permissions     to authenticated;

-- 5. Realtime publication -----------------------------------
-- (member_locations is M4.4; journey_sessions + location_permissions
--  are consent/audit state — realtime broadcast optional for M4.4+.)
