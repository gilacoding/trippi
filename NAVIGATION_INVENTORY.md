# Stage 3 — Navigation Surface & Dependency Inventory

**Baseline:** `STAGE1_FORENSIC_REVIEW.md` + `STAGE2_ARCHITECTURE_REPORT.md`, verified
against `trip-planner.html` at HEAD `961ee7a`.
**Method:** read-only. No code changes were made. No commits.

This is the re-verification deliverable for task `t_b0ee0fb0`. It feeds
`t_ef9a40ef` (define Navigation boundary) and downstream Stage 3 work.

---

## 1. Script layout (current load order)

Source: `trip-planner.html`, lines 1423–4629.

```
1423–1436  external infrastructure (supabase-js, supabase-client.js, markicab-api.js,
             canonical-adapter.js, json-import-parser.js, lzstring.js, utils.js,
             import-parser.js, gallery-lightbox.js, gallery.js, sync.js, trip-domain.js)
1437       <script>  Inline Script 1 (CORE)            ~2863 lines, FLAT (non-IIFE)
4301       <script src="assets/js/feature-bootstrap.js">   (FeatureBootstrap, UMD)
4302       <script src="assets/js/auth-ux.js">              (Auth UX, IIFE)
4303       <script>  Inline Script 2 (INTEGRATION)        ~322 lines, FLAT (non-IIFE)
4626       <script src="assets/js/gallery-agg.js">          (Gallery, IIFE → window.Gallery)
4627       <script src="assets/js/explore.js">              (Explore, IIFE → window.Explore)
4628       <script src="assets/js/saved-trips.js">          (SavedTrips, UMD → window.SavedTrips)
4629       window.FeatureBootstrap.bootstrap()
```

Key ordering consequence: `window.Explore`, `window.Gallery`, `window.SavedTrips`
are published (parse-time) at 4626–4628, i.e. AFTER Script 2 (4303–4624).
Navigation therefore must NOT reference feature interfaces at parse time — only at
runtime (onclick / delegated calls), by which point all feature interfaces exist.

`core.js` (865 lines) is NOT loaded by any HTML file (0 `<script src>` references)
— see STAGE1 §6. All line numbers below are from `trip-planner.html`, not `core.js`.

---

## 2. Definition inventory — all Navigation-related functions

### 2a. Base view switcher (Core)

| Function | Location | Scope | Export | Definition |
|---|---|---|---|---|
| `show(view)` | L1834 | Script 1 flat (auto-global `window.show`) | explicit `window.show=show` at L4297 (auth-gate IIFE) | `document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); $(view).classList.add('active')` |

Base `show` is the primitive: it removes `.active` from every `.view` and adds
`.active` to the matching one. It is NOT called directly by runtime code after
the patch installs — see 2c.

### 2b. Home navigation (Core)

| Function | Location | Scope | Export | Definition |
|---|---|---|---|---|
| `navigateHome(reason)` | L1899–1908 | Script 1 flat (auto-global `window.navigateHome`) | auto-global (NOT in L4291–4298 explicit list; relies on flat scope) | cleans URL via `history.replaceState`; calls `teardownGroupSession()` (typeof-guarded); calls `renderHome()` (typeof-guarded); calls `show('homeView')` |

**Note on `reason`:** the parameter is ACCEPTED but NEVER READ inside the body.
All call sites pass a string reason (e.g. `"home"`, `"teardown+home"`, `"openGroup-not-found"`)
but `navigateHome` ignores it. It is a future-proofing hook only.

### 2c. The Script 2 show() patch / wrapper (Navigation integration)

| Code | Location | Definition |
|---|---|---|
| `var _show=show;` | L4583 | saves the Core base `show` |
| `show=function(v){ _show(v); ... }` | L4584 | reassigns the flat-scope `show` binding |

Full definition (L4583–4585, single logical statement):

