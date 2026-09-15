# Save Trip Feature — Phase 1 Audit Report

**Date:** 2026-09-15
**Status:** Audit complete — ready to implement

---

## Root Cause / Existing Architecture

### Two parallel trip systems currently exist

**Personal trips** (no `groupId`):
- Local state: `state.trips[]` in `trip-planner.html`
- Persistence: `localStorage` key `markicab_personal_planner_v2`
- Server sync: best-effort dual-write via `syncTrip()` → `trips` table
- **Source of truth: localStorage** — `load()` reads ONLY from localStorage on startup

**Collaborative trips** (with `groupId`):
- Server state: `groups` table + `shared_items` table + `group_members`
- Client: `colState` populated via `openGroup()` + realtime subscriptions
- **Source of truth: Supabase** — always fetched fresh on load

### Current `trips` table columns
```
id            uuid PK (gen_random_uuid)
user_id       uuid FK auth.users NOT NULL
name          text NOT NULL default ''
destination   text NOT NULL default ''
start_date    date nullable
end_date      date nullable
note          text NOT NULL default ''
local_id      text nullable
created_at    timestamptz NOT NULL default now()
updated_at    timestamptz NOT NULL default now()
```

### Current `state.trips[]` item shape
```js
{
  id: 'uuid',
  name: 'Trip name',
  destination: '',
  start: '2026-01-01',
  end: '2026-01-03',
  note: '',
  groupId: null,        // set if collaborative
  serverId: 'uuid',     // Supabase id
  items: [...],         // agenda items
  expenses: [...],
  wishlists: [...],
  isGroup: false,
  supabase_trip_id: 'uuid'
}
```

### Source-of-truth risk identified
Personal trips use localStorage as the list's source of truth. A trip deleted on another device WILL reappear on this device until page reload, and even then `load()` only reads localStorage. This is acceptable for personal trips (single-device assumption) but **must not** carry over to Saved Trips.

---

## Files to Change

| File | Change |
|---|---|
| `supabase/migrations/20260915_save_trips.sql` | New: `saved_trips` table + RLS |
| `backend/markicab-api.js` | New: `saveTrip`, `listSavedTrips`, `getSavedTrip`, `deleteSavedTrip` |
| `trip-planner.html` | New: Save Trip UI + Saved Trips view + detail view |
| `markicab-sw.js` | Bump CACHE_VERSION to v19 |

---

## Database Design

### New table: `saved_trips`

```sql
CREATE TABLE IF NOT EXISTS public.saved_trips (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  destination text NOT NULL DEFAULT '',
  snapshot   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_trips_user ON public.saved_trips(user_id, updated_at DESC);
```

### RLS

```sql
ALTER TABLE public.saved_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_trips_select ON public.saved_trips
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY saved_trips_insert ON public.saved_trips
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY saved_trips_update ON public.saved_trips
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY saved_trips_delete ON public.saved_trips
  FOR DELETE USING (user_id = auth.uid());
```

### `snapshot` jsonb structure (minimal)
```js
{
  name: 'Bandung Weekend',
  destination: 'Bandung',
  start: '2026-02-01',
  end: '2026-02-03',
  note: '',
  items: [
    { date: '2026-02-01', title: 'Jakarta → Bandung', time: '08:00', link: '', note: '', budget: 0 }
  ]
}
```

**Not included in snapshot:** group state, journey sessions, expenses, member locations, map state, Leaflet state, auth state, wishlists (separate concern).

---

## Save Flow

```
User clicks [Save Trip] in Plan view
  → show modal asking for title (prefill with trip name)
  → build snapshot from current trip's items
  → API.saveTrip({ title, destination, snapshot })
  → INSERT saved_trips
  → DB confirms → show success toast
  → NO local storage of the saved trip record
```

## List Flow

```
User opens Saved Trips view (from Home nav or Plan view)
  → show loading state
  → API.listSavedTrips()
  → SELECT WHERE user_id = auth.uid() ORDER BY updated_at DESC
  → REPLACE client state with DB response
  → render list (title, destination, day count, item count)
  → NEVER initialize from localStorage
```

## Open / Detail Flow

```
User clicks [Open] on a saved trip
  → API.getSavedTrip(id)
  → render detail view with day-grouped itinerary
  → show [Use this trip] and [Delete] buttons
```

## Use-as-new-trip Flow

```
User clicks [Use this trip] on detail view
  → build a new canonical Trip from snapshot
  → existing createGroupDirectly() or openTrip() flow
  → NEW trip appears in user's trip list
  → original Saved Trip remains untouched
```

## Delete Flow

```
User clicks [Delete] with confirm dialog
  → API.deleteSavedTrip(id)
  → DB confirms DELETE
  → remove from client state
  → re-render list
  → if DELETE fails, item stays in list
```

## Local Cache Behavior

- **Saved Trips list:** DB is the ONLY source of truth. No localStorage persistence.
- **View cache:** `colState` may temporarily hold fetched data for rendering, but it is always replaced on re-fetch.
- **No resurrection:** If a saved trip is deleted on another device, the next list fetch will not include it. There is no local backup.

## Cross-device Consistency

The design inherently satisfies the critical requirement:
1. Saved Trip is INSERTed into DB on save.
2. Saved Trip is DELETEd from DB on delete.
3. Every device always fetches the latest from DB on list view.
4. There is no local fallback that could resurrect deleted records.

## Privacy

- RLS ensures user isolation: `user_id = auth.uid()` on all policies.
- No broad/public SELECT policies.
- No bypassing RLS from frontend.

---

## Scope Constraints (from spec)

✅ Single table
✅ Minimal RLS (4 policies)
✅ Minimal CRUD API (4 functions)
✅ Simple UI (Save button + list + detail + use/delete)
✅ No offline-first, sync engine, event sourcing, conflict resolution, route engine, or collaboration

✅ Does NOT modify:
- Journey Map lifecycle
- MapRenderer
- realtime location architecture
- Expense business logic
- Journey session state

---

## Ready to implement.
