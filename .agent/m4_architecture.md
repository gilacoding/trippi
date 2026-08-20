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

**Scope rule (hard):** M4.3 establishes consent + authorization foundations ONLY. No GPS, no `watchPosition`, no geolocation stream, no `member_locations` writes. M4.4 introduces coordinates behind the gates defined here.

### 4.1 `journey_sessions`
```sql
create table public.journey_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  enabled_by uuid references auth.users(id),       -- owner who started Journey Mode
  started_at timestamptz,                          -- set when status -> active
  ended_at   timestamptz,                          -- set when status -> completed
  expires_at timestamptz,                          -- system-computed deadline (status -> expired)
  status text not null default 'planned'
       check (status in ('planned','active','completed','expired')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (id)
);
create unique index uniq_active_journey_per_group
  on public.journey_sessions (group_id) where (status = 'active');
```
- **Owner-only activation:** `start_journey_session(p_group_id)` gated by `trip_permissions(...).can_manage_members` (owner).
  - **Reject if trip is over:** if `groups.end_date < current_date`, the function raises `exception 'journey cannot start: trip end_date passed'` (status stays `planned`). Journey must never outlive the trip.
  - Sets `status='active'`, `started_at=now()`, `expires_at = min(groups.end_date + time '23:59:59', started_at + interval '24 hours')`. The end-of-trip boundary wins over a rolling 24h clock — Journey cannot outlive the trip.
  - **Reject if already active:** partial unique index `uniq_active_journey_per_group` enforces this server-side (INSERT fails on duplicate).
- **Owner-only end:** `end_journey_session(p_group_id)` → `status='completed'`, `ended_at=now()`.
- **System expiry (no auto-delete):** a scheduled tick (or `get_crew_locations` admission check) marks `active`→`expired` when `now() > expires_at`. Forgotten sessions become `expired`, never silently deleted.
- One active session per group (partial unique index on `status='active'`).

### 4.2 `location_permissions` (per-member consent ledger)
```sql
create table public.location_permissions (
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  permission  text not null default 'denied'
       check (permission in ('granted','denied')),
  granted_at  timestamptz,                         -- set when permission -> granted
  revoked_at  timestamptz,                         -- set when permission -> denied (revoked)
  updated_at  timestamptz default now(),
  primary key (group_id, user_id)
);
```
- **Member writes OWN row only:** `grant_location_permission(p_group_id)` / `revoke_location_permission(p_group_id)` are SECURITY DEFINER functions that write **only** `user_id = auth.uid()`. The RLS row policy (`user_id = auth.uid()`) is a backstop — app-level enforcement is the authority.
- **Owner cannot grant on behalf of another member:** there is NO `p_user_id` parameter. The function derives identity from `auth.uid()`. Attempting `rpc('grant_location_permission', {p_group_id, p_user_id: <other>})` → the extra param is rejected at signature level (`does not exist`), and even if present, is overwritten by `auth.uid()`. Owner starts the *session*; members opt in to *sharing their position*.
- **No consent row on join:** a member joining a group does NOT auto-create a `location_permissions` row. Consent is opt-in at first use, not opt-out. Membership ≠ location-consent state.
- `permission` default is `'denied'` for rows that exist.
- **Row is created on first consent choice:**
  - member taps "Share my location" → `grant_location_permission(p_group_id)` INSERTs `{group_id, user_id=auth.uid(), permission='granted', granted_at=now()}` (or updates an existing row to granted).
  - member taps "Don't share" → `explicit_deny_location_permission(p_group_id)` INSERTs `{..., permission='denied', revoked_at=now()}` only if the user **explicitly** chooses Don't share (not merely because they joined). Explicit denial is auditable.
  - `absent` (no row) ≡ implicit-denied: same security outcome as `denied`, but no audit-record until the member acts.
  - `absent` and `denied` are both DENIED by the admission rule (§4.3, case 3).
- `granted_at` / `revoked_at` timestamps form a consent ledger (updates flip the `permission` enum + the relevant timestamp). `updated_at = now()` on every write.

### 4.3 Admission rule (the single privacy gate for M4.4)
`get_crew_locations(p_group_id)` returns positions ONLY when ALL of:
1. `journey_sessions`: a row exists with `status='active'` for the group (Journey Mode ON),
2. the caller is a member (`is_group_member(group_id)`), AND
3. the caller's `location_permissions.permission = 'granted'` for the group.

**Guests (`?gt=` token: no `group_members` row) fail rules 1+2 — denied unconditionally.**

### 4.4 Negative-case security contract (accepted before M4.4 ships)

| # | Scenario | Expected | Enforced where |
|---|---|---|---|
| 1 | Guest (?gt=, no membership) requests location | DENIED | get_crew_locations: no session + no group_members row -> RLS reject |
| 2 | Non-member authenticated user requests location | DENIED | get_crew_locations: is_group_member false -> RLS reject |
| 3 | Member without consent (absent/denied) requests location | DENIED | admission: no granted row -> DENIED |
| 4 | Member grants own consent | ALLOWED | grant_location_permission sets own row, permission='granted', granted_at=now() |
| 5 | Member revokes own consent | DENIED (to others) | revoke_location_permission sets own row, permission='denied', revoked_at=now() |
| 6 | Owner tries to grant member's consent | DENIED | no p_user_id param + RLS backstop user_id=auth.uid() |
| 7 | No active Journey session | DENIED | get_crew_locations: no status='active' row -> 0 rows |
| 8 | Active session + consent | ALLOWED | get_crew_locations returns rows where permission='granted' |

**These 8 cases define the acceptance test for M4.4.** M4.4 must NOT alter them; it only adds the `member_locations` write path + the location *data* behind the existing gates.

### 4.5 Consent UX (M4.3, no coordinates)
- Owner: "Mulai Journey Mode" button (if can_manage_members). -> start_journey_session.
- Member: upon active Journey, banner "Share your location with the trip?" -> tap "Share lokasiku" creates a `location_permissions` row (`permission='granted'`, `granted_at=now()`); tap "Jangan share" (optional) creates a row with `permission='denied'`, `revoked_at=now()` (audit trail). No row is created merely by joining or by viewing the banner — consent is explicit.
- Owner never sees this banner for other members (only themself); no member-level consent UI exists for the owner.
- No navigator.geolocation, no position stream, no map pin in M4.3.

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
- Read = `get_crew_locations(p_group_id)` → returns locations ONLY for members whose `location_permissions.permission='granted'` (consent gate from 4.3) AND a `journey_sessions` is `active`. M4.4 adds coordinates behind these existing gates — it does NOT redefine consent/authorization.

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

