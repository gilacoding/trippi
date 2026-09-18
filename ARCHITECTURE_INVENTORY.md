# trip-planner.html Architecture Inventory — Phase 1

**File:** `D:/HERMES WORKS/TRIPPi/TRIPPY/trippi-deploy/trip-planner.html`
**Lines:** 5070 (~367KB) | **CSS-only <style> block:** lines 53–940
**Task:** t_a3006bbc | **Date:** 2026-09-18 | **No refactoring performed**

---

## 1. Document Structure

```
<!DOCTYPE html>
 <head>                                (lines 1-940)
   meta charset, viewport, theme-color
   Supabase config script (window.__MARKICAB_SUPABASE__)  ← lines 14-21
   External scripts (toast, mc-confirm, explore-catalog,
                     avatar-crop)                           ← lines 22-25
   Toast/alert/confirm wrapper script                      ← lines 26-49
   Google Fonts preconnect + Outfit/Poppins                ← lines 50-52
   <style>  (inlined, 887 lines — the visual system)       ← lines 53-940
 </head>
 <body>                                               (lines 942-5068)
   header (globalBack, globalTitle, savedEntryBtn, headerAvatar)
   bottom-nav (4 tabs: home/explore/gallery/journey)
   modals: authModal, profileModal, importModal, groupSettingsModal,
           editTripModal, saveTripModal, avatarCropModal
   13 view sections:
     #homeView | #newTripView | #plannerView | #savedTripsView |
     #historyView | #savedTripDetailView | #guestView | #groupView |
     #exploreView | #galleryView | #journeyView | #exploreDetailView
   camera overlay (hidden)
 </body>
 <script src="supabase-js CDN">                     ← line 1423
 <script src="markicab-ls-migrate.js">              ← line 1424  (migration)
 <script src="assets/js/map-renderer.js">          ← line 1425  (Leaflet crew map)
 <script src="backend/supabase-client.js">         ← line 1426  (MarkiBackend init)
 <script src="backend/markicab-api.js">            ← line 1427  (MarkiAPI boundary)
 <script src="backend/canonical-adapter.js">       ← line 1428  (import → pipeline)
 <script src="backend/json-import-parser.js">      ← line 1429  (flexible JSON parse)
 <script src="lzstring.js">                        ← line 1430  (hash deep-link)
 <script src="assets/js/utils.js">                 ← line 1431  (window.utils)
 <script src="assets/js/import-parser.js">         ← line 1432  (window.importParser)
 <script src="assets/js/gallery-lightbox.js">      ← line 1433  (see gallery.js)
 <script src="assets/js/gallery.js">               ← line 1434  (window.gallery)
 <script src="assets/js/sync.js">                  ← line 1435  (window.MarkiSync)
 <script src="assets/js/trip-domain.js">           ← line 1436  (window.TripDomain)
 <script>                                             ← line 1437  (Script 1, inline — CORE)
   state ── line 1440
   colState ── line 1448
   → 164 function declarations + 10 arrow/assigned functions
   → 13 window.X exports
   → 327 var/let/const declarations
   → startup gate (lines 4256-4299): auth check, URL params, SW, renderHome
 </script>                                           ← line 4300
 <script>                                             ← line 4301  (Script 2, inline — AUTH/UI)
   openAuth, closeAuth, renderMode, profile, import,
   gallery, nav wiring, bottom-nav, deep links
   → 36 function declarations
   → 17 window.X exports
 </script>                                           ← line 4976
 <script>                                             ← line 4978  (Script 3, inline — EXPLORE)
   openExploreView, openExploreDetail, saveExploreTrip,
   renderExploreList
   → 4 function declarations
   → 4 window.X exports
 </script>                                           ← line 5067
</html>                                              ← line 5070
```

---

## 2. External Script Load Order & Dependencies

| # | Script | What it exposes | Depends on |
|---|--------|-----------------|------------|
| 0 | inline: Supabase config (14-21) | `window.__MARKICAB_SUPABASE__` | — |
| 1 | toast.js | `mcToast` | — |
| 2 | mc-confirm.js | `mcConfirmImpl` | — |
| 3 | explore-catalog.js | `window.EXPLORE_CATALOG` | — |
| 4 | avatar-crop.js | `window.AvatarCrop.mount()` | — |
| 5 | inline: alert/confirm wrapper (26-49) | `window.mcConfirm` override | toast.js, mc-confirm.js |
| 6 | supabase-js CDN (1423) | `window.supabase` | — |
| 7 | markicab-ls-migrate.js (1424) | `window.__markicabLS` | localStorage |
| 8 | map-renderer.js (1425) | `MapRenderer` ctor + `init/setMarkers/fitToMarkers/clearMarkers/destroy` | Leaflet (lazy-loaded) |
| 9 | supabase-client.js (1426) | `window.MarkiBackend = {ready, config, client, init()}` | supabase-js, `window.__MARKICAB_SUPABASE__` |
| 10 | markicab-api.js (1427) | `window.MarkiAPI = API` (100+ methods) | `window.MarkiBackend` |
| 11 | canonical-adapter.js (1428) | `window.MarkicabCanonicalAdapter` | needs `setContext(ctx)` called by host; uses `state`, `colState`, `API`, `save`, `syncTrip`, `ensureAuth`, `openTrip`, `openGroup`, `renderHome`, `normalizeLink` |
| 12 | json-import-parser.js (1429) | `window.JSONImportParser` | — |
| 13 | lzstring.js (1430) | `LZString` | — |
| 14 | utils.js (1431) | `window.utils = {esc, money, dateText, normalizeLink, daysBetween, categoryIcon, tripBgCat, isPlaceholderName, humanErr}` | — |
| 15 | import-parser.js (1432) | `window.importParser` | `window.JSONImportParser` |
| 16 | gallery-lightbox.js (1433) | `window.galleryLightbox` | — |
| 17 | gallery.js (1434) | `window.gallery` (init/loadGallery/renderGallery/openLightbox/closeLightbox/capturePhoto) | `window.galleryLightbox`, `window.MarkiAPI`, `window.utils`, `window.colState` |
| 18 | sync.js (1435) | `window.MarkiSync` (sync, reconcile, auth hydration, guest sync, teardown) | `window.state`, `window.colState`, `window.MarkiAPI` |
| 19 | trip-domain.js (1436) | `window.TripDomain = {tripStatus, getTrip}` | `window.state` (read-only) |
| 20 | Script 1 inline (1437) | core app — all functions | scripts 7-19 above |
| 21 | Script 2 inline (4301) | auth/UI/gall/navigation | Script 1's window exports + external scripts |
| 22 | Script 3 inline (4978) | explore view | Script 2's nav wiring + EXPLORE_CATALOG |

**Loading order failure risk:** scripts 7-10 (supabase client chain) must complete before `MarkiAPI` is usable. Script 1 reads `window.MarkiAPI` at line 1447 — if supabase-js CDN fails or `MarkiBackend.init()` rejects, `API` is still assigned but every call returns `{error}`. Scripts 14-19 are pure utils/domain/sync — they fail silently or expose `null` callers. `map-renderer.js` (1425) lazy-loads Leaflet on `init()` — no startup blocker.

---

## 3. Global State Ownership

### 3a. `state` (line 1440) — local trip state, owned by Script 1

```js
const state = {
  trips: [],           // personal trip objects (localStorage + optional Supabase)
  toGo: [],            // saved places (localStorage only)
  activeTripId: null,  // id of currently-open trip (local)
  activeDate: null,    // currently-selected date
  pendingToGoId: null, // to-go item queued for next new trip
  editTripId: null,    // trip being edited via #editTripModal
  readOnlyTrip: null   // shared trip opened via hash/deep link (owner ≠ current user)
};
```

**Owner:** Script 1 (inline 1437-4300). Reassigned never — only mutated in place.
**Consumers:** Script 1 functions (`getTrip`, `renderPlanner`, `renderHome`, `renderHistoryView`, etc.), Script 2 (`openTrip` call via window), Script 3 (explore save via `API.saveTrip`).
**Persistence:** `save()` (line 1478) writes `{trips, toGo}` to `localStorage[STORE_KEY]` (markicab_personal_planner_v2). `load()` (line 1479) reads it on startup, falling back to LEGACY_STORE_KEY.

### 3b. `colState` (line 1448) — collaborative + session state, owned by Script 1

```js
const colState = {
  uid: null,           // current auth user id (set by auth flow)
  name: null,          // current user's display name
  group: null,         // current group object (when in group view / guest post-join)
  items: [],           // shared itinerary items (group view)
  wishlists: [],       // group wishlist items
  members: [],         // group_members rows
  expenses: [],        // group expenses (trip + personal)
  gallery: [],         // gallery photos/videos for current group
  nameMap: {},         // uid→display_name cache (per-trip snapshot fallback)
  identities: {},      // uid→{name, role, is_anonymous, avatar_url} (P0.7 canonical)
  activeDate: null,    // current date in group view
  channel: null,       // Supabase realtime channel (group view)
  poll: null,          // setInterval handle (group reconciliation)
  locationChannel: null, // realtime channel for member_locations (M4.5.6)
  userAvatarUrl: null, // signed avatar URL
  journey: null,       // {status:'planned'|'active'} (M4.5)
  locationConsent: null, // 'granted'|'denied'|'unknown' (M4.5)
  locationWatchId: null, // Geolocation watch handle
  crewLocations: [],  // {user_id, latitude, longitude, ...}
  isGuest: false,     // true when URL has ?gt= (set at line 2753, cleared at 1625)
  guestChannel: null, // guest realtime channel
  guestPoll: null,    // guest poll interval
  _subscribedOnce: false,
  _reconciling: false,
  _reconcileAgain: false,
  _guestReconciling: false,
  _guestReconcileAgain: false,
  _guestTrip: null,   // cached guest trip object
  _syncRecoveryWired: false,
  avatarCache: {},    // uid→{url, failed} (set by ensureAvatarUrls)
  avatarPending: {},  // uid→in-flight (set by ensureAvatarUrls)
  perms: null         // {is_owner, can_edit, can_edit_itinerary, can_edit_expense,
                      //  can_invite, can_manage_members, can_add_itinerary} (group view)
};
```

