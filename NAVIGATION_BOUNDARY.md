# Navigation Boundary & Interface Spec

**Task:** t_ef9a40ef — Define Navigation boundary and interface
**Baseline:** `trip-planner.html` at HEAD `961ee7a`
**Precedents:** `NAVIGATION_INVENTORY.md` (t_b0ee0fb0), `CORE_BOUNDARY_AUDIT.md` (t_d5ae4435), `CORE_BOUNDARY_AUDIT.md` (t_d5ae4435), `CONTRACT_AUDITS.md` (t_04409cab)
**Scope:** definition only. No code changes in this document. This spec feeds `t_bda2f548` (create `assets/js/navigation.js`).

---

## 0. Summary

Navigation is a **hybrid infrastructure layer** that sits between Core (Script 1) and the
feature modules. It owns the bottom-nav routing logic and the `show()` integration patch
that keeps UI nav state in sync with view changes. It does **not** own view switching
itself (that is Core's `show()`), nor does it own home navigation (`navigateHome`), nor
any feature rendering, nor any Core state mutation.

The interface is small and explicit:

```
window.Navigation = {
  init(),               // install click handlers + show() patch + initial nav state
  setActiveNav(name),   // toggle .active on bottom-nav tabs
  goNav(name),          // bottom-nav router
  back()                // global back-button handler
}
```

Plus three compatibility aliases (see §7) that must be preserved for existing consumers.

---

## 1. Boundary Definition

### 1a. Navigation OWNS (exclusively)

| # | Responsibility | Current location | Notes |
|---|---|---|---|
| 1 | `setActiveNav(name)` | L4554–4558 | Toggles `.active` on `.nav-tab` elements (matched by `t.dataset.nav === name`). Toggles `.at-saved` on `#savedEntryBtn` when `name === 'saved'`. |
| 2 | `goNav(name)` | L4560–4567 | Bottom-nav router. Branches: `trip`, `plan`, `journey`, `saved`, `explore`, `gallery`. Reads `colState.group`, `state.activeTripId`, `state.readOnlyTrip`, `window.Explore/Gallery/SavedTrips`, `window.openGroup`, `window.navigateHome`, `window.show`, `window.openSavedTrips`. |
| 3 | `show()` integration patch | L4583–4584 | Wrapper around base `show()`: calls the original, then syncs nav-tab `.active` state, `#globalTitle` text, and `#globalBack` visibility per view. The **only** consumer of the base `show` is `_show(v)` at L4584. |
| 4 | Bottom-nav click wiring | L4568–4578 | Attaches `onclick` to `.nav-tab` + `#savedEntryBtn` → `goNav(t.dataset.nav)`. Attaches `onclick` to `button.back[data-nav]` → `goNav(t.dataset.nav)`. Attaches **delegated** `click` listener for dynamically-injected `button.back[data-nav]`. Attaches `onclick` to `.explore-entry-link[data-nav]` → `goNav(t.dataset.nav)`. |
| 5 | Global back button handler | L4580–4581 | `#globalBack.onclick` → `setActiveNav('trip')`, `navigateHome("home")`, set title to 'Trip Kamu', hide back button. |

These are installed at **parse time** of the Navigation script (inside `init()`), which runs
after Script 1 (Core exports are available) and before the feature modules (L4626–4628),
which matches the current Script 2 parse-time behavior.

### 1b. Core RETAINS (not Navigation)

| Responsibility | Location | Export | Notes |
|---|---|---|---|
| Base `show(view)` | L1834 (Script 1) | `window.show` (L4297) | The primitive view switcher: removes `.active` from all `.view`, adds `.active` to matching view. Navigation wraps it but does not own the primitive. |
| `navigateHome(reason)` | L1899–1908 (Script 1) | **NOT exported on `window`** | Cleans URL via `history.replaceState`, calls `teardownGroupSession()` (typeof-guarded), `renderHome()` (typeof-guarded), then `show('homeView')`. The `reason` parameter is accepted but never read — it is a future-proofing hook only. |

### 1c. Navigation MUST NOT take ownership of

- `colState` — Navigation reads `colState.group` and `colState.group.name` only (read-only).
  It never writes `colState` or any property.
- Trip/group state (`state.activeTripId`, `state.readOnlyTrip`) — read-only, never written.
- Authentication state — `pendingGuestToken`, `isGuest()`, `colState.isGuest`: **zero references**
  in any Navigation function (confirmed at L4554–4624).
- `window.Auth` / `window.openAuth` — **zero references** in any Navigation function.
- Feature rendering internals — Navigation calls only the public `.show()` / public entry
  points of features, never their internal render functions.
- Saved Trips rendering (`renderSavedDay`, `openSavedTripDetail`, `useSavedTrip`, etc.) —
  not touched. Navigation calls `window.SavedTrips.show()` or the Core fallback
  `window.openSavedTrips()`.
- Journey rendering — not touched. `goNav('journey')` calls `openGroup` or triggers a
  click on `[data-gview="journey"]`; it does not render Journey itself.
- `openGroup()` — Navigation **calls** this Core function but does not own or modify it.

### 1d. Navigation MAY call (public feature interfaces only)

| Interface | Called from | Access pattern | Required? |
|---|---|---|---|
| `window.Explore.show()` | `goNav('explore')` | `if(window.Explore && window.Explore.show)` guard | Optional (guarded) |
| `window.Gallery.show()` | `goNav('gallery')` | `if(window.Gallery && window.Gallery.show)` guard | Optional (guarded) |
| `window.SavedTrips.show()` | `goNav('saved')` | `if(window.SavedTrips && window.SavedTrips.show)` guard | Falls back to `window.openSavedTrips()` |

All feature calls are **runtime-only** (inside click/delegated handlers), never at
parse/init time. Feature modules are loaded AFTER the Navigation script in the current
order (L4626–4628), so feature references must be guarded.

---

## 2. Interface Spec: `window.Navigation`

### 2.1 Design constraints

- All dependencies use **explicit `window.*` references** — no lexical-scope access to
  Script 1 globals.
- No new global state object. Navigation has no persistent state across init calls. An
  internal `initialized` flag (module-private, not on `window`) tracks whether `init()`
  has run, matching the pattern in `explore.js` and `saved-trips.js`.
- The module pattern matches the established project convention (IIFE + UMD for testing,
  `FeatureBootstrap.register` for failure-isolated init — see `saved-trips.js` L69–84 and
  `feature-bootstrap.js`).

### 2.2 Methods

#### `Navigation.init()`

- **Signature:** `init(): void`
- **Purpose:** Install all parse-time wiring: click handlers on nav tabs and buttons,
  the delegated back-button listener, the `show()` patch, and the initial nav state
  (`setActiveNav('trip')` + title).
- **Parse-time or runtime?** Parse-time. Runs when the Navigation `<script>` is parsed.
- **Core dependencies:** `window.show` (saved as base reference before patching),
  `window.colState`, `window.state`.
- **Feature dependencies:** none at init time (feature references only appear inside
  `goNav`, which fires at runtime).
- **Idempotent:** yes. If `init()` has already run, subsequent calls return early.

#### `Navigation.setActiveNav(name)`

- **Signature:** `setActiveNav(name: string): void`
- **Purpose:** Toggle `.active` class on `.nav-tab` elements where `t.dataset.nav === name`.
  Toggle `.at-saved` class on `#savedEntryBtn` when `name === 'saved'`.
- **Parse-time or runtime?** Both. Called at parse-time init (initial `setActiveNav('trip')`),
  and at runtime from `goNav`, `back()`, click handlers, and external features.
- **DOM dependencies:** `.nav-tab` elements, `#savedEntryBtn`.
- **Core dependencies:** none.
- **Feature dependencies:** none.
- **Exported as compatibility alias:** `window.setActiveNav` (preserved at §7).

#### `Navigation.goNav(name)`

- **Signature:** `goNav(name: string): void`
- **Purpose:** Bottom-nav router. Branches on `name`:

  ```
  'trip'     → setActiveNav('trip'); navigateHome("home"); set title='Trip Kamu'; hide back
  'plan'     → setActiveNav('plan'); if(colState.group.id) openGroup(group.id,false)
                    else if(state.activeTripId||state.readOnlyTrip) show('plannerView'); set title; hide back
                    else setActiveNav('trip'); navigateHome("home")
  'journey'  → if(colState.group.id) openGroup(group.id,false) + click [data-gview="journey"]
                   else setActiveNav('journey'); show('journeyView'); set title='Journey'; hide back
  'saved'    → if(window.SavedTrips && .show) SavedTrips.show() else openSavedTrips()
  'explore'  → if(window.Explore && .show) Explore.show()
  'gallery'  → if(window.Gallery && .show) Gallery.show()
  ```

- **Parse-time or runtime?** Runtime only (called from click handlers). Feature interfaces
  are available by then.
- **Core dependencies (all via `window.*`):** `window.navigateHome`, `window.show`,
  `window.openGroup`, `window.openSavedTrips`, `window.colState` (read-only: `.group`,
  `.group.id`), `window.state` (read-only: `.activeTripId`, `.readOnlyTrip`).
- **Feature dependencies:** `window.Explore`, `window.Gallery`, `window.SavedTrips`
  (all typeof-guarded).
- **DOM dependencies:** `#globalTitle`, `#globalBack`, `[data-gview="journey"]`.
- **Exported as compatibility alias:** `window.goNav` (preserved at §7).

#### `Navigation.back()`

- **Signature:** `back(): void`
- **Purpose:** Handler for the global back button (`#globalBack`). Equivalent to
  `goNav('trip')` — sets active nav to 'trip', calls `navigateHome("home")`, sets title
  to 'Trip Kamu', hides the back button.
- **Parse-time or runtime?** Handler installed at parse-time inside `init()`; the handler
  body executes at runtime (user click).
- **Core dependencies:** `window.navigateHome`, `window.show` (indirectly, via the call
  chain).
- **Exported as compatibility alias:** none beyond the `onclick` wiring.

### 2.3 Methods NOT included (explicit rejection)

- `Navigation.show()` — the patched `show` is an internal wrapper, not a public method.
  Core retains `window.show`. Navigation installs the patch during `init()` and does not
  expose a separate show method.
- `Navigation.navigateHome()` — Core retains `navigateHome`. Navigation calls it but does
  not own or re-export it.
- `Navigation.render*` — no rendering. Navigation does not render any feature content.

---

## 3. Dependencies (explicit `window.*` references)

### 3a. Core dependencies

| Dependency | Access | Usage location(s) in Navigation | Exported on window? |
|---|---|---|---|
| `window.show` | `window.show(v)` | goNav: L4562 (`plannerView`), L4563 (`journeyView`); show patch calls base `_show` | YES — `window.show=show` at L4297 |
| `window.navigateHome` | `window.navigateHome("home")` | goNav trip/plan/fallback, back() | **NO** — `navigateHome` is not exported. Requires a minimal Core export (see §9). |
| `window.colState` | `window.colState.group`, `.group.id`, `.group.name` | goNav plan/journey patch; show patch `groupView` branch | YES — `window.colState=colState` at L4294 |
| `window.state` | `window.state.activeTripId`, `window.state.readOnlyTrip` | goNav plan branch | YES — `window.state=state` at L4293 |
| `window.openGroup` | `window.openGroup(colState.group.id, false)` | goNav plan branch, journey branch | YES — `window.openGroup=openGroup` at L4295 |
| `window.openSavedTrips` | `window.openSavedTrips()` | goNav saved branch (fallback) | Implicit global (flat Script 1, `function openSavedTrips` at L3818). Accessible as `window.openSavedTrips`. |

### 3b. Feature dependencies (all typeof-guarded, runtime-only)

| Dependency | Access | Usage |
|---|---|---|
| `window.Explore` | `window.Explore && window.Explore.show` | goNav('explore') |
| `window.Gallery` | `window.Gallery && window.Gallery.show` | goNav('gallery') |
| `window.SavedTrips` | `window.SavedTrips && window.SavedTrips.show` | goNav('saved') |

### 3c. Navigation does NOT need

Confirmed by direct source verification (L4554–4624):

| Not needed | Evidence |
|---|---|
| `isGuest()` / `colState.isGuest` | Zero references in setActiveNav, goNav, show patch, globalBack handler |
| `pendingGuestToken` | Zero references in any Navigation function |
| `window.Auth` | Zero references in any Navigation function |
| `window.openAuth` | Zero references in any Navigation function |
| `saveName` / `loadName` | Zero references in any Navigation function |
| `API` / `window.MarkiAPI` | Zero references in any Navigation function |

---

## 4. DOM Dependencies (implementation detail, not interface)

Navigation touches these DOM elements/classes directly. These are internal to the
module's implementation and are not part of the public `window.Navigation` API:

| Selector | Used by | Purpose |
|---|---|---|
| `.view` | show patch (calls base `show`) | Base view switcher (Core-owned DOM pattern) |
| `.nav-tab` | `setActiveNav`, click wiring | Bottom-nav tab elements (matched by `data-nav`) |
| `#savedEntryBtn` | `setActiveNav`, click wiring | Saved-trips entry button |
| `#globalTitle` | goNav, back(), show patch | Header title text |
| `#globalBack` | goNav, back(), show patch | Global back button visibility |
| `[data-gview="journey"]` | goNav journey branch | Journey sub-view trigger (programmatic click) |
| `button.back[data-nav]` | click wiring + delegation | Back buttons in feature views |
| `.explore-entry-link[data-nav]` | click wiring | Explore entry links |

---

## 5. Initialization & Load Order

### 5a. Current Script 2 parse-time sequence (L4554–4585)

1. `setActiveNav` defined → exported as `window.setActiveNav` (L4558)
2. `goNav` defined → exported as `window.goNav` (L4559)
3. `show` patch installed: `_show = show; show = function(v) { _show(v); ... }` (L4583–4584)
4. Initial state: `setActiveNav('trip'); ...` title set (L4585)
5. Click handlers attached (L4568–4578)
6. `#globalBack` onclick attached (L4580–4581)

In the extracted module, steps 1–6 all occur inside `Navigation.init()`.

### 5b. Required load position

```
external infrastructure (supabase, utils, sync, etc.)
→ Script 1 / Core                        (exports window.show, window.navigateHome*, window.colState, window.state, window.openGroup, window.openSavedTrips)
→ feature-bootstrap.js
→ auth-ux.js
→ assets/js/navigation.js               (NEW — replaces Script 2 Navigation code; runs init() at parse time)
→ Script 2 (integration, minus Navigation)  (import modal, OAuth, onAuthChange, gallery wrappers, remaining compatibility exports)
→ gallery-agg.js                        (window.Gallery)
→ explore.js                            (window.Explore)
→ saved-trips.js                        (window.SavedTrips)
→ FeatureBootstrap.bootstrap()
```

**`navigation.js` must load AFTER Script 1 / Core** (needs `window.show`, `window.navigateHome`,
`window.colState`, `window.state`, `window.openGroup`) and **can load at the same position
Script 2 currently occupies** (before feature modules). This preserves the current
parse-time ordering where the `show()` patch is installed before any feature code calls
`show()`.

### 5c. Parse-time vs runtime

| Phase | What runs | Dependencies available |
|---|---|---|
| Parse time (script execution) | `init()`: install show patch, attach click handlers, set initial nav state | Core exports only: `window.show`, `window.colState`, `window.state` (+ `window.navigateHome` for the initial `show('homeView')` path via `navigateHome` is NOT called at init — `setActiveNav('trip')` is the only init call) |
| Runtime (user event) | `goNav()`, `back()`, delegated click handlers | All feature interfaces (`window.Explore/Gallery/SavedTrips`) are published by then |

**Important:** The show() patch installed at init time must not call any feature interface.
It calls only `_show(v)` (base show), `setActiveNav()`, and DOM text/style updates. This is
confirmed by reading L4584 — the patch never touches `window.Explore/Gallery/SavedTrips`.

---

## 6. Compatibility Globals (preserved)

These globals are consumed by external modules or inline Script 2 and MUST remain
available after extraction. The Navigation module publishes them as aliases.

| Global | Consumer(s) | Notes |
|---|---|---|
| `window.setActiveNav` | explore.js:32, explore.js:43; gallery-agg.js:130; inline Script 1 (`openSavedTrips` L3820, `openSavedTripDetail` L3921) | Alias to `Navigation.setActiveNav` |
| `window.goNav` | gallery-agg.js:116, gallery-agg.js:119; inline Script 2 click wiring (replaced by init's click handlers) | Alias to `Navigation.goNav` |
| `window.showView` | (compatibility alias for patched `show`) | Set to the patched `window.show` after the patch is installed. Preserved for iframe embed / deep-link consumers. |

The `window.showView` alias is **not** the base `show` — it captures the patched version
(L4591: `window.showView = show` where `show` is the post-patch binding at L4584). After
extraction, `window.showView` must point to the patched `window.show` that `init()`
installs.

---

## 7. Source Mapping (exact line references)

All references are from `trip-planner.html` at HEAD `961ee7a`.

| Symbol | Definition lines | Export | Consumers |
|---|---|---|---|
| `setActiveNav` | L4554–4557 | `window.setActiveNav = setActiveNav` (L4558) | L4561, L4562, L4563, L4581, L4584, L4585, L3820, L3921, explore.js:32, explore.js:43, gallery-agg.js:130 |
| `goNav` | L4560–4567 | `window.goNav = goNav` (L4559) | L4568, L4572, L4576, L4578, gallery-agg.js:116, gallery-agg.js:119 |
| show patch (`_show` + reassign) | L4583–4584 | (reassigns flat `show` → affects `window.show`) | All 16 runtime `show()` consumers (L1498, L1844, L1907, L1942, L1990, L2130, L2137, L2286, L3819, L3920, L4108, L4562, L4563, explore.js:31, explore.js:42, gallery-agg.js:131) + base via `_show(v)` (L4584) |
| `_show` (base save) | L4583 | (internal) | L4584 (single call site) |
| globalBack handler | L4580–4581 | (onclick) | — (parse-time wiring) |
| click wiring: nav-tab | L4568 | (onclick) | — |
| click wiring: back[data-nav] | L4572 | (onclick) | — |
| click wiring: delegated back[data-nav] | L4574–4577 | (addEventListener) | — |
| click wiring: explore-entry-link | L4578 | (onclick) | — |
| init state: setActiveNav('trip') | L4585 | — | — |
| `navigateHome` (Core, Navigation-dependent) | L1899–1908 (Script 1) | NOT on window | L4561 (goNav trip), L4562 (goNav plan fallback), L4581 (globalBack), + 10 other Core call sites |
| base `show` (Core) | L1834 (Script 1) | `window.show = show` (L4297) | All features + Script 2 + navigateHome |

---

## 8. Design Decisions

1. **`init()` is the entry point.** All parse-time wiring (show patch, click handlers,
   initial nav state) is in `init()`. This mirrors how `saved-trips.js` uses
   `FeatureBootstrap.register('savedTrips', init)` for failure-isolated initialization.
   Navigation's DOM references (`.nav-tab`, `#globalBack`, etc.) are safe at init time
   because the script loads at the end of `<body>` (after those elements exist in the DOM).

2. **`back()` is explicit even though it duplicates `goNav('trip')`.** The global back
   button handler is a distinct responsibility (it is wired to `#globalBack`, not to a
   nav tab click). Making it `Navigation.back()` keeps the handler logic in one place and
   makes the intent explicit, matching the task body's suggestion.

3. **No `Navigation.show()` method.** The patched `show` is an internal wrapper. Core
   retains `window.show`. Exposing a `Navigation.show()` would imply Navigation owns
   view switching, which it does not. The patch is installed as a side effect of `init()`.

4. **No `Navigation.navigateHome()` method.** Core retains `navigateHome`. Navigation
   calls it. Re-exporting it under `Navigation` would blur the boundary.

5. **No new global state object.** Navigation has no persistent state. An internal
   `initialized` boolean (module-private) is the only state, matching the pattern in
   `explore.js` (L26) and `saved-trips.js` (L25).

6. **Compatibility aliases are explicit, not accidental.** `window.setActiveNav` and
   `window.goNav` are published as direct aliases to the `Navigation.*` methods, not as
   separate implementations. This ensures a single code path.

7. **`navigateHome` requires a Core export (see §9).** This is the one minimal Core
   change needed. It does not redesign Core — it adds a single `window.navigateHome =
   navigateHome` to the existing IIFE exports (L4291–4298).

---

## 9. Required Core Dependency: `window.navigateHome`

**Finding:** `navigateHome` (L1899–1908) is defined in Script 1's flat scope but is
**NOT exported** in the Script 1 IIFE (L4259–4299). The current Script 2 code calls it
via accidental flat-scope access.

**What the extraction requires:** Navigation must call `navigateHome("home")` from
`goNav` (trip branch, plan fallback) and `back()`. In an IIFE module, flat-scope access
is unavailable. Navigation must reference it explicitly as `window.navigateHome`.

**Minimal Core change (does not redesign Core):** Add
`window.navigateHome = navigateHome;` to the Script 1 IIFE export block (L4291–4298).
This is a one-line export addition, not a function extraction or logic change.

**Why this is safe:** `navigateHome` remains fully Core-owned. Navigation only *calls*
it; it does not define, modify, or re-export it. No other code is affected — the existing
flat-scope `navigateHome` references in Script 1 continue to work unchanged.

**Stop-condition check:** This does NOT trigger any Stage 3 stop condition. It is not a
`colState` change, not an `openGroup` change, not a `sync.js` change, not a
Saved Trips change, not a `window.Core` creation, not a `core.js` wiring, not an
auth lifecycle change, not a feature-internal call, and not a circular dependency.

---

## 10. Verification Status

- [x] All 7 Navigation code units located and verified against source (L4554–4632)
- [x] All 13 `navigateHome` call sites inventoried
- [x] All 10 `setActiveNav` call sites inventoried
- [x] All 4 `goNav` call sites inventoried
- [x] All 16 `show()` consumers traced (all hit the patch; only `_show` at L4584 hits base)
- [x] Core dependency `navigateHome` confirmed NOT on `window` (requires §9 export)
- [x] Feature dependency `isGuest`/`window.Auth`/`pendingGuestToken` confirmed NOT needed (0 refs)
- [x] Module pattern verified against `explore.js`, `gallery-agg.js`, `saved-trips.js`,
      `feature-bootstrap.js`
- [x] Load order verified: Navigation script must load after Script 1 / Core, can occupy
      the current Script 2 position

---

## 11. Deliverable

`NAVIGATION_BOUNDARY.md` — this file, at
`D:\HERMES WORKS\TRIPPi\TRIPPY\trippi-deploy\NAVIGATION_BOUNDARY.md`.

It defines the Navigation boundary and the `window.Navigation` interface spec,
verified against `trip-planner.html` at HEAD `961ee7a`. The implementation task
`t_bda2f548` consumes this spec to create `assets/js/navigation.js`.
