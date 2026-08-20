-- ============================================================================
-- M4.1 — Route Data Foundation
-- Tables: group_routes, route_waypoints
-- RLS:    mirror M3 pattern via is_group_member()
-- RPCs:   create_route, add_waypoint, reorder_waypoints, get_route
-- Scope:  M4.1 ONLY (no journey_sessions / location tables yet — those are M4.3/4.4)
-- Naming: uses real M2/M3 root object `groups` (group_id FK), `group_` prefix.
-- ============================================================================

-- 1. group_routes ----------------------------------------------------------
create table if not exists public.group_routes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  start_location text,
  end_location text,
  distance_km numeric,
  estimated_duration_minutes integer,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One ACTIVE route per group (partial unique index)
drop index if exists public.uniq_active_route_per_group;
create unique index uniq_active_route_per_group
  on public.group_routes (group_id) where (is_active = true);

-- 2. route_waypoints -------------------------------------------------------
create table if not exists public.route_waypoints (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.group_routes(id) on delete cascade,
  sequence integer not null,
  name text not null,
  description text,
  latitude numeric,
  longitude numeric,
  day_number integer,
  category text,                         -- app-controlled vocabulary, NOT enum
  arrival_time timestamptz,
  departure_time timestamptz,
  estimated_arrival_time timestamptz,    -- itinerary sync / ETA / progress
  notes text,                            -- travel-companion context
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (route_id, sequence)
);
create index if not exists idx_route_waypoints_route on public.route_waypoints (route_id);

-- 3. RLS -------------------------------------------------------------------
alter table public.group_routes enable row level security;
alter table public.route_waypoints enable row level security;

-- Helper: does the current user belong to the group that owns this route?
-- (is_group_member exists from M3 and takes a group_id directly)
drop policy if exists group_routes_select on public.group_routes;
create policy group_routes_select on public.group_routes
  for select using (public.is_group_member(group_id));
drop policy if exists group_routes_insert on public.group_routes;
create policy group_routes_insert on public.group_routes
  for insert with check (public.is_group_member(group_id));
drop policy if exists group_routes_update on public.group_routes;
create policy group_routes_update on public.group_routes
  for update using (public.is_group_member(group_id));
drop policy if exists group_routes_delete on public.group_routes;
create policy group_routes_delete on public.group_routes
  for delete using (public.is_group_member(group_id));

-- waypoints: resolve group_id via the parent route
drop policy if exists route_waypoints_select on public.route_waypoints;
create policy route_waypoints_select on public.route_waypoints
  for select using (
    public.is_group_member((select group_id from public.group_routes where id = route_waypoints.route_id))
  );
drop policy if exists route_waypoints_insert on public.route_waypoints;
create policy route_waypoints_insert on public.route_waypoints
  for insert with check (
    public.is_group_member((select group_id from public.group_routes where id = route_waypoints.route_id))
  );
drop policy if exists route_waypoints_update on public.route_waypoints;
create policy route_waypoints_update on public.route_waypoints
  for update using (
    public.is_group_member((select group_id from public.group_routes where id = route_waypoints.route_id))
  );
drop policy if exists route_waypoints_delete on public.route_waypoints;
create policy route_waypoints_delete on public.route_waypoints
  for delete using (
    public.is_group_member((select group_id from public.group_routes where id = route_waypoints.route_id))
  );

-- 4. RPCs (SECURITY DEFINER, auth.uid()-gated) -----------------------------