**Owner:** Script 1 (inline). Never reassigned as a whole — keys mutated in place.
**Consumers:** All of Script 1, Script 2 (auth/profile/import/gall — read + write uid/name/group), Script 3 (read group/exploration). `window.colState` exported at line 4294 — accessible to any script.
**Persistence:** NOT directly persisted. Group data comes from Supabase RPCs (openGroup → loadShared/loadMembers/loadExpenses → reconcileTrip). Local cache is ephemeral.

### 3c. `window.__MARKICAB_SUPABASE__` (lines 17-20) — Supabase config, set in `<head>`

```js
window.__MARKICAB_SUPABASE__ = { url, anonKey }
```

**Owner:** inline `<script>` in head. Also settable via `<meta>` tags in `supabase-client.js`.
**Read by:** `supabase-client.js` → `MarkiBackend`, then `markicab-api.js` → `MarkiAPI`.

### 3d. `window.MarkiAPI` / `window.MarkiSync` / `window.TripDomain` / `window.utils` / `window.gallery` / `window.importParser` / `window.EXPLORE_CATALOG` / `window.MarkicabCanonicalAdapter` / `LZString`

All are read-only interfaces produced by external scripts. Host (trip-planner.html) consumes them, never mutates their shapes.

---

## 4. Script 1 — Core App Logic (lines 1437-4300, 2864 lines)

### 4a. Initialization (top of Script 1)

- **lines 1438-1479:** Constants + state init (`STORE_KEY`, `LEGACY_STORE_KEY`, `state`, `$`, `dbg`, `esc`, tripBgCat, `API`, `colState`, `logEvent`, `loadName/saveName/displayName`, `MIG_KEY`, `SYNC_VERSION`, `getMig/setMig`, `_syncTimer`, `scheduleSync`, `save`, `load`)
- **lines 1481-1500:** Guest mode vars + `isGuest()`, `openGuestTrip(token)`, `lockNavForGuest()`, `unlockNav()`
- **lines 1501-1650:** `renderGuestView`, `renderGuestItinerary`, `rowHtml`, `syncTrip` (delegates to MarkiSync), `syncActiveTrip`, `backfillAndSync`, `verifySync`, `onSessionReady`, `loadServerGroups`, `loadPersonalTrips`, `tripStatus` (delegates to TripDomain), `getTrip` (delegates to TripDomain), `show(view)`, `openSharedTrip`, `updateHeaderAvatar`, `applyUserAvatar`, `navigateHome`, `renderHome`
- **lines 1651-1751:** `renderGuestLocationActions`, `renderGuestItinerary`
- **lines 1752-1898:** `renderGuestItinerary` (cont.), `syncTrip` relay functions (lines 1822-1829), `daysBetween`, `tripStatus`, `getTrip`, `show`, `openSharedTrip`, `updateHeaderAvatar`, `applyUserAvatar`, `navigateHome`, `renderHome`

### 4b. Navigation & session gate (lines 4256-4299)

The IIFE at lines 4259-4299 is the **single startup gate**:

```
1. Check URL params: ?gt= (guest token), ?group= (group id), ?mode= (auth mode),
   location.hash (#t=, #trip= deep link)
2. If no direct-link params:
   a. API.getSession() → if session.user exists AND not anonymous:
      - load() (localStorage restore)
      - renderHome()
      - applyUserAvatar()
   b. Else if mode==='signup'|'login':
      - history.replaceState
      - window.__initialAuthMode = mode
      - renderHome()
      - if window.openAuth is defined, call it
   c. Else: location.replace('index.html')  ← not logged in, no intent → landing page
   d. On API error: load() + renderHome()  ← offline fallback
3. If direct-link params present:
   - load() + renderHome()  ← proceed normally
4. Export window APIs: makeGroupFromTrip, renderHome, load, state, colState, openGroup, openTrip, show
```

**Failure modes that block startup:** None. The gate degrades gracefully: `getSession()` rejection → offline fallback (load+renderHome); no session → `index.html` redirect; guest/group params → app loads regardless.

**Side effects:** Service worker registration with update-checking (lines 4211-4255) runs unconditionally if `'serviceWorker' in navigator`. It catches its own errors.

### 4c. Trip creation & editing (lines 1975-2107)

- `openTrip(id)` (1975) — tear down group session, set activeTripId, renderPlanner, show plannerView
- `renderPlanner()` (1992) — full planner render: name, meta, stats, day tabs, itinerary for active date, expenses
- `deleteItem(id)` (2003) — with confirmation, group vs personal path
- `editInline(el, field, type)` (2023) — inline edit for time/budget
- `addOrUpdateTrip(event)` (2036) — form submit: new trip (createGroupDirectly) or edit existing
- `createGroupDirectly(name, destination, start, end, note, pendingToGoId)` (2090) — creates a group trip, joins as owner
- `addAgenda(event)` (2108) — push to local trip.items, save, syncTrip
- `renderExpenses()` (2110) — render personal expenses for active date
- `addExpense(event)` (2111) — push to local trip.expenses, save, syncTrip
- `deleteExpense(id)` (2112) — remove, save, sync/Group API
- `renderToGo()` (2128) — render saved places list
- `addToGo(event)` (2129) — push to state.toGo, save
- `scheduleToGo(id)` (2130) — queue toGo item for next trip creation
- `editTrip()` (2131) — set editTripId, populate form, show newTripView
- `shareGroup()` (2139) — invite flow: confirm → makeGroupFromTrip → copy link

### 4d. Group session lifecycle (lines 2221-2354)

- `joinGroup(id)` (2221) — ensureAuth → getGroup → isMember check → joinGroup API → openGroup
- `openGroup(id, fresh, trip)` (2258) — THE group session entry point:
  1. ensureAuth (must have uid)
  2. getGroup (retry once after 2s for fresh-join latency)
  3. teardownGroupSession() (cleanup previous session)
  4. colState.group = g
  5. show('groupView')
  6. Create realtime channel with invalidation handlers (postgres_changes on shared_items, group_members, group_expenses, wishlist_items, journey_sessions, member_locations)
  7. Subscribe with 8s timeout
  8. Set colState.channel, start poll (5s reconcile)
  9. installSyncRecovery()
  10. If fresh+trip: copy items + expenses via batch APIs
  11. getTripPermissions → colState.perms
  12. loadShared + loadMembers + loadGroupExpenses + loadIdentities + loadWishlists
  13. renderGroupPlanner + applyPermsUI

### 4e. Reconciliation contract (lines 2355-2381)

- `loadShared(id)` → MarkiSync.loadShared
- `loadMembers(id)` → MarkiSync.loadMembers
- `reconcileTrip(reason)` → MarkiSync.reconcileTrip (the ONE reconciliation path: realtime, poll, focus, visibility, reconnect all funnel here)
- `installSyncRecovery()` → MarkiSync.installSyncRecovery (visibilitychange/focus/online → routeReconcile)
- `routeReconcile(reason)` → MarkiSync.routeReconcile (routes to guest or member path)
- `loadGroupExpenses(id)` → MarkiSync.loadGroupExpenses
- `loadWishlists(id)` (2384) — API.listWishlists + renderGroupWishlist

### 4f. Group rendering (lines 2458-2753)

- `addWishlist(event)` (2458) — group wishlist form submit
- `showConvertDialog(wishlistId)` (2429) — creator-only wishlist→itinerary conversion
- `seedIdentities(rows)` (2483) — populate colState.nameMap from member rows
- `loadIdentities(groupId)` (2500) — API.getGroupIdentities → colState.identities map
- `resolveIdentity(userId)` (2526) — THE single resolver: profiles → members → nameMap → session name. Returns {id, name, role, isGuest, isAnonymous, avatar, status}
- `nameOfOrNull(uid)` (2619) — calls resolveIdentity, returns .name or null
- `nameOf(uid)` (2624) — nameOfOrNull || 'Tanpa nama'
- `roleLabelOf(uid)` (2629) — resolveIdentity(uid).role
- `ensureAvatarUrls(userIds)` (2565) — batch-fetch signed URLs, cache in colState.avatarCache
- `avatarUrlFor(userId)` — reads colState.avatarCache
- `avatarChip(userId, name, extraClass)` (2601) — render avatar chip (img or initial)
- `locationStatusOf(userId)` (2611) — Online/Offline/Tidak berbagi from crewLocations
- `renderGroupPlanner()` (2634) — full group planner:
  - group name/meta/stats
  - crew stack (avatar chips)
  - day tabs
  - itinerary items (with inline edit/delete wiring based on perms)
  - renderMembers (Crew)
  - populatePayerSelect
  - renderJourneyContent (Crew panel pre-render)
  - renderGroupMembersList
  - renderCrewStatusList
- `renderGroupExpenses()` (2677) — trip + personal expenses, totals
- `renderGroupMembersList()` (2697) — members panel
- `populatePayerSelect()` (2731) — payer dropdown
- `creatorName()` (2738) — trip creator display name
- Journey mode state init (2749-2753): `colState.journey = null`, `locationConsent = null`, `locationWatchId = null`, `crewLocations = []`, `isGuest = location.search.includes('gt=')`
- `renderMembers()` (3653) — legacy redirect to Crew

### 4g. Journey Mode (lines 2757-3218)

- `renderJourneyView()` (2757) — async:
  1. Check API.getCrewLocations() to probe journey state
  2. Set colState.journey + colState.locationConsent + colState.crewLocations
  3. renderJourneyContent()
  4. If active: loadCrewMap(), invalidateSize(), startCrewRefresh(), initJourneyRealtime(), installLocationLifecycleHandlers(), startLocationWatch()
  5. If not active: stopCrewRefresh(), stopJourneyRealtime(), stopLocationWatch()
- `renderJourneyContent()` (2822) — HTML generation for journey panel:
  - Journey badge (active/inactive, owner vs member)
  - Consent banner (if active, !granted)
  - Crew map container + crew status list
  - Wire buttons: start/end journey, share/deny/stop location
