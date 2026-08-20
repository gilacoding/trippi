# M4 — Map / Journey Foundation (Architecture Draft)

**Status:** DRAFT for founder review. No schema/RLS changes yet.
**Prerequisite:** M3 COLLAB FOUNDATION = CLOSED (2026-08-19).
**Principle (founder):** draft data model first, validate against live M2/M3 schema, then code. No map UI until the model is right.

---

## 0. Grounding — real M2/M3 objects (verified)

| Concept | Real table/object | Key column |
|---|---|---|
| Trip container | `public.groups` | `id uuid`, `created_by`, `start_date date`, `end_date date` |
| Agenda | `public.shared_items` | `id`, `group_id`, `title`, `link text`, `date text`, `time text`, `budget numeric`, `done bool` |
| Members / roles | `public.group_members` | `group_id`, `user_id`, `role text('owner','member')`, `display_name` |
| Expenses | `public.group_expenses` | `id`, `group_id`, `amount`, `paid_by` |
| Permission gate | `public.trip_permissions(p_group_id)` SECURITY DEFINER → `is_owner,is_member,can_edit,can_delete,can_invite,can_manage_members` |
| RLS guard | `public.is_group_member(group_id)` SECURITY DEFINER → bool |

**Naming correction vs founder draft:** the draft used `trips`/`agenda_items`/`trip_id`. The real model uses **`groups`** + **`shared_items`** keyed by **`group_id`**. M4 tables will follow the established convention: `group_` prefix where appropriate, `group_id uuid` FK → `groups.id`.

---

## 1. Goal

Promote Markicab from:
```
groups ─┬─ shared_items (agenda)
        └─ group_expenses
```
to:
```
groups ─┬─ trip_routes ── route_waypoints
        ├─ shared_items (+ waypoint_id nullable)
        ├─ journey_sessions ── location_permissions
        └─ member_locations (latest per user)
```
plus an offline journey cache (local only, no schema change).

---

## 2. Phase M4.1 — Route Data Foundation

### 2.1 `group_routes` (one ACTIVE route per group; schema future-ready for many)
```sql
create table public.group_routes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,        -- M4.1: one active per group
  start_location text,
  end_location text,
  distance_km numeric,
  estimated_duration_minutes integer,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- One active route per group (partial unique index)
create unique index uniq_active_route_per_group
  on public.group_routes (group_id) where (is_active = true);
```

### 2.2 `route_waypoints` — the CORE table (data, not image)
```sql
create table public.route_waypoints (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.group_routes(id) on delete cascade,
  sequence integer not null,
  name text not null,
  description text,
  latitude numeric,
  longitude numeric,
  day_number integer,
  category text,                              -- app-controlled vocabulary, NOT enum
  arrival_time timestamptz,
  departure_time timestamptz,
  estimated_arrival_time timestamptz,         -- ADDED: itinerary sync / ETA / progress
  notes text,                                -- ADDED: travel-companion context
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (route_id, sequence)
);
```
`category` initial vocabulary (frontend-enforced, DB stays `text`):
`start, stop, food, fuel, rest, stay, activity, viewpoint, end`
(Extensible: `museum, hostel, station, market, repair, scenic, checkpoint, dive_site, boat`, etc.)

### 2.3 RLS (mirror M3 pattern via `is_group_member`)
```sql
alter table public.group_routes enable row level security;
alter table public.route_waypoints enable row level security;
-- SELECT/INSERT/UPDATE/DELETE: where is_group_member(group_id)
-- (is_group_member resolves group_id by joining group_routes→groups for waypoints)
```

### 2.4 RPCs (SECURITY DEFINER, auth.uid()-gated)
- `create_route(p_group_id, p_name, p_start, p_end, p_distance_km, p_duration)` → returns route id (member can create; owner typically manages)
- `add_waypoint(p_route_id, p_sequence, p_name, p_lat, p_lng, ...)` → inserts/reshuffles sequence
- `reorder_waypoints(p_route_id, p_ordered_ids uuid[])` → reassigns `sequence` 1..N (used by M4.2 UI drag)
- `get_route(p_group_id)` → route + ordered waypoints (single call for UI + offline cache)

---

## 3. Phase M4.2 — Waypoint/Agenda integration (backward compatible)