```js
var _show=show;
show=function(v){ _show(v);
  if(v==='homeView'){ setActiveNav('trip'); document.getElementById('globalTitle').textContent='Trip Kamu'; document.getElementById('globalBack').style.display='none'; }
  else if(v==='plannerView'){ setActiveNav('plan'); document.getElementById('globalTitle').textContent='Rencana'; document.getElementById('globalBack').style.display='none'; }
  else if(v==='groupView'){ setActiveNav('plan'); document.getElementById('globalTitle').textContent=colState.group?colState.group.name:'Grup'; document.getElementById('globalBack').style.display='none'; }
  else if(v==='savedTripsView'||v==='savedTripDetailView'){ setActiveNav('saved'); document.getElementById('globalBack').style.display='none'; }
  else if(v==='historyView'){ setActiveNav('trip'); document.getElementById('globalBack').style.display='none'; }
  else if(v==='guestView'){ document.getElementById('globalBack').style.display=''; }
};
setActiveNav('trip'); document.getElementById('globalTitle').textContent='Trip Kamu';
```

This is the ONLY consumer of the base `show` (`_show(v)`). Because `show` is
reassigned in flat scope, every runtime `show('...')` call after L4584 hits the
patched version. The base function is reached only through `_show`.

### 2d. Bottom-nav tab highlight (Navigation)

| Function | Location | Scope | Export | Definition |
|---|---|---|---|---|
| `setActiveNav(name)` | L4554–4557 | Script 2 flat | `window.setActiveNav=setActiveNav` at L4558 | toggles `.active` on `.nav-tab` (matches `t.dataset.nav===name`); toggles `.at-saved` on `#savedEntryBtn` when `name==='saved'` |

### 2e. Bottom-nav router (Navigation)

| Function | Location | Scope | Export | Definition |
|---|---|---|---|---|
| `goNav(name)` | L4560–4567 | Script 2 flat | `window.goNav=goNav` at L4559 | branches: `trip` / `plan` / `journey` / `saved` / `explore` / `gallery` |

Full definition (L4560–4567):

```js
function goNav(name){
  if(name==='trip'){ setActiveNav('trip'); navigateHome("home"); document.getElementById('globalTitle').textContent='Trip Kamu'; document.getElementById('globalBack').style.display='none'; }
  else if(name==='plan'){ setActiveNav('plan'); if(colState.group && colState.group.id){ openGroup(colState.group.id, false); } else if(state.activeTripId || state.readOnlyTrip){ show('plannerView'); document.getElementById('globalTitle').textContent='Rencana'; document.getElementById('globalBack').style.display='none'; } else { setActiveNav('trip'); navigateHome("home"); } }
  else if(name==='journey'){ if(colState.group && colState.group.id){ openGroup(colState.group.id, false); var jt=document.querySelector('[data-gview="journey"]'); if(jt) jt.click(); } else { setActiveNav('journey'); show('journeyView'); document.getElementById('globalTitle').textContent='Journey'; document.getElementById('globalBack').style.display='none'; } }
  else if(name==='saved'){ if(window.SavedTrips&&window.SavedTrips.show)window.SavedTrips.show(); else openSavedTrips(); }
  else if(name==='explore'){ if(window.Explore&&window.Explore.show)window.Explore.show(); }
  else if(name==='gallery'){ if(window.Gallery&&window.Gallery.show)window.Gallery.show(); }
}
```

### 2f. Bottom-nav click wiring (Navigation init, parse-time)

| Code | Location |
|---|---|
| `document.querySelectorAll('.nav-tab, #savedEntryBtn').forEach(...)` onclick → `goNav(t.dataset.nav)` | L4568 |
| `document.querySelectorAll('button.back[data-nav]').forEach(...)` onclick → `goNav(t.dataset.nav)` | L4572 |
| delegated `click` listener: `button.back[data-nav]` → `goNav(b.dataset.nav)` | L4574–4577 |
| `document.querySelectorAll('.explore-entry-link[data-nav]').forEach(...)` onclick → `goNav(t.dataset.nav)` | L4578 |