-- create_route: creates an ACTIVE route for a group.
-- If another active route exists, it is deactivated (enforces one-active rule
-- at the write path in addition to the partial unique index).
create or replace function public.create_route(
  p_group_id uuid,
  p_name text,
  p_start_location text default null,
  p_end_location text default null,
  p_distance_km numeric default null,
  p_estimated_duration_minutes integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rid uuid;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = 'P0001';
  end if;
  if not public.is_group_member(p_group_id) then
    raise exception 'not a member of this group' using errcode = 'P0001';
  end if;
  -- deactivate any currently-active route
  update public.group_routes set is_active = false
    where group_id = p_group_id and is_active = true;
  insert into public.group_routes (group_id, name, is_active, start_location, end_location, distance_km, estimated_duration_minutes, created_by)
    values (p_group_id, p_name, true, p_start_location, p_end_location, p_distance_km, p_estimated_duration_minutes, v_uid)
    returning id into v_rid;
  return v_rid;
end;
$$;

-- add_waypoint: inserts a waypoint at p_sequence, shifting others down.
-- If p_sequence is null, appends after the current max.
create or replace function public.add_waypoint(
  p_route_id uuid,
  p_name text,
  p_sequence integer default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_day_number integer default null,
  p_category text default null,
  p_arrival_time timestamptz default null,
  p_departure_time timestamptz default null,
  p_estimated_arrival_time timestamptz default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gid uuid;
  v_seq integer;
  v_wid uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = 'P0001';
  end if;
  select group_id into v_gid from public.group_routes where id = p_route_id;
  if v_gid is null then
    raise exception 'route not found' using errcode = 'P0001';
  end if;
  if not public.is_group_member(v_gid) then
    raise exception 'not a member of this group' using errcode = 'P0001';
  end if;
  -- determine sequence
  if p_sequence is null then
    select coalesce(max(sequence), 0) + 1 into v_seq from public.route_waypoints where route_id = p_route_id;
  else
    v_seq := p_sequence;
    -- shift existing >= v_seq down by 1
    update public.route_waypoints set sequence = sequence + 1
      where route_id = p_route_id and sequence >= v_seq;
  end if;
  insert into public.route_waypoints (route_id, sequence, name, latitude, longitude, day_number, category, arrival_time, departure_time, estimated_arrival_time, notes)
    values (p_route_id, v_seq, p_name, p_latitude, p_longitude, p_day_number, p_category, p_arrival_time, p_departure_time, p_estimated_arrival_time, p_notes)
    returning id into v_wid;
  return v_wid;
end;
$$;

-- reorder_waypoints: reassigns sequence 1..N from an ordered list of waypoint ids.
create or replace function public.reorder_waypoints(
  p_route_id uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gid uuid;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = 'P0001';
  end if;
  select group_id into v_gid from public.group_routes where id = p_route_id;
  if v_gid is null then
    raise exception 'route not found' using errcode = 'P0001';
  end if;
  if not public.is_group_member(v_gid) then
    raise exception 'not a member of this group' using errcode = 'P0001';
  end if;
  for i in 1 .. array_length(p_ordered_ids, 1) loop
    update public.route_waypoints set sequence = i
      where route_id = p_route_id and id = p_ordered_ids[i];
  end loop;
end;
$$;

-- get_route: returns the active route + ordered waypoints for a group in one call.
-- Used by M4.2 UI and the offline journey cache.
create or replace function public.get_route(
  p_group_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gid uuid := auth.uid();
  v_route record;
  v_waypoints jsonb;
begin
  if v_gid is null then
    raise exception 'unauthorized' using errcode = 'P0001';
  end if;
  if not public.is_group_member(p_group_id) then
    raise exception 'not a member of this group' using errcode = 'P0001';
  end if;
  select * into v_route from public.group_routes
    where group_id = p_group_id and is_active = true
    order by created_at desc limit 1;
  if v_route is null then
    return jsonb_build_object('route', null, 'waypoints', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(to_jsonb(w) order by w.sequence), '[]'::jsonb)
    into v_waypoints
    from public.route_waypoints w
    where w.route_id = v_route.id;
  return jsonb_build_object(
    'route', to_jsonb(v_route),
    'waypoints', v_waypoints
  );
end;
$$;

-- 5. Backward-compatible agenda link (M4.2 prep, applied now so schema is ready)
-- shared_items already has `link text`; add nullable waypoint_id reference.
alter table public.shared_items
  add column if not exists waypoint_id uuid references public.route_waypoints(id) on delete set null;