- `refreshJourneyUI()` (2894) — routes to guest or member path
- `editGroupTrip()` (2906) — owner-only, opens editTripModal
- `openEditTripModal(g)` / `closeEditTripModal()` / `saveEditTrip(event)` (2917-2966) — edit trip modal flow
- `startJourneyMode()` (3046) — API.startJourney() → colState.journey={status:'active'} → setTimeout renderJourneyView 500ms
- `endJourneyMode()` (3058) — API.endJourney() → clear state, stop everything, renderJourneyView
- `shareLocationHandler()` (3073) — grantLocationConsent → getCurrentPosition → upsertMemberLocation → startLocationWatch → refreshJourneyUI
- `denyLocationHandler()` (3113) — revokeLocationConsent → refreshJourneyUI
- `stopSharingHandler()` (3122) — revokeLocationConsent → stopLocationWatch → refreshJourneyUI
- `startLocationWatch()` (3134) — Geolocation watchPosition with adaptive interval (moved → 30s, static → 300s)
- `stopLocationWatch()` (3172) — clearWatch
- `seedGuestContext(t)` (3183) — seed group + members + identities + uid for guest post-join
- `reconcileGuestTrip(reason)` (3213) — guest reconciliation relay
- `initGuestRealtime()` (3215) — guest realtime relay
- `teardownGuestSession()` (3217) — guest teardown relay
- `renderGuestWishlist()` (3220) — load + render guest wishlist
- `wireGuestWishlist()` (3260) — wire guest wishlist form
- `wireGuestLeave()` (3299) — guest leave button
- `installLocationLifecycleHandlers()` (3320+) — refreshJourneyUI on focus/visibility change

### 4h. Crew / location (lines 3346-3639)

- `loadCrewMap()` (3346) — API.getCrewLocations → colState.crewLocations → init MapRenderer if needed → setMarkers + fitToMarkers
- `renderCrewMarkers(points)` (3404) — grid + pin markers (pure HTML, no Leaflet)
- `isFreshLocation(m)` (3445) — < 2 minutes = fresh
- `distanceMeters(a, b)` (3452) — Haversine
- `fmtDistance(m)` (3462) — meters/km formatting
- `crewRows()` (3474) — build crew rows from members ∪ crewLocations (dedup by uid)
- `renderCrewStatusList()` (3497) — render crew list with status dots + distances
- `removeMemberFromCrew(uid)` (3534) — API.removeMember → reload + re-render
- `hideCrewMap()` (3552) — hide display only, don't destroy Leaflet
- `updateCrewStatus()` (3561) — "N online" label
- `startCrewRefresh()` (3571) — 10s interval loadCrewMap (adaptive fallback; realtime is primary)
- `stopCrewRefresh()` (3579) — clearInterval
- `initJourneyRealtime()` (3587) — realtime subscription to member_locations (M4.5.6)
- `stopJourneyRealtime()` (3633) — removeChannel

### 4i. Group CRUD / permissions (lines 3663-3691)

- `addGroupAgenda(event)` (3663) — API.addItem → loadShared
- `addGroupExpense(event)` (3664) — API.addExpense → loadGroupExpenses, populatePayerSelect, updateExpTypeUI
- `editGroupTime(el)` (3668) — inline time edit via API.updateItem
- `editGroupCost(el)` (3669) — inline budget edit via API.updateItem
- `removeGroupItem(id)` (3670) — API.deleteItem
- `removeGroupExpense(id)` (3671) — API.deleteExpense
- `leaveGroup()` (3672) — owner: deleteGroup; member: leaveGroup → state.trips filter → save → navigateHome
- `teardownGroupSession()` (3691) — MarkiSync.teardownGroupSession relay

### 4j. Route (M4.2, hidden UI) (lines 3693-3767)

- `loadRoute(groupId)` (3694) — API.getRoute → colState.route → renderRoute (route panel hidden, only runs if element exists)
- `renderRoute()` (3706) — route cards with up/down/delete
- `moveWaypoint(id, dir)` (3740) — API.reorderWaypoints → loadRoute
- `deleteWaypoint(id)` (3757) — API.deleteWaypoint → loadRoute
- `openAddWaypoint()` (3764) — open addWaypointPanel
- Note: route UI is hidden (createRouteBtn display:none set at line 4094 `applyPermsUI`). Backend preserved.

### 4k. Save Trip (V1) (lines 3776-3924)