### 2g. Global back button (Navigation)

| Code | Location | Definition |
|---|---|---|
| `var gb=document.getElementById('globalBack'); if(gb) gb.onclick=...` | L4580–4581 | `setActiveNav('trip'); navigateHome("home"); document.getElementById('globalTitle').textContent='Trip Kamu'; gb.style.display='none';` |

### 2h. Compatibility / alias exports (Script 2)

| Export | Location | Notes |
|---|---|---|
| `window.loadTrip = load;` | L4589 | alias to Core `load()` (not Navigation-owned) |
| `window.showView = show;` | L4591 | captures the PATCHED `show` (post-L4584) |
| `window.loadIdentities = loadIdentities;` | L4592 | Core identity refresh |

---

## 3. Consumer inventory

### 3a. `navigateHome(reason)` — 13 call sites (all in `trip-planner.html`)

| Line | Context | Call |
|---|---|---|
| 1493 | `openGuestTrip` (Script 1) | `navigateHome("home")` — invalid/expired invitation |
| 1494 | `openGuestTrip` (Script 1) | `navigateHome("home")` — no data returned |
| 1499 | `openGuestTrip` (Script 1) | `navigateHome("home")` — catch block |
| 2237 | `openGroup` (Script 1) | `navigateHome('group-not-found')` |
| 2249 | `openGroup` (Script 1) | `navigateHome('join-failed-not-found')` |
| 2279 | `openGroup` (Script 1) | `navigateHome('openGroup-not-found')` |
| 3688 | `leaveGroup` (Script 1) | `navigateHome("teardown+home")` |
| 4108 | data-home buttons + deleteTrip (Script 1) | `navigateHome("teardown+home")` / `navigateHome("home")` |
| 4202 | startup joinGroup error (Script 1) | `navigateHome("home")` |
| 4561 | `goNav('trip')` (Script 2) | `navigateHome("home")` |
| 4562 | `goNav('plan')` fallback (Script 2) | `navigateHome("home")` |
| 4581 | `globalBack.onclick` (Script 2) | `navigateHome("home")` |

External module consumers: **none** (`auth-ux.js`, `explore.js`, `gallery-agg.js`,
`saved-trips.js`, `feature-bootstrap.js` do not call `navigateHome`).

### 3b. `setActiveNav(name)` — 10 call sites + the definition

| Line | Context | Call |
|---|---|---|
| 4554 | definition | `function setActiveNav(name){...}` |
| 4558 | export | `window.setActiveNav=setActiveNav;` |
| 3820 | `openSavedTrips` (Script 1) | `setActiveNav('saved')` |
| 3921 | `openSavedTripDetail` (Script 1) | `setActiveNav('saved')` |
| 4561 | `goNav('trip')` | `setActiveNav('trip')` |
| 4562 | `goNav('plan')` | `setActiveNav('plan')` / `setActiveNav('trip')` (fallback) |
| 4563 | `goNav('journey')` | `setActiveNav('journey')` |
| 4581 | `globalBack.onclick` | `setActiveNav('trip')` |
| 4584 | show patch (each branch) | `setActiveNav('trip'|'plan'|'plan'|'saved'|'trip')` |
| 4585 | nav init (parse-time) | `setActiveNav('trip')` |
| explore.js:32 | `openExploreView` | `window.setActiveNav('explore')` |
| explore.js:43 | `openExploreDetail` | `window.setActiveNav('explore')` |
| gallery-agg.js:130 | `Gallery.show()` | `window.setActiveNav('gallery')` |

### 3c. `goNav(name)` — 4 call sites