`shared_items` already has `link text` (free-form location). Add:
```sql
alter table public.shared_items
  add column waypoint_id uuid references public.route_waypoints(id) on delete set null;
```
- Old agenda rows: `waypoint_id IS NULL`, `link` still shown. ✅ backward compatible.
- New flow: creating an agenda item can attach a waypoint (map pick → waypoint_id). Agenda renders the linked waypoint's coords.
- No deletion of `link`.

---

## 4. Phase M4.3 — Journey Mode (permission model FIRST, no GPS yet)

### 4.1 `journey_sessions`
```sql
create table public.journey_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  enabled_by uuid references auth.users(id),
  started_at timestamptz default now(),
  ended_at timestamptz,
  status text not null default 'planned' check (status in ('planned','active','completed','expired'))
);
```
Owner-only: `create_journey_session` (status→active) / `end_journey_session` (status→completed) gated by `trip_permissions.can_manage_members` (owner).
**Expiry fallback (system, no auto-delete):** a scheduled check (or `get_crew_locations` trigger) marks `active`→`expired` when `groups.end_date < current_date`. Forgotten sessions become `expired`, never silently deleted.

### 4.2 `location_permissions`
```sql
create table public.location_permissions (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'denied' check (status in ('granted','denied')),
  updated_at timestamptz default now(),
  primary key (group_id, user_id)
);
```
Flow: owner starts Journey Mode → each member gets a consent prompt (UI) → `grant_location_permission(p_group_id)` / `revoke_location_permission` → updates own row only (member can only write their own row; RLS: `user_id = auth.uid()`).

---

## 5. Phase M4.4 — Location Data (MVP: latest-per-user, no history flood)

### 5.1 `member_locations`
```sql
create table public.member_locations (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  latitude numeric not null,
  longitude numeric not null,
  accuracy numeric,
  battery_level numeric,
  status text check (status in ('riding','stopped','rest')),
  updated_at timestamptz default now(),
  primary key (group_id, user_id)         -- UPSERT overwrites latest
);
```
- Write = `upsert_member_location` (member writes only their own row).
- Read = `get_crew_locations(p_group_id)` → returns locations ONLY for members whose `location_permissions.status='granted'` AND a `journey_sessions` is `active`. This is the privacy gate.

### 5.2 Privacy rules (extends M3)
| Role | Journey Mode | Location |
|---|---|---|
| Owner | can enable/disable | can see granted crew only |
| Member | can opt in / opt out | sees granted crew only; writes own only |
| Guest (`?gt=` token) | NEVER | **never** sees `member_locations` — guest = plan only, not live position |

Enforced server-side in `get_crew_locations`: join `location_permissions` + active `journey_sessions`; guests never call it (no group membership, no RLS pass).

---

## 6. Offline Journey Cache (local only — no schema change)

Key: `markicab_journey_cache:<group_id>` (localStorage / IndexedDB).
Contents: `group_routes` + `route_waypoints` + `shared_items` + emergency info (owner contact, nearest hospital waypoints).
Strategy: on Journey Mode start, snapshot to cache; on no-signal, UI reads cache. Sync rules: client writes location heartbeats when online; cache is read-only fallback, never the source of truth.

---

## 7. Milestone order (founder-approved)

```
M3 CLOSED
   ↓
M4.1 Route Schema (group_routes, route_waypoints, RLS, RPCs)   ← START HERE
   ↓
M4.2 Route UI (route tab, waypoint display, reorder)
   ↓
M4.3 Journey Permission (journey_sessions, location_permissions, consent UI)
   ↓
M4.4 Location Sharing (member_locations, get_crew_locations, heartbeat)
   ↓
M5 Social Layer
```

**No GPS until M4.4.** Route + waypoint first because every downstream feature (reorder, GPX, nav, live tracking) depends on the sequence-ordered relational model.

---

## 8. Final M4.1 decisions (founder-approved 2026-08-19)

| Item | Decision |
|---|---|
| Route model | One ACTIVE route per group (`is_active` + partial unique index) |
| Multiple routes | Future-ready schema (many rows, one active) |
| Waypoint category | `text` + app-controlled vocabulary (not DB enum) |
| Journey end | Manual start/end + system expiry fallback (`active`→`expired` when `end_date < today`, no delete) |
| Journey status | `planned / active / completed / expired` |
| Heartbeat cadence | Adaptive, defined in M4.4 (proposed: moving 30–60s, stopped 5min, manual refresh). NOT in M4.1 |
| Guest location | Always forbidden (carried from M3) |
| Waypoint extra fields | `estimated_arrival_time timestamptz`, `notes text` (both nullable) |