- `_savedTrips` array (line 3778) — cached from DB
- `openSaveTripModal()` (3780) — populate form from getTrip()
- `closeSaveTripModal()` (3789)
- `confirmSaveTrip()` (3793) — build snapshot from trip.items → API.saveTrip → alert
- `openSavedTrips()` (3818) — show savedTripsView, loadSavedTrips
- `loadSavedTrips()` (3826) — API.listSavedTrips → _savedTrips → render
- `openSavedTripDetail(id)` (3860) — API.getSavedTrip → render saved trip detail view with day tabs + itinerary
- `renderSavedDay(day)` (3896/4008) — render itinerary for a day (DEFINED TWICE — duplicate at 3896 and 4008; the second one is inside initSavedDateEdit's nested scope; first one at 3896 is the actual renderer used by day tab clicks)
- `initSavedDateEdit(snap)` (3926) — enable date editing on saved trip detail
- `startSavedDateEdit()` (3949) — show date inputs
- `saveSavedDateEdit()` (3977) — save date changes via API.updateSavedTrip
- `useSavedTrip()` (4020) — open edit modal pre-populated from saved trip
- `deleteSavedTripConfirm()` (4031) — API.deleteSavedTrip → remove from list
- `applyPermsUI()` (4083) — wire permission-based UI visibility (invite btn, share btn, leave btn label, edit btn, add agenda panel, add expense panel, group settings btn)

### 4l. Deep links / hash (lines 4106-4114)

- `openFromHash()` (4106) — `#t=` (LZString compressed) or `#trip=` (plain JSON) → openSharedTrip
- Wire all button handlers (lines 4108-4162):
  - newTripBtn → show newTripView
  - data-home buttons → navigateHome
  - tripForm → addOrUpdateTrip
  - agendaForm → addAgenda
  - expenseForm → addExpense
  - toGoForm → addToGo
  - cancelAgenda/cancelExpense/cancelToGo → reset + close panel
  - copyTrip → navigator.clipboard.writeText(itineraryText())
  - printTrip → window.print()
  - deleteTrip → confirm → deleteTripFromServer → state.trips filter → save → navigateHome
  - editTripBtn → editTrip
  - shareTrip → shareGroup
  - saveTripBtn → openSaveTripModal
  - toGoSearch → renderToGo
  - makeGroupBtn → makeGroupFromTrip
  - inviteGroupBtn → shareGroup
  - leaveGroupBtn → leaveGroup
  - editGroupBtn → editGroupTrip
  - groupAgendaForm → addGroupAgenda
  - groupExpenseForm → addGroupExpense
  - groupWishlistForm → addWishlist
  - groupViewTabs → switch panels (itinerary/route/expenses/journey/wishlist/gallery)
  - createRouteBtn → createRoute → loadRoute → openAddWaypoint
  - waypointForm → addWaypoint → loadRoute
  - cancelWaypoint → reset

### 4m. deleteTripFromServer(t) (4108)

- If isGroup + serverId: API.deleteGroup → also drop shadow personal row (supabase_trip_id)
- Else if supabase_trip_id: API.deleteTrip
- Else: local-only, no server call

### 4n. Startup guest/group auto-open (lines 4191-4203)

- `(async()=>{ const gt = URLSearchParams.get('gt'); if(gt){ pendingGuestToken=gt; await openGuestTrip(gt); }})()` — runs at script parse time
- `(async()=>{ const gid = URLSearchParams.get('group'); if(gid){ await joinGroup(gid); }})()` — runs at script parse time

These run BEFORE the auth gate IIFE at 4259. If `gt=` is present, `openGuestTrip` fires immediately. If `group=` is present, `joinGroup` fires (which calls ensureAuth → may trigger auth flow).

### 4o. Service worker (lines 4204-4255)

- reg.update() on load, focus, visibilitychange, 15min interval
- updatefound → SKIP_WAITING message on installed+waiting worker
- controllerchange → reload once (guarded by swReloaded flag)
- All errors caught and swallowed

### 4p. Auth gate IIFE (lines 4259-4299) — see Section 4b

---

## 5. Script 2 — Auth UX / Profile / Import / Gallery / Navigation (lines 4301-4976, 676 lines)

### 5a. Auth modal (lines 4303-4404)

IIFE scope:
- `API` = window.MarkiAPI (line 4304)
- `css` injected into head for .auth-modal/.auth-card styles (line 4306-4308)
- State vars: `pendingAction`, `mode`, `modal`, `form`, `errEl`, `noteEl`, `titleEl`, `leadEl`, `submitBtn`, `switchEl`
- `openAuth(m)` (4321) — show modal, set mode, clear fields
- `closeAuth()` (4325) — hide modal; if no uid AND not guest AND no pendingGuestToken → location.replace('index.html')
- `renderMode()` (4335) — toggle login/signup UI
- `form.onsubmit` (4342) — async:
  - **login:** API.signInWithEmail(email,pw) → on error show humanErr; on success SIGNED_IN handled by onAuthChange
  - **signup:**
    - If was anonymous (oldUser.is_anonymous): API.updateUserEmailAndPassword + clearMemberAnonFlag + loadIdentities/renderCrewStatusList + closeAuth + note
    - Else (fresh): API.signUpWithEmail → API.signInWithEmail → on success note + return (SIGNED_IN fires from onAuthChange)
    - On error: humanErr + closeAuth + note
- `authCancel.onclick` = closeAuth
- `__initialAuthMode` handoff (4404): if set, openAuth(_iam) and clear it

### 5b. Profile modal (lines 4407-4489)

- Vars: profileModal, profileNameInput, profileEmailInput, profileTypeInput, profileError, profileNote, profileAvatar, profileAvatarInput, profileNameDisplay, profileEmailDisplay
- Avatar flow (lines 4418-4467):
  - `_uploadAvatarFile(file)` (4430) — API.uploadAvatar → signed URL → update profileAvatar + colState.userAvatarUrl
  - `_openCrop(src)` (4438) — show avatarCropModal, mount AvatarCrop ctrl
  - `_closeCrop()` (4444) — hide modal, revoke blob URL
  - `_startAvatarPick(file)` (4445) — if window.AvatarCrop available → mount + crop; else direct upload
  - profileAvatarInput.onchange → `_startAvatarPick(file)`
  - crop modal wiring: cancel, backdrop click, Escape, save (exportNow → File → _uploadAvatarFile)
- `openProfile()` (4485) — populate modal from session
- `closeProfile()` (4496) — hide modal
- `profileSave` onclick (4523) — API.updateMyProfile(displayName) → colState.name → renderHome (or re-render profile)
- `profileLogout` onclick (4552) — API.signOut → refresh via getSession → if session gone: sign-out handler runs via onAuthChange
- headerAvatar onclick (4520) → openProfile

### 5c. Import modal (lines 4558-4694)

- Vars: importModal, importTextarea, importFeedback, importSubmit, importTripBtn, importCancel
- `renderImportFeedback()` (4579) — parse importTextarea via window.importParser.parseImport → show preview (valid: name, destination, dates, item/expense/wishlist counts) or errors
- importTripBtn.onclick (4616) — open modal, clear
- importCancel.onclick (4617) — close modal
- importTextarea.oninput (4618) — renderImportFeedback on every keystroke
- importSubmit.onclick (4624) — full import flow:
  1. parseImport(text) → res.canonical
  2. confirm summary
  3. MarkicabCanonicalAdapter.setContext({state, colState, API:MarkiAPI, save, syncTrip, ensureAuth, openTrip, openGroup, renderHome, normalizeLink, log, warn})
  4. MarkicabCanonicalAdapter.ingestAndOpen(canonical)
  5. On success: close modal, clear, alert if dates missing
  6. On error: alert

### 5d. Google OAuth (lines 4704-4718)

- googleBtn.onclick: API.signInWithOAuth('google') → on error humanErr; on success with inline session: onAuthChange will fire; otherwise browser redirects

### 5e. Auth state listener (lines 4722-4792)

`API.onAuthChange(function(event, session) {...})` — single handler for ALL auth events:

**SIGNED_IN / session present:**
1. colState.uid = session.user.id
2. headerAvatar.style.display = ''
3. applyUserAvatar()
4. Capture metaName (full_name/name from user_metadata) → saveName + colState.name
5. if NOT anonymous: API.ensureProfile(loadName()||null) → colState.name update
6. If pendingGuestToken AND NOT anonymous: redeemInvitation → openGroup
7. If window.__userAuthAttempt: closeAuth()
8. onSessionReady(uid) (MarkiSync backfill: loadServerGroups, loadPersonalTrips, backfillAndSync)
9. If pendingAction: execute (function or 'makeGroup' string → makeGroupFromTrip)

**SIGNED_OUT / !session:**
- Ignore INITIAL_* events (SDK restoring from storage)
- colState.uid = null
- headerAvatar.textContent = '?'
- If guest or pendingGuestToken: stay put
- Else: location.replace('index.html')

### 5f. Bottom nav wiring (lines 4803-4965)

- setActiveNav(name) — toggle .nav-tab.active, savedEntryBtn at-saved class
- goNav(name) — dispatch by nav name:
  - 'trip' → setActiveNav('trip') + navigateHome('home') + globalTitle='Trip Kamu'
  - 'plan' → if group: openGroup; else if activeTripId/readOnlyTrip: show plannerView; else: home
  - 'journey' → if group: openGroup + click journey tab; else: show journeyView
  - 'saved' → openSavedTrips()
  - 'explore' → openExploreView()
  - 'gallery' → setActiveNav('gallery') + show galleryView + loadGalleryAgg()
- Wire .nav-tab + #savedEntryBtn onclick → goNav(dataset.nav)
- Wire button.back[data-nav] onclick → goNav (fix for saved views)
- Delegated click handler for dynamically-injected back buttons (exploreDetail)
- .explore-entry-link[data-nav] onclick → goNav
- globalBack onclick → setActiveNav('trip') + navigateHome + title + hide
- Override `show()` to sync nav + title on view changes
- setActiveNav('trip') + globalTitle='Trip Kamu' at init

### 5g. Gallery aggregation (lines 4806-4845)

- `_galleryFmtDate(s)`, `_galleryFmtMonth(s)` — formatting helpers
- `loadGalleryAgg()` (4818) — async:
  1. Show loading
  2. If no uid: empty state
  3. API.listMyGroups() → groups
  4. For each group: API.listMedia(group.id) → collect photos/videos
  5. Group by trip, sort by date
  6. Render galleryAgg with trip-year headers + thumbnails
- Wire: galleryUpload toggle, batch upload UI

### 5h. Gallery v1 delegation (lines 4888-4957)

- `wireGalleryDOM()` called on window.gallery (line 4946)
- `loadGallery(id)` → window.gallery.loadGallery(id) — wired to group view gallery tab
- `renderGallery()` → window.gallery.renderGallery()
- `openGalleryLightbox(idx)` → window.galleryLightbox.open(idx, colState.gallery)
- `closeGalleryLightbox()` → window.galleryLightbox.close()
- navigateLightbox, updateLightboxContent delegated to gallery-lightbox.js
- startCamera / stopCamera / capturePhoto wired via gallery.js
- cameraBtn → startCamera (if supported)
- batch upload wired via gallery.js

### 5i. Window exports from Script 2 (lines 4909-4965)

- window.setActiveNav = setActiveNav
- window.goNav = goNav
- window.resolveIdentity = resolveIdentity
- window.loadTrip = load (alias)
- window.openImport = function(){ importModal.style.display='flex' }
- window.showView = show
- window.loadIdentities = loadIdentities
- window.loadGallery = loadGallery
- window.renderGallery = renderGallery
- window.openGalleryLightbox = openGalleryLightbox
- window.closeGalleryLightbox = closeGalleryLightbox

---

## 6. Script 3 — Explore View (lines 4978-5067, 90 lines)

IIFE scope:
- `openExploreView()` (4984) — show exploreView, setActiveNav('explore'), globalTitle='Jelajah', hide back, renderExploreList()
- `openExploreDetail(id)` (4993) — find item in EXPLORE_CATALOG, show exploreDetailView, render hero + body + days + why + save button
- save button onclick → saveExploreTrip(item)
- `saveExploreTrip(item)` (5022) — auth gate (openAuth if no uid) → build snapshot from item.days[].items → API.saveTrip → on success openSavedTrips()
- `renderExploreList()` (5048) — read window.EXPLORE_CATALOG, sort by order, render trip cards with cover bg, type badge, title, destination+duration, summary; wire data-explore clicks → openExploreDetail

**Window exports:** openExploreView, openExploreDetail, saveExploreTrip, renderExploreList

---

## 7. Feature Entry Points

### 7a. URL-driven entry (startup, before auth gate)

| Trigger | Entry point | Action |
|---------|-------------|--------|
| `?gt={token}` | openGuestTrip(token) at line 4194 | Guest view render + lockNav |
| `?group={id}` | joinGroup(id) at line 4199 | ensureAuth → join → openGroup |
| `?mode=signup|login` | captured at 4272-4278 → __initialAuthMode → openAuth(mode) in Script 2 | Auth modal open |
| `#t={lzstring}` / `#trip={json}` | openFromHash() at 4106 | openSharedTrip(trip) |

### 7b. Auth-driven entry (auth gate IIFE, line 4259)

| Condition | Result |
|-----------|--------|
| session.user exists, !is_anonymous | load() + renderHome() + applyUserAvatar() |
| mode==='signup'|'login' | __initialAuthMode + renderHome() + openAuth(mode) |
| no session, no intent | location.replace('index.html') |
| API error | load() + renderHome() (offline fallback) |
| direct link params present | load() + renderHome() (proceed normally) |

### 7c. In-app entry points (after init)

| Feature | Entry | Where wired |
|---------|-------|-------------|
| Create trip | #newTripBtn onclick (4108) | Script 1 |
| Edit trip | #editTripBtn → editTrip() (4114→2131) | Script 1 |
| Save trip | #saveTripBtn → openSaveTripModal() | Script 1 |
| Share trip | #shareTrip → shareGroup() → makeGroupFromTrip() | Script 1 |
| Delete trip | #deleteTrip → confirm → deleteTripFromServer() | Script 1 |
| Buat Trip (header shortcut) | #makeGroupBtn → makeGroupFromTrip() | Script 1 |
| Import trip | #importTripBtn → openImport() / importSubmit | Script 2 |
| Bottom nav | .nav-tab onclick → goNav() | Script 2 |
| Saved entry (header) | #savedEntryBtn → goNav('saved') | Script 2 |
| Explore catalog | #exploreEntry → goNav('explore') / openExploreView | Script 2+3 |
| Guest join | #guestJoinBtn → name form → signInAnonymously + redeemInvitation | Script 1 |
| Guest leave | #guestLeaveBtn → leaveGroup() | Script 1 |
| Gallery upload | #batchSelectBtn / #cameraBtn | gallery.js (wired by Script 2) |
| Journey start/end | #startJourneyBtn / #endJourneyBtn | Script 1 |
| Location consent | #shareLocationBtn / #denyLocationBtn / #stopSharingBtn | Script 1 |
| Group settings | #groupSettingsBtn → openGroupSettings → toggleMembersCanAddItinerary | Script 1 |
| Profile | #headerAvatar → openProfile() | Script 2 |
| Avatar crop | #avatarCropSave → exportNow → _uploadAvatarFile | Script 2 |

---

## 8. Feature-to-Feature Dependencies

```
Auth (Script 2) ──┬──► required by: trip creation, group join, save trip, explore save,
                     guest upgrade, profile, avatar upload, Google OAuth
                    └──► provides: openAuth(), closeAuth(), onAuthChange handler,
                        colState.uid, colState.name, colState.userAvatarUrl

MarkiAPI (backend/markicab-api.js) ──► consumed by: ALL group operations, auth,
                     guest join, journey, expenses, wishlist, gallery, save/import,
                     sync.js, canonical-adapter.js
                     └──► depends on: MarkiBackend (supabase-client.js) → supabase-js

MarkiSync (assets/js/sync.js) ──► consumed by: Script 1 (syncTrip, reconcileTrip,
     loadShared, loadMembers, loadExpenses, onSessionReady, loadServerGroups,
     loadPersonalTrips, teardown, guest sync)
     └──► depends on: window.state, window.colState, window.MarkiAPI

TripDomain (assets/js/trip-domain.js) ─► consumed by: Script 1 (tripStatus, getTrip)
     └──► depends on: window.state (read-only)

utils.js (assets/js/utils.js) ─► consumed by: Script 1 (esc, money, dateText,
     normalizeLink, daysBetween, categoryIcon, tripBgCat, isPlaceholderName, humanErr),
     Script 2 (humanErr in auth), Script 3 (esc, money, dateText)
     └──► NO dependencies

ExploreCatalog (assets/js/explore-catalog.js) ─► consumed by: Script 3 (renderExploreList,
     openExploreDetail, saveExploreTrip uses snapshot from catalog item)
     └──► NO dependencies (pure data array)

MapRenderer (assets/js/map-renderer.js) ─► consumed by: loadCrewMap() in Script 1
     └──► lazy-loads Leaflet; one instance per Journey lifetime

gallery.js + gallery-lightbox.js ─► consumed by: Script 2 (loadGallery, renderGallery,
     open/close lightbox, camera, batch upload)
     └──► depends on: window.MarkiAPI, window.utils, window.colState, window.galleryLightbox

canonical-adapter.js ─► consumed by: Script 2 import flow (ingestAndOpen)
     └──► needs: setContext() called with host state before use; uses: state, colState, API,
        save, syncTrip, ensureAuth, openTrip, openGroup, renderHome, normalizeLink

LZString ─► consumed by: openFromHash() (deep link decompression)
     └──► NO other dependencies

markicab-ls-migrate.js ─► runs at script load (migrateLocalStorageKeys)
     └──► depends on: localStorage only; no interaction with app logic
```

**Cross-feature coupling via colState:**
- Group view requires: `colState.group` (set by openGroup), `colState.items`, `colState.members`, `colState.expenses`, `colState.perms`, `colState.journey`, `colState.crewLocations`, `colState.locationConsent`
- Guest post-join requires: `colState.group`, `colState.members`, `colState.uid`, `colState.identities` (seeded by seedGuestContext)
- Journey Mode requires: `colState.group`, `colState.journey`, `colState.locationConsent`, `colState.crewLocations`, `colState.members` (for crew display)
- Crew status (everywhere) requires: `colState.members`, `colState.crewLocations`, `colState.uid`, `colState.identities` (for resolveIdentity)
- Permissions UI requires: `colState.perms` (set in openGroup after getTripPermissions)

**Cross-feature coupling via window exports:**
- `window.openAuth`, `window.show`, `window.renderHome`, `window.load`, `window.state`, `window.colState`, `window.openGroup`, `window.openTrip`, `window.makeGroupFromTrip`, `window.updateHeaderAvatar` — all from Script 1 (lines 4291-4298), consumed by Script 2 auth gate + Script 2 bottom nav + Script 3 explore save.

---

## 9. Accidental Globals

### 9a. window.alert override (lines 32-38)

```js
var _alert = window.alert;
window.alert = function(msg){ mcToast(m, ...) };
```

**Impact:** Replaces native `alert()` with `mcToast()` for recognized message patterns. Falls back to native if `mcToast` is missing. Native `alert` is saved as `_alert` but never used elsewhere. This is an intentional monkey-patch, not accidental — but it affects ALL code that calls `alert()`, including Script 2's auth flows and Script 1's error paths. The mc-toast CSS (lines 260-268) is self-contained.

### 9b. window.mcConfirm override (lines 44-47)

```js
window.mcConfirm = function(msg, opts){
  if (typeof window.mcConfirmImpl==='function') return window.mcConfirmImpl(msg, opts);
  return Promise.resolve(window.confirm(String(msg)));
};
```

**Impact:** Routes `confirm()` calls to `mcConfirmImpl` if available, else native `confirm()`. Used by `deleteItem`, `deleteExpense`, `deleteTrip`, `leaveGroup`, `shareGroup`, `confirmSaveTrip`, `wireGuestLeave`, etc.

### 9c. window.__MARKICAB_SUPABASE__ (line 17)

**Impact:** Set in head script. Consumed by supabase-client.js. If missing, MarkiBackend.ready = false → app stays in personal mode (no errors).

### 9d. window.__initialAuthMode (line 4276)

**Impact:** Set by auth gate IIFE when `?mode=signup|login` present. Consumed by Script 2 at line 4404 to open the right auth mode. Cleared after use (`window.__initialAuthMode = null`).

### 9e. window.__userAuthAttempt (lines 4344, 4711, 4777)

**Impact:** Set to true in auth form submit (line 4344) and Google OAuth click (line 4711). Cleared in onAuthChange SIGNED_IN handler (line 4777) to prevent auto-closeAuth on SDK-restored sessions. Gates whether `closeAuth()` fires after sign-in.

### 9f. window._journeyMap (line 3370)

**Impact:** `MapRenderer` instance for the current Journey. Set in `loadCrewMap()`, cleared on Journey teardown. Read by `renderJourneyView()` (line 3370) to call `invalidateSize()`. One instance per Journey lifetime — NOT recreated on tab switches.

### 9g. window.MarkiAPI, window.MarkiSync, window.TripDomain, window.utils, window.gallery, window.importParser, window.EXPLORE_CATALOG, window.MarkicabCanonicalAdapter, LZString

**Impact:** All intentional — exposed by external scripts. No accidental leakage.

### 9h. Duplicate function: `renderSavedDay` (lines 3896 and 4008)

- **Line 3896:** Top-level function `renderSavedDay(day)` — the one ACTUALLY used (called by day tab onclick at line 3912, inside `openSavedTripDetail` scope)
- **Line 4008:** Second `function renderSavedDay(day)` — inside `initSavedDateEdit`'s scope, same name, but the initSavedDateEdit function defines it as a nested function; it's a different scope. The line 4008 one is NOT the one called by day tabs.

**Impact:** The duplicate is a scoping coincidence — the line 3896 version is the active one. Line 4008 version is dead code inside initSavedDateEdit (never called from within it). This is likely a copy-paste artifact. Not a runtime bug, but a maintenance hazard.

### 9i. accidential globals from missing `var`/`let`/`const`

All 327 var/let/const declarations in Script 1 use explicit `const`/`let`/`var`. The inline scripts use IIFE scoping (Script 2 and 3 are `(function(){...})()`). Script 1 is NOT wrapped in an IIFE — but it runs at the end of `<body>` and its top-level declarations become globals. This is intentional (the exports at 4291-4298 explicitly assign to window).

**Potential issue:** `api` (lowercase) is NOT declared — but `API` (uppercase) is `const API = window.MarkiAPI` at line 1447. There's no accidental `api` global.

---

## 10. Initialization Sequences & Failure Modes

### 10a. Full startup sequence (no URL params, logged in)

```
1. <head> scripts execute (config, toast, mc-confirm, explore-catalog, avatar-crop)
2. Toast/alert/confirm wrapper (lines 26-49) patches window.alert/window.mcConfirm
3. External scripts load in order (supabase-js → LS migrate → map-renderer → supabase-client → markicab-api → canonical-adapter → json-import-parser → lzstring → utils → import-parser → gallery-lightbox → gallery → sync → trip-domain)
4. Script 1 (inline 1437) executes:
   - state, colState initialized
   - API = window.MarkiAPI assigned
   - load() reads localStorage
   - (async()=>{ gt check }) runs — if ?gt= present, openGuestTrip fires
   - (async()=>{ group check }) runs — if ?group= present, joinGroup fires
   - SW registration (if supported)
   - Auth gate IIFE (4259):
     - API.getSession().then(...) or location.replace('index.html')
     - On success: load() + renderHome() + applyUserAvatar()
5. Script 2 (inline 4301) executes:
   - Auth modal CSS injected
   - openAuth/closeAuth/renderMode defined
   - Auth form wired
   - Profile modal wired
   - Avatar crop wiring
   - Import modal wired
   - Google OAuth button wired
   - API.onAuthChange registered (THIS IS THE CRITICAL LISTENER)
   - Bottom nav wiring
   - Gallery delegation
6. Script 3 (inline 4978) executes:
   - Explore view functions defined + window exports
   - (NO auto-render — only triggered by user action)
```

### 10b. Critical path timing

**The onAuthChange listener (Script 2, line 4723) MUST register before any auth event fires.** Since Script 2 loads after Script 1, and Script 1's auth gate IIFE (4259) calls `API.getSession()` which may resolve BEFORE Script 2 loads, there's a race:

- If `getSession()` resolves while Script 2 hasn't registered `onAuthChange` yet → the SIGNED_IN event fires with no listener → the session is "lost" (no colState.uid set, no onSessionReady, no pendingAction replay, no avatar applied). The user sees a logged-in state but the app behaves as if not logged in.

- The auth gate IIFE guards against this: line 4266 `API.getSession().then(function(r){ var session = r && r.data && r.data.session; ... })`. If the session is already cached in the Supabase SDK (from a previous page load), getSession() resolves synchronously-ish. But the `onAuthChange` handler registered in Script 2 (line 4723) would have ALREADY fired by then if the session was restored during SDK init.

- Mitigation: `window.__userAuthAttempt` pattern (lines 4344, 4777) ensures that `closeAuth()` only fires after user-initiated sign-in, not on SDK-restored sessions. But the `onSessionReady(uid)` call at line 4778 (backfill, loadServerGroups, loadPersonalTrips) only fires inside `onAuthChange` → if that event was missed, personal trips are NOT loaded from server.

**Practical impact:** On a cold load (no cached session in SDK), the auth gate calls getSession() → SDK fetches session → resolves → auth gate runs → renderHome with localStorage trips only → Script 2 loads → registers onAuthChange → but there's no pending event (session already restored). User sees app, but server trips not loaded. The `backfillAndSync()` at line 4778 never fires.

On a warm load (SDK has cached session), same issue: SDK restores session synchronously on init, fires SIGNED_IN before Script 2 registers, auth gate runs, renderHome with local trips only.

**Actual observed behavior:** The `onSessionReady` is also called explicitly in some paths (e.g. line 4778 inside onAuthChange). But there's NO fallback call to onSessionReady after the auth gate IIFE completes. The only place `onSessionReady` is called is line 4778 (inside onAuthChange SIGNED_IN handler) and line 175 (inside MarkiSync.onSessionReady, which is a different function — the sync.js version that does backfill+loadServerGroups+loadPersonalTrips).

Wait — let me check: Script 1 line 1827 `async function onSessionReady(uid) { return window.MarkiSync.onSessionReady(uid); }` — this delegates to sync.js `onSessionReady`. sync.js line 175 `async function onSessionReady(uid) { if (uid) { colState.uid = uid; await backfillAndSync(); await loadServerGroups(); await loadPersonalTrips(); } }`.

So `onSessionReady` in Script 1 (line 1827) calls the sync.js version. But it's only called from Script 2's onAuthChange handler (line 4778) AND from the sync.js version itself (line 175, which is the sync.js `onSessionReady`).

There's a circular reference: Script 1 `onSessionReady` → MarkiSync.onSessionReady → (sets colState.uid + backfill) → no call back to Script 1's onSessionReady.

So the question is: does the auth gate IIFE (4259) need to call `onSessionReady` explicitly? Let's look at the auth gate IIFE again (lines 4259-4299):

```
API.getSession().then(function(r){
  var session = r && r.data && r.data.session;
  if(session && session.user && !session.user.is_anonymous){
    load(); renderHome(); applyUserAvatar();
  } else if(mode === 'signup' || mode === 'login'){
    window.__initialAuthMode = mode;
    renderHome();
    if(typeof window.openAuth==='function') window.openAuth(mode);
  } else {
    location.replace('index.html');
  }
}).catch(function(){
  load(); renderHome();
});
```

**On success (line 4271):** `load(); renderHome(); applyUserAvatar();` — NO `onSessionReady` call. Personal trips from server are NOT loaded. Only localStorage trips (from `load()`) are shown.

**The missing call:** `onSessionReady(session.user.id)` should be called here to hydrate server trips. Currently it's only called from `onAuthChange` (Script 2 line 4778) — but that handler may have already fired (and been missed) by the time Script 2 loads.

**This is the startup bug:** On first page load with a valid session, server-side personal trips are not loaded into state.trips. The user only sees localStorage trips. If they had previously synced trips to server (e.g. from another device or after clearing localStorage), those trips don't appear until they trigger a re-auth (which fires onAuthChange → onSessionReady).

### 10c. Offline / API-unavailable path

Auth gate IIFE `.catch(function(){ load(); renderHome(); })` — if `getSession()` fails (network down, API unreachable), `load()` + `renderHome()` runs. App renders with localStorage data only. No server trips. This is the documented offline PWA fallback (line 4284 comment: "API not ready — render home anyway").

### 10d. Guest path startup (`?gt=`)

1. Script 1's async IIFE at 4193 fires: `const gt = URLSearchParams.get('gt')` → if present, `pendingGuestToken=gt; await openGuestTrip(gt)`
2. `openGuestTrip(token)` at 1490:
   - API.getGuestTrip(token) → if error: alert + navigateHome + return
   - guestSession = {token, trip: data, isMember: !!colState.uid && data.is_member}
   - lockNavForGuest()
   - renderGuestView(data, isMember)
   - show('guestView')
3. If isMember=true (already joined): seedIdentities, colState.members, seedGuestContext, wireGuestWishlist, wireGuestLeave, renderGuestWishlist, initGuestRealtime, renderGuestLocationActions
4. Script 1 async IIFE at 4199 ALSO fires for `?group=` — but guest mode has already locked nav; if user has both params, `?gt=` takes precedence (first async IIFE runs first)

**Failure mode:** If `API.getGuestTrip` fails (invalid/expired token), alert + navigateHome('home'). Nav is unlocked by the error path.

### 10e. Group path startup (`?group=`)

1. Script 1's async IIFE at 4199 fires: `const gid = URLSearchParams.get('group')` → if present, `await joinGroup(gid)`
2. `joinGroup(id)` at 2221:
   - ensureAuth() → if no uid: pendingAction=()=>joinGroup(id); openAuth('login'); return
   - API.getGroup(id) → if not found: alert + navigateHome
   - API.isMember(id, uid) → if not existing member: API.joinGroup({group_id, user_id, display_name})
   - openGroup(id, false) (fresh=false because trip data may already exist)
3. `openGroup` does full group session setup (see 8d above)

**Failure mode:** If ensureAuth fails and user cancels auth modal, `pendingAction` is set to retry joinGroup. If user closes the page, the retry is lost.

### 10f. Service worker startup

- `navigator.serviceWorker.register('markicab-sw.js')` at line 4212
- If registration fails: `.catch(function(){})` — silent swallow, app continues
- If registration succeeds: SW update checking starts (immediate + focus + visibility + 15min interval)
- `controllerchange` listener → reload once (guarded by `swReloaded` flag at 4248-4254)

**Failure mode:** SW registration failure is swallowed. App continues without SW caching.

---

## 11. Dependency Graph (concise)

```
                    ┌─────────────┐
                    │  Supabase   │
                    │  config     │  (line 17)
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
   ┌────▼────┐    ┌───────▼───────┐   ┌─────▼─────┐
   │ toast.js│    │supabase-client│   │ExploreCat.│
   │ mc-conf.│    │ → MarkiBackend│   │ → EXPLORE_ │
   └────┬────┘    └───────┬───────┘   │ CATALOG    │
         │                 │           └─────┬──────┘
   ┌─────▼───────────────▼───────┐          │
   │  MarkiAPI (markicab-api.js) │          │
   │  → window.MarkiAPI          │          │
   └───────┬─────────────────────┘          │
           │                                │
   ┌───────▼───────────────────────────────┐│
   │  MarkiSync (sync.js)                  ││
   │  → window.MarkiSync                   ││
   │  depends on: state, colState, API     ││
   └───────┬───────────────────────────────┘│
           │                                │
   ┌───────▼───────────────────────────────┐│
   │  Script 1 (inline, 1437-4300)         ││
   │  state, colState, 164 fns, 13 exports ││
   │  ├── startup gate (4259)              ││
   │  ├── auth gate (calls getSession)     ││
   │  ├── trip CRUD (openTrip, renderPlan, ││
   │  │   createGroupDirectly, addAgenda,  ││
   │  │   addExpense, editInline, delete)  ││
   │  ├── group session (openGroup, join,  ││
   │  │   reconcile, teardown, perms)      ││
   │  ├── journey (renderJourneyView,      ││
   │  │   start/end, location, crew)       ││
   │  ├── guest (openGuestTrip, seedCtx,   ││
   │  │   renderGuestView, wireLeave)      ││
   │  ├── save trip (openSaveTripModal,    ││
   │  │   loadSavedTrips, use/delete)      ││
   │  └── deep links (openFromHash)        ││
   └───┬────────────────────────────────────┘
       │
   ┌───▼────────────────────────────────────┐
   │  Script 2 (inline, 4301-4976)           │
   │  Auth UX (openAuth, closeAuth, form,    │
   │  onAuthChange handler)                  │
   │  Profile (openProfile, avatar crop)     │
   │  Import (renderImportFeedback,           │
   │  ingestAndOpen via canonical-adapter)   │
   │  Gallery wiring (delegate to gallery.js)│
   │  Bottom nav (setActiveNav, goNav,       │
   │  override show())                       │
   │  Google OAuth                            │
   └───┬────────────────────────────────────┘
       │
   ┌───▼────────────────────────────────────┐
   │  Script 3 (inline, 4978-5067)           │
   │  Explore view (openExploreView,          │
   │  openExploreDetail, saveExploreTrip,     │
   │  renderExploreList)                     │
   └───┬────────────────────────────────────┘
       │
   ┌───▼────────────────────────────────────┐
   │  External helpers (consumed by above):   │
   │  utils.js → esc, money, dateText,       │
   │            normalizeLink, daysBetween,   │
   │            categoryIcon, tripBgCat,     │
   │            isPlaceholderName, humanErr  │
   │  TripDomain → tripStatus, getTrip       │
   │  gallery.js + gallery-lightbox.js →     │
   │            gallery load/render/lightbox │
   │  map-renderer.js → MapRenderer          │
   │  canonical-adapter.js → ingestAndOpen  │
   │  json-import-parser.js → parseImport    │
   │  lzstring.js → decompressFromEncoded    │
   │  import-parser.js → window.importParser │
   │  markicab-ls-migrate.js → LS migration  │
   └──────────────────────────────────────────┘
```

---

## 12. Proposed Target Boundaries (Phase 1 — no refactoring, just identification)

These are the natural module boundaries that the monolith currently crosses. Each boundary represents a candidate for extraction in a future phase.

### 12a. Boundary A: Pure Tools (ZERO app logic)

**Already extracted (external files):**
- `assets/js/utils.js` — pure functions, no DOM, no API, no state mutation
- `assets/js/trip-domain.js` — pure domain, reads window.state only
- `backend/json-import-parser.js` — pure parser
- `backend/canonical-adapter.js` — adapter, needs setContext() injection

**Candidate for extraction (currently inline):**
- None — all pure functions are already extracted.

### 12b. Boundary B: Persistence Layer

**Currently inline in Script 1 (lines 1474-1479):**
- `save()` — localStorage write + scheduleSync
- `load()` — localStorage read + legacy migration
- `scheduleSync()` — debounced syncActiveTrip
- `STORE_KEY`, `LEGACY_STORE_KEY`, `MIG_KEY` constants

**Candidate module: `storage.js`**
- Exposes: `save()`, `load()`, `scheduleSync()`, `getMig()`, `setMig()`, migration helpers
- Depends on: nothing (pure localStorage)
- Consumed by: Script 1 (state mutation points), sync.js (syncTrip calls save)

### 12c. Boundary C: Local Trip CRUD (personal, pre-group)

**Currently inline in Script 1 (lines 2003-2139):**
- `openTrip(id)` — tear down group, set activeTripId, renderPlanner
- `renderPlanner()` — full planner render (name, meta, stats, day tabs, itinerary, expenses)
- `deleteItem(id)` / `editInline(el,field,type)` / `addAgenda(event)` / `renderExpenses()` / `addExpense(event)` / `deleteExpense(id)` / `renderToGo()` / `addToGo(event)` / `scheduleToGo(id)` / `editTrip()`
- `addOrUpdateTrip(event)` — new trip or edit existing

**These functions ALREADY have a clean split:**
- Personal trip operations (no colState.group) → `syncTrip(trip)` via MarkiSync
- Group operations → `API.*` calls + `reconcileTrip`

**Candidate module: `local-trip.js`** — personal trip lifecycle. Depends on: state, save, syncTrip, api via MarkiSync. Consumed by: navigation (openTrip), UI rendering.

### 12d. Boundary D: Group Session Manager

**Currently inline in Script 1 (lines 2221-2381):**
- `joinGroup(id)` — entry point
- `openGroup(id, fresh, trip)` — full group session: channel, poll, copy items, perms, load all data
- `loadShared(id)` / `loadMembers(id)` / `loadGroupExpenses(id)` / `loadWishlists(id)` — data loaders
- `reconcileTrip(reason)` — the ONE reconciliation function (delegates to MarkiSync)
- `installSyncRecovery()` / `routeReconcile(reason)` — lifecycle wiring
- `teardownGroupSession()` — cleanup
- `applyPermsUI()` — permission-based UI visibility

**This boundary is ALREADY clean** — it delegates all heavy lifting to `MarkiSync` (sync.js) and `MarkiAPI`. The inline code is pure orchestration: call API, set colState, render.

**Candidate module: `group-session.js`** — orchestration only. Depends on: MarkiSync, MarkiAPI, colState, state, render functions. Consumed by: navigation (openGroup, joinGroup), all group view features.

### 12e. Boundary E: Group Rendering (UI only)

**Currently inline in Script 1 (lines 2458-2753 + 2634-2741 + 3653-3669):**
- `renderGroupPlanner()` — full planner UI
- `renderGroupExpenses()` — expenses UI
- `renderGroupMembersList()` / `renderMembers()` / `renderCrewStatusList()` — member/crew UI
- `seedIdentities()` / `loadIdentities()` / `resolveIdentity()` / `nameOf()` / `roleLabelOf()` / `ensureAvatarUrls()` / `avatarChip()` / `avatarUrlFor()` — identity resolution chain
- `creatorName()` / `populatePayerSelect()` — derived displays
- `addGroupAgenda()` / `addGroupExpense()` / `editGroupTime()` / `editGroupCost()` / `removeGroupItem()` / `removeGroupExpense()` / `addWishlist()` / `showConvertDialog()` — group CRUD actions (thin wrappers around MarkiAPI)
- `leaveGroup()` — group exit

**Candidate module: `group-ui.js`** — rendering + action wrappers. Depends on: colState, resolveIdentity, MarkiAPI, MarkiSync (for loadShared etc.), utils (esc, money, dateText), DOM ids. Consumed by: group-session.js (calls renderGroupPlanner after load), all group view entry points.

### 12f. Boundary F: Journey Mode

**Currently inline in Script 1 (lines 2757-3218 + 3346-3639):**
- `renderJourneyView()` — probe journey state → set colState → renderJourneyContent → start/stop subsystems
- `renderJourneyContent()` — HTML generation (badge, consent banner, crew map container)
- `refreshJourneyUI()` — route to guest or member path
- `startJourneyMode()` / `endJourneyMode()` — owner controls
- `shareLocationHandler()` / `denyLocationHandler()` / `stopSharingHandler()` — consent flow
- `startLocationWatch()` / `stopLocationWatch()` — geolocation
- `loadCrewMap()` / `renderCrewMarkers()` / `crewRows()` / `renderCrewStatusList()` / `updateCrewStatus()` / `hideCrewMap()` — crew display
- `initJourneyRealtime()` / `stopJourneyRealtime()` — realtime for member_locations
- `startCrewRefresh()` / `stopCrewRefresh()` — 10s polling fallback
- `isFreshLocation()` / `distanceMeters()` / `fmtDistance()` — location helpers

**This is a natural module.** It has its own init/teardown lifecycle, its own state (colState.journey, crewLocations, locationConsent, locationWatchId), and its own render cycle. The ONLY coupling to the rest of the app is through colState and MarkiAPI.

**Candidate module: `journey-mode.js`** — full Journey lifecycle. Depends on: colState, MarkiAPI, MapRenderer (external), utils (esc), DOM ids. Consumed by: group-session.js (openGroup calls renderJourneyContent pre-render; switch to journey tab calls renderJourneyView), refreshJourneyUI (called from location lifecycle handlers).

### 12g. Boundary G: Guest Mode

**Currently inline in Script 1 (lines 1481-1651 + 3183-3300):**
- `isGuest()` / `openGuestTrip(token)` / `lockNavForGuest()` / `unlockNav()` / `renderGuestView(t, isMember)` — guest lifecycle
- `renderGuestItinerary(t)` / `renderGuestLocationActions(t)` / `renderGuestWishlist()` / `wireGuestWishlist()` / `wireGuestLeave()` — guest UI
- `seedGuestContext(t)` — seed group + members + identities + uid for guest
- `reconcileGuestTrip(reason)` / `initGuestRealtime()` / `teardownGuestSession()` — guest sync (delegate to MarkiSync)

**Candidate module: `guest-mode.js`** — guest lifecycle + UI. Depends on: MarkiAPI, MarkiSync (delegation), colState, state, utils, DOM ids. Consumed by: startup (openGuestTrip from URL param), navigation (lock/unlock nav).

### 12h. Boundary H: Auth UX

**Currently in Script 2 (lines 4301-4404 + 4722-4792):**
- `openAuth(m)` / `closeAuth()` / `renderMode()` — auth modal lifecycle
- `form.onsubmit` — email/password login + signup (with anonymous conversion + fresh registration branches)
- `API.onAuthChange` handler — the single auth state listener
- `pendingAction` — deferred action queue (function or string)
- `window.__initialAuthMode` / `window.__userAuthAttempt` — coordination flags

**The onAuthChange handler is the critical piece** — it's the ONLY place where colState.uid is set from an auth event, and it drives: avatar application, profile ensuring, guest soft-conversion, pendingAction replay, onSessionReady (backfill).

**Candidate module: `auth.js`** — auth modal + onAuthChange handler + pendingAction. Depends on: MarkiAPI, colState, utils (humanErr), DOM ids, renderHome, applyUserAvatar, onSessionReady, pendingAction consumers. Consumed by: all features that need auth (trip creation, group join, save trip, explore save, profile, avatar upload).

### 12i. Boundary I: Profile / Avatar

**Currently in Script 2 (lines 4407-4489):**
- `openProfile()` / `closeProfile()` — profile modal
- `_uploadAvatarFile()` / `_openCrop()` / `_closeCrop()` / `_startAvatarPick()` — avatar flow
- `profileSave` onclick — API.updateMyProfile
- `profileLogout` onclick — API.signOut
- Avatar crop modal wiring

**Candidate module: `profile.js`** — profile modal + avatar flow. Depends on: MarkiAPI, colState, AvatarCrop (external, optional), DOM ids. Consumed by: header avatar click, profile modal.

### 12j. Boundary J: Import Flow

**Currently in Script 2 (lines 4558-4694):**
- `renderImportFeedback()` — live preview as user types
- `importTripBtn.onclick` / `importCancel.onclick` / `importTextarea.oninput` / `importSubmit.onclick` — modal wiring
- Import submission: parse → confirm → canonicalAdapter.setContext → ingestAndOpen

**Candidate module: `import.js`** — import modal + flow. Depends on: MarkiAPI, MarkicabCanonicalAdapter, window.importParser, colState, state, save, syncTrip, ensureAuth, openTrip, openGroup, renderHome, normalizeLink, DOM ids. Consumed by: import trip button (home view).

### 12k. Boundary K: Navigation / Router

**Currently in Script 2 (lines 4803-4965):**
- `setActiveNav(name)` / `goNav(name)` — bottom nav dispatch
- Bottom nav wiring (nav-tab, savedEntryBtn, back buttons, explore-entry-link, globalBack)
- `show()` override — sync nav + title on view changes
- Deep link wiring (openFromHash is in Script 1, but nav handling is in Script 2)

**Candidate module: `nav.js`** — navigation dispatch + bottom nav. Depends on: show (from Script 1), navigateHome, openGroup, openSavedTrips, openExploreView, loadGalleryAgg, setActiveNav, DOM ids. Consumed by: all view switching.

### 12l. Boundary L: Gallery Aggregation

**Currently in Script 2 (lines 4806-4845):**
- `_galleryFmtDate(s)` / `_galleryFmtMonth(s)` — formatting
- `loadGalleryAgg()` — listMyGroups → listMedia per group → aggregate + render

**Already delegated to `gallery.js` for the in-group gallery view.** The aggregation view (galleryView, all trips' photos) is a separate feature that could be its own module.

**Candidate module: `gallery-agg.js`** — cross-trip gallery aggregation. Depends on: MarkiAPI, colState, utils, DOM ids. Consumed by: gallery nav tab (goNav('gallery') calls loadGalleryAgg()).

### 12m. Boundary M: Explore (catalog + detail + save)

**Currently in Script 3 (lines 4984-5067):**
- `openExploreView()` / `openExploreDetail(id)` / `saveExploreTrip(item)` / `renderExploreList()`

**Already cleanly separated** — Script 3 is a standalone IIFE that only depends on `window.EXPLORE_CATALOG` and `MarkiAPI` (for save). The catalog data is in a separate file (`explore-catalog.js`).

**Candidate module: `explore.js`** — already essentially this. Depends on: EXPLORE_CATALOG, MarkiAPI, openAuth, openSavedTrips, DOM ids. Consumed by: catalog nav tab, catalog entry link on home.

---

## 13. Startup Blockers Summary

| # | Item | Blocks startup? | Failure mode |
|---|------|-----------------|--------------|
| 1 | Supabase config missing | NO | App runs in personal mode (no errors, no network) |
| 2 | supabase-js CDN load failure | NO (graceful) | MarkiBackend.init() rejects → MarkiAPI._getSb() returns null → all API calls return {error: 'Backend unavailable'} |
| 3 | MarkiBackend.init() rejection | NO | Same as above; app renders with localStorage data |
| 4 | MarkiAPI not available (script load failure) | PARTIAL | Script 1 line 1447 `const API = window.MarkiAPI` → `API` is undefined → every API call throws ReferenceError. **This IS a blocker.** Script 1 does NOT guard `API` existence. If `markicab-api.js` fails to load, the entire app crashes at Script 1 parse time. |
| 5 | MarkiSync not available | PARTIAL | Script 1 delegates sync functions to `window.MarkiSync.*` — if sync.js fails, `syncTrip`, `reconcileTrip`, etc. throw. But app still renders with localStorage data; group features fail silently if guarded. The startup gate (4259) does NOT use MarkiSync — it only uses API.getSession(). |
| 6 | utils.js not available | PARTIAL | Script 1 uses `window.utils.esc` (line 1443), `window.utils.money` (1468), `window.utils.dateText` (1469), `window.utils.tripBgCat` (1445). If utils.js fails, these are undefined → ReferenceError when any of those functions is called. The startup gate does NOT call these, so initial render (renderHome) might still work if renderHome doesn't call them — but renderHome calls `tripStatus` (line 1912, uses TripDomain, not utils) and `tripCard` (uses utils.money, utils.dateText). So renderHome WOULD fail. **This IS effectively a blocker for initial render.** |
| 7 | TripDomain not available | PARTIAL | Script 1 uses `window.TripDomain.tripStatus` (1832) and `window.TripDomain.getTrip` (1833). `renderHome` calls `tripStatus` (1912). If TripDomain is missing, `renderHome` throws. **Blocker for initial render.** |
| 8 | toast.js / mc-confirm.js failure | NO | Toast wrapper (lines 26-49) checks `typeof window.mcToast` and `typeof window.mcConfirmImpl` — falls back to native. No crash. |
| 9 | Gallery JS failure | NO | Script 2 calls `window.gallery.wireGalleryDOM()` at line 4946 — if `window.gallery` is missing, this throws. But it's at the END of Script 2, after all other wiring. The app would still render; only gallery features would be broken. The call is NOT wrapped in a guard. **Minor blocker — throws at end of Script 2 init, after app is already interactive.** |
| 10 | MapRenderer failure | NO | Only loaded on demand (`loadCrewMap` → `new MapRenderer('crewMap')`). Leaflet is lazy-loaded. No startup impact. |
| 11 | canonical-adapter.js failure | NO | Only used in import flow (Script 2, line 4659). Checked with `typeof MarkicabCanonicalAdapter.setContext==='function'`. No startup impact. |
| 12 | lzstring.js failure | NO | Only used in `openFromHash()` (line 4106) — checked with try/catch. No startup impact. |
| 13 | import-parser.js failure | NO | `window.importParser` used in import flow only. No startup impact. |
| 14 | explore-catalog.js failure | NO | Script 3 checks `window.EXPLORE_CATALOG` and renders empty state if missing. No startup impact. |

**True startup blockers (app crashes before interactive):**
- MarkiAPI (markicab-api.js) load failure → ReferenceError at Script 1 line 1447
- utils.js load failure → ReferenceError when renderHome calls tripCard (which uses utils.money/dateText)
- TripDomain load failure → ReferenceError when renderHome calls tripStatus

**The app is NOT self-healing on these three failures** because Script 1 does not guard their existence at assignment time. It assumes they're present.

---

## 14. File Inventory

```
trip-planner.html                    5070 lines  (monolith — subject of this inventory)
├── head scripts (inline)
│   ├── supabase config             lines 14-21    (window.__MARKICAB_SUPABASE__)
│   ├── toast/confirm patch         lines 26-49    (window.alert, window.mcConfirm)
│   └── <style> block               lines 53-940   (887 lines, visual system)
├── body
│   ├── header                       lines 945-953  (globalBack, globalTitle, savedEntryBtn, headerAvatar)
│   ├── bottom-nav                  lines 955-960  (4 tabs: home/explore/gallery/journey)
│   ├── modals (7)                  lines 963-1395
│   │   ├── authModal               lines 963-984
│   │   ├── profileModal            lines 987-1018
│   │   ├── importModal             lines 1021-1033
│   │   ├── groupSettingsModal      lines 1036-1054
│   │   ├── editTripModal           lines 1057-1090
│   │   ├── saveTripModal           lines 1153-1161
│   │   └── avatarCropModal         lines 1210-1228
│   ├── views (13)                  lines 1092-1420
│   │   ├── homeView                lines 1092-1110
│   │   ├── newTripView             lines 1112-1124
│   │   ├── plannerView             lines 1126-1150
│   │   ├── savedTripsView          lines 1164-1169
│   │   ├── historyView             lines 1172-1178
│   │   ├── savedTripDetailView     lines 1181-1207
│   │   ├── guestView               lines 1230-1285
│   │   ├── groupView               lines 1287-1395
│   │   ├── exploreView             lines 1398-1403
│   │   ├── galleryView             lines 1406-1409
│   │   ├── journeyView             lines 1412-1415
│   │   └── exploreDetailView       lines 1418-1420
│   └── camera overlay              lines 1384-1391 (hidden)
└── body scripts (16 external + 3 inline)
    ├── supabase-js CDN             line 1423
    ├── markicab-ls-migrate.js      line 1424    (88 lines, LS migration, runs on load)
    ├── map-renderer.js             line 1425    (136 lines, Leaflet crew map)
    ├── supabase-client.js          line 1426    (54 lines, MarkiBackend)
    ├── markicab-api.js             line 1427    (1176 lines, MarkiAPI — 100+ methods)
    ├── canonical-adapter.js        line 1428    (399 lines, import adapter)
    ├── json-import-parser.js       line 1429    (flexible JSON parser)
    ├── lzstring.js                 line 1430    (hash deep-link)
    ├── utils.js                    line 1431    (174 lines, window.utils)
    ├── import-parser.js            line 1432    (89 lines, window.importParser)
    ├── gallery-lightbox.js         line 1433    (lightbox)
    ├── gallery.js                  line 1434    (618 lines, window.gallery)
    ├── sync.js                     line 1435    (433 lines, window.MarkiSync)
    ├── trip-domain.js              line 1436    (54 lines, window.TripDomain)
    ├── Script 1 (inline)           lines 1437-4300  (2864 lines, CORE)
    ├── Script 2 (inline)           lines 4301-4976  (676 lines, AUTH/UI/NAV)
    └── Script 3 (inline)           lines 4978-5067  (90 lines, EXPLORE)
```

---

## 15. Key Observations (no action taken)

1. **Script 1 is not IIFE-wrapped** — its top-level declarations (state, colState, API, 164 functions, 327 vars) all become globals. The window exports at 4291-4298 make this intentional. Script 2 and Script 3 ARE IIFE-wrapped.

2. **The critical race:** `onAuthChange` (Script 2, line 4723) registers AFTER Script 1's auth gate IIFE (4259) may have already called `API.getSession()` and resolved. If the session was cached, `onAuthChange` fires before registration → `onSessionReady` never called → server trips not loaded. The auth gate calls `load()+renderHome()+applyUserAvatar()` but NOT `onSessionReady(session.user.id)`.

3. **`colState` is the single shared state object** for everything collaborative. It's mutated by: Script 1 (all group/journey/guest operations), Script 2 (auth sets uid/name/userAvatarUrl; import sets nothing directly; gallery sets gallery array), Script 3 (explore save reads group via MarkiAPI). No namespacing — every key on colState is globally visible.

4. **`state` (lowercase) is the personal trip state** — separate from colState. Only Script 1 mutates it directly (via CRUD functions). Script 2 and Script 3 read it via `window.state` (exported at line 4293).

5. **`window.colState` is exported at line 4294** — any script can read/modify it. There's no read-only enforcement. The `resolveIdentity` chain at lines 2526-2552 is the canonical way to resolve a user's display identity; bypassing it (reading `colState.members` directly) is what the comments warn against.

6. **`renderSavedDay` is defined twice** (lines 3896 and 4008) in different scopes. The line 3896 version is the active one; the line 4008 version is dead code inside `initSavedDateEdit`. This is a copy-paste artifact, not a runtime bug.

7. **`window.alert` is monkey-patched** (lines 32-38) to route through `mcToast`. This affects the entire page lifetime. The original `alert` is saved as `_alert` but never used.

8. **`window.mcConfirm` is also patched** (lines 44-47) to use `mcConfirmImpl` if available, else native `confirm`. This is the Promise-based confirm used by all delete/leave/share operations.

9. **The groupView's route tab is hidden** (line 4094: `cr.style.display = 'none'` in `applyPermsUI`). The route backend is preserved (loadRoute, renderRoute, moveWaypoint, deleteWaypoint all exist) but the UI is hidden. This is noted as "M4.2 Route (HIDDEN — UI removed, backend preserved for future)" at line 3693.

10. **Gallery has two modes:** (a) in-group gallery panel (groupView → gallery tab) uses `gallery.js` (loadGallery, renderGallery, camera, batch upload, lightbox) — wired by Script 2 and called when the gallery tab is clicked. (b) Top-level galleryView (standalone nav tab) uses `loadGalleryAgg()` (Script 2, lines 4818-4845) which aggregates ALL trips' photos via `listMyGroups` + `listMedia`. These are different code paths for different views.

---

*End of inventory. No code was modified.*