| Line | Context | Call |
|---|---|---|
| 4560 | definition | `function goNav(name){...}` |
| 4559 | export | `window.goNav=goNav;` |
| 4568 | `nav-tab` + `#savedEntryBtn` onclick | `goNav(t.dataset.nav)` |
| 4572 | `button.back[data-nav]` onclick | `goNav(t.dataset.nav)` |
| 4576 | delegated `back[data-nav]` click | `goNav(b.dataset.nav)` |
| 4578 | `.explore-entry-link[data-nav]` onclick | `goNav(t.dataset.nav)` |
| gallery-agg.js:116 | `#gt-more` click | `window.goNav('trip'); window.openGroup(...)` |
| gallery-agg.js:119 | `#gt-see-all` click | `window.goNav('trip'); window.openGroup(...)` |

### 3d. `show(view)` — all runtime consumers hit the **patched** version (L4584)

Because `show` is reassigned at L4584 in flat Script 2 scope, every call below
runs the patched wrapper which delegates to `_show(v)` then syncs nav/title/back.
The base function is only ever reached via `_show(v)` inside the patch.

| Line | Context | Call (view) |
|---|---|---|
| 1498 | `openGuestTrip` (Script 1) | `show('guestView')` |
| 1844 | `openSharedTrip` (Script 1) | `show('plannerView')` |
| 1907 | `navigateHome` (Script 1) | `show('homeView')` |
| 1942 | `openHistoryView` (Script 1) | `show('historyView')` |
| 1990 | `openTrip`/edit-trip handler (Script 1) | `show('plannerView')` |
| 2130 | `scheduleToGo` (Script 1) | `show('newTripView')` |
| 2137 | `editTrip` (Script 1) | `show('newTripView')` |
| 2286 | `openGroup` (Script 1) | `show('groupView')` |
| 3819 | `openSavedTrips` (Script 1) | `show('savedTripsView')` |
| 3920 | `openSavedTripDetail` (Script 1) | `show('savedTripDetailView')` |
| 4108 | `newTripBtn.onclick` (Script 1) | `show('newTripView')` |
| 4562 | `goNav('plan')` fallback (Script 2) | `show('plannerView')` |
| 4563 | `goNav('journey')` fallback (Script 2) | `show('journeyView')` |
| explore.js:31 | `openExploreView` | `window.show('exploreView')` |
| explore.js:42 | `openExploreDetail` | `window.show('exploreDetailView')` |
| gallery-agg.js:131 | `Gallery.show()` | `window.show('galleryView')` |

Base `show` (`_show`) consumers: **only the patch at L4584**.

### 3e. `_show` (base show saved-reference)

| Line | Context |
|---|---|
| 4583 | `var _show=show;` — assignment (saves pre-patch binding) |
| 4584 | `_show(v)` — the single call site |

---

## 4. Dependency confirmation

Verified against the actual source. The task's candidate lists are corrected below
with evidence.

### Core dependencies

| Dependency | Required by Navigation? | Evidence (line) |
|---|---|---|
| `show` | YES | goNav: 4562, 4563; navigateHome: 1907; patch IS show (4584); base consumed via `_show` (4584). |
| `navigateHome` | YES | goNav trip (4561), plan-fallback (4562); globalBack (4581). |
| `colState` | YES — read-only | goNav reads `colState.group && colState.group.id` (4562, 4563); show patch reads `colState.group?colState.group.name` (4584). Navigation never writes `colState`. |
| `state` | YES — read-only | goNav reads `state.activeTripId || state.readOnlyTrip` (4562). Not in the candidate list but genuinely required. |
| `openGroup` | YES — Core function | goNav calls `openGroup(colState.group.id, false)` (4562, 4563). Core-owned context opener. |
| `isGuest` | **NO** — not required | NOT referenced in `setActiveNav`, `goNav`, the show patch, or `navigateHome`. `isGuest()` is used only in the auth gate `onAuthChange` listener (L4539) and `colState.isGuest` only in `sync.js`/`renderJourneyView`. Confirmed: Navigation does NOT need `isGuest`. |
| `saveName`/`loadName` | NO | Not referenced by any Navigation function. |
| `pendingGuestToken` | NO | Not referenced by any Navigation function. |

### Feature dependencies

