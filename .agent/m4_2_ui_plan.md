# M4.2 — Route UI Plan (draft, for founder approval)

**Status:** DRAFT. No frontend/HTML/JS changes yet.
**Prerequisite:** M4.1 Route Data Foundation = DEPLOYED + VERIFIED.
**Principle (founder):** draft UI–data contract first; no coding until approved. M4.2 proves *route is an operational object*, NOT a map.

---

## 0. Grounding — real `trip-planner.html` structure (verified)

- Group view = `#groupView`, rendered by `renderGroupPlanner()` (line 481).
- There is **NO view-tab system** today. Itinerary and Expenses are *stacked sections*, not tabs.
- `day-tabs` (`#groupDayTabs`) are **day selectors** (Hari 1/2/3…), not view switchers.
- Permission state: `colState.perms` (from `API.getTripPermissions(id)`, called in `openGroup` line 471). `applyPermsUI()` (546) toggles buttons by `can_invite` / `is_owner`.
- `openGroup` subscribes realtime to `shared_items` / `group_members` / `group_expenses` (447-449) and polls every 3s.
- `API` (backend/trippi-api.js) does **NOT** yet expose route RPCs → must add: `getRoute`, `createRoute`, `addWaypoint`, `reorderWaypoints`, `deleteWaypoint` (wrapper over M4.1 SECURITY DEFINER functions).

**Implication:** M4.2 adds a *view-tab strip* to `#groupView` and a `routePanel` section. It does NOT touch agenda/expense/auth/group-permission logic.

---

## 1. View-tab strip (new)

Add a tab bar to `#groupView` (above the day-tabs), switching the **main content area**:

```
[ Itinerary ]  [ Route ]  [ Expenses ]
```

- Default = Itinerary (preserves current behavior).
- Selecting a tab shows its section, hides the others.
- *Note on "Overview":* current UI has no separate Overview; Itinerary IS the default view. Founder deck said `Overview | Itinerary | Route | Expenses` — I map that to `Itinerary | Route | Expenses` to avoid inventing a 4th empty view. If you want a distinct Overview, say so.
- Permission gating reused from `colState.perms`:
  - Route tab visible to Owner / Member / Guest (all can VIEW).
  - "Create Route" / "Add Stop" / card actions shown only when `can_edit === true`.
  - Guest (`readOnlyTrip` / `?gt=`): Route shows preview, no edit controls.

---

## 2. Route empty state

When `get_route(group_id)` returns `{route:null, waypoints:[]}`:

```
No route planned yet
Create your journey route:
add starting point, stops, and destination.
[ + Create Route ]   ← only if can_edit
```
Guest: `Route preview will appear here once the crew plans it.` (no button)

---

## 3. Route list view (sequence-ordered cards)

Each waypoint = a card in `route-list` (DOM id `routeList`):

```
🟢 1
Jakarta
START · Day 1
Departure: 06:00
Notes: Meet at parking area

↓

🔵 2
Bromo Sunrise Point
VIEWPOINT · Day 2
ETA: 04:30
Notes: Warm clothes

↓
...
```

Card visual mapping (frontend-only, no schema change):
- Sequence badge color: first=green (START), last=red (END), middle=blue.
- Show: name, `category` (uppercase), `day_number` → "Day N", `estimated_arrival_time` → "ETA", `notes`.
- `latitude/longitude` shown only if present (future map hook — not rendered as map now).

---

## 4. Waypoint card actions (Owner/Member with can_edit)

Per card, a `⋮` menu (or inline buttons):
```
Move up   → reorderWaypoints([…shift up])
Move down → reorderWaypoints([…shift down])
Edit      → openAddWaypoint(editId)
Delete    → deleteWaypoint(id)
```
- Reorder uses `reorderWaypoints(p_route_id, ordered_ids[])` — **never** manual sequence UPDATE from frontend (per founder rule).
- Implementation: compute new ordered id array from current `colState.route.waypoints`, swap positions, call RPC, re-render.

---

## 5. Add / Edit Waypoint modal

Fields:
- **Required:** Name (`groupWpName`), Category (`groupWpCategory` dropdown)
- **Optional:** Day number (`groupWpDay`, number), ETA (`groupWpEta`, time), Notes (`groupWpNotes`, textarea), Latitude (`groupWpLat`, number), Longitude (`groupWpLng`, number)

Category dropdown (sent as `text`, matches M4.1 vocabulary):
`start, stop, food, fuel, rest, stay, activity, viewpoint, end`

If no route exists yet → "Create Route" first creates an ACTIVE route (name defaults to trip name), then opens the waypoint modal.

---

## 6. Permission matrix (reuse existing — NO new permission)

| User | View Route | Add/Edit/Delete |
|---|---|---|
| Owner | Yes | Yes |
| Member | Yes | Yes (`can_edit`) |
| Guest | Yes | No |

Gate all edit controls on `colState.perms.can_edit`. No new RPC/RLS needed — M3 matrix already covers it; M4.1 RLS already enforces server-side.

---

## 7. Data flow

```
openGroup(id)
  ├─ getTripPermissions(id)  → colState.perms   (EXISTS)
  └─ loadRoute(id)           → get_route(id)    (NEW: calls API.getRoute)
        └─ colState.route = {route, waypoints}
        └─ renderRoute()

renderRoute():
  if no route → empty state (with/without Create button by can_edit)
  else → render sequence cards + actions
```

Realtime: add `route_waypoints` + `group_routes` to the `openGroup` postgres_changes subscription (same pattern as shared_items) so crew edits appear live.

---

## 8. Frontend functions to add (minimal, isolated)

```js
loadRoute(groupId)          // API.getRoute → colState.route
renderRoute()               // paint routeList + empty state
openAddWaypoint(editId?)    // modal open (create or edit)
saveWaypoint(event)         // create route if needed → add_waypoint / update
moveWaypoint(id, dir)       // reorderWaypoints with swapped array
deleteWaypoint(id)          // API.deleteWaypoint → re-render
```

Backend (`trippi-api.js`) additions:
```js
getRoute(groupId)        // get_route RPC
createRoute(groupId,name) // create_route RPC
addWaypoint(routeId,obj) // add_waypoint RPC
reorderWaypoints(rid,ids)// reorder_waypoints RPC
deleteWaypoint(id)       // delete from route_waypoints (member can delete own?→ owner/member per RLS)
```

**Do NOT touch:** expense logic, agenda logic, auth, group-permission UI, `applyPermsUI` internals (only extend to hide/show Route edit controls).

---

## 9. Future compatibility (no schema change needed)

- **Map:** `route_waypoints.lat/lng` → Leaflet pins + polyline later. M4.2 renders nothing map-like.
- **Journey Mode:** current location → nearest waypoint → progress (M4.3/4.4).
- **Investor story:** "Each trip has a structured journey route that later powers navigation, crew coordination, and live travel mode."

---

## 10. Open questions for founder
1. Tab strip = `Itinerary | Route | Expenses` (drop separate Overview) — OK?
2. Reorder UX: `⋮` menu vs always-visible ▲▼ buttons? (propose ▲▼ inline for mobile simplicity)
3. "Create Route" default name = trip name (`g.name`)? Or prompt? (propose trip name, editable later)
4. Show lat/lng on card if present, or hide until M4 map? (propose hide, keep in edit modal only)