| Dependency | Required by Navigation? | Evidence (line) |
|---|---|---|
| `window.Explore` | YES | goNav: `if(window.Explore&&window.Explore.show)window.Explore.show()` (4564). Public interface only. |
| `window.Gallery` | YES | goNav: `if(window.Gallery&&window.Gallery.show)window.Gallery.show()` (4565). Public interface only. |
| `window.SavedTrips` | YES | goNav: `if(window.SavedTrips&&window.SavedTrips.show)window.SavedTrips.show(); else openSavedTrips()` (4564). Public interface only; falls back to Core `openSavedTrips`. |
| `window.Auth` / `window.openAuth` | **NO** — not required | NOT referenced in `setActiveNav`, `goNav`, the show patch, or `navigateHome`. `window.openAuth` is invoked by `explore.js` (`saveExploreTrip`, L68) and the make-group button (L4546), never from Navigation. Confirmed: Navigation does NOT need Auth. |

### DOM dependencies (Navigation touches many element IDs)

Navigation reads/writes these IDs/classes directly:

- `.view` (show base + patch), `.nav-tab` + `.at-saved` (setActiveNav), `.nav-tab` / `#savedEntryBtn` (click wiring).
- `#globalTitle`, `#globalBack` (title + back-button display: every nav branch + every show-patch branch + globalBack handler).
- `[data-gview="journey"]` (goNav journey branch, L4563), `[data-nav]` (nav-tab / back / explore-entry-link click delegation).
- `.back[data-nav]`, `.explore-entry-link[data-nav]` (delegated click handlers).

---

## 5. Initialization / parse-time vs runtime behavior

- The show patch (L4583–4585) and `setActiveNav('trip')` init (L4585) run at
  **parse time** of Script 2. They only reference bindings already defined in the
  same flat Script 2 scope (`show` from Script 1, `setActiveNav`, `colState`,
  `state`) — never the not-yet-loaded feature interfaces.
- `goNav` and the click/delegate handlers (L4568–4591) register listeners at
  **parse time** but fire at **runtime** (user click). By then, `feature-bootstrap.js`
  (L4301) and the three feature modules (L4626–4628) have published
  `window.Explore`/`window.Gallery`/`window.SavedTrips`, so the
  `if(window.X && window.X.show)` guards resolve correctly.
- Implication for extraction: `window.Navigation` must be published BEFORE the
  click handlers attach, and `init()` must run after Core has exported
  `show`/`navigateHome`/`openGroup` (i.e. after Script 1). It must NOT call any
  feature interface at parse/init time — only at runtime inside `goNav`.

---

## 6. Verification status

- Line numbers above were re-grepped directly against `trip-planner.html`
  (HEAD `961ee7a`); they supersede the approximate line numbers in
  `STAGE2_ARCHITECTURE_REPORT.md` (which cited L4554–4567 / ~L4570 and was
  off by a few lines but directionally correct).
- `auth-ux.js` was confirmed to contain NONE of `setActiveNav`/`goNav`/
  `navigateHome`/`show(` — it consumes `colState`, `isGuest`,
  `pendingGuestToken`, `saveName` as Auth-Core dependencies, not as Navigation.
- `core.js` (L206 `navigateHome` etc.) is the stale, UNWIRED reference copy and
  was NOT treated as the source of truth.

## 7. Summary — Navigation's effective dependency surface

```
Navigation owns:      setActiveNav(), goNav(), show() patch (integration only)
Core retains:         show(), navigateHome()

Navigation reads (Core):   show, navigateHome, colState (read-only),
                            state (read-only: activeTripId, readOnlyTrip),
                            openGroup
Navigation reads (Features): window.Explore, window.Gallery, window.SavedTrips
Navigation does NOT need:    isGuest, status: pendingGuestToken, saveName,
                            window.Auth / window.openAuth
```

**Deliverable:** this file — `D:\HERMES WORKS\TRIPPi\TRIPPY\trippi-deploy\NAVIGATION_INVENTORY.md`.