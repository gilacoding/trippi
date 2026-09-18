# trip-planner.html Architecture Inventory — Modularization Consolidation
**Task:** t_3a8d1d5f | **Baseline:** commit fcfc557 (tagged `safety/fcfc557-baseline`)
**Date:** 2026-09-18 | **No production behavior changes** — only modularization audit + inline regression fix

---

## 0. Verified Baseline State (Phase 0 — all child tasks complete)

| Child | Phase | Status | Key deliverable |
|-------|-------|--------|-----------------|
| t_fc99e412 | Git discipline | **Done** | Safety tag `safety/fcfc557-baseline` pushed to origin; 21 debug files stashed |
| t_a3006bbc | Phase 1 — Inventory | **Done** | ARCHITECTURE_INVENTORY.md (1225 lines) |
| t_c04e46e7 | Phase 2 — Core boundary | **Done** | `assets/js/core.js` (865 lines, 44516 bytes) extracted from inline Script 1; inline Script 1 kept running |
| t_d08d2413 | Phase 3 — Feature boundaries | **Done** | `assets/js/explore.js`, `assets/js/gallery-agg.js`, `assets/js/auth-ux.js` extracted; 69/69 regression tests pass |
| t_b4e83bac | Phase 4 — Failure isolation | **Done** | `assets/js/feature-bootstrap.js`, `assets/js/saved-trips.js`, `tests/feature-isolation.test.js` (17 tests); 79/79 existing + 17/17 new tests pass |

**Branch state at HEAD:** 8cf4382 (Phase 4 + inline regression fix). 5 commits ahead of origin/master.

---

## 1. Current Dependency Graph (after all extractions)

```
PAGE LOAD ORDER (document order in trip-planner.html):

  External scripts (no inline content):
    supabase-js CDN
    markicab-ls-migrate.js        — LS migration
    map-renderer.js               — Leaflet crew map
    backend/supabase-client.js    — MarkiBackend init
    backend/markicab-api.js       — MarkiAPI (window.MarkiAPI)
    backend/canonical-adapter.js  — import → pipeline bridge
    backend/json-import-parser.js — flexible JSON parse
    lzstring.js                   — hash deep-link
    utils.js                      — window.utils (esc, money, dateText, daysBetween, humanErr, saveName, ...)
    import-parser.js              — window.importParser
    gallery-lightbox.js           — window.galleryLightbox
    gallery.js                    — window.gallery (group-scoped gallery)
    sync.js                       — window.MarkiSync
    trip-domain.js                — window.TripDomain (import → Trip model)

  Feature scripts (Phase 2/3/4 extractions):
    feature-bootstrap.js          — window.FeatureBootstrap (central init + failure isolation)
    auth-ux.js                    — window.Auth, window.openAuth, window.openProfile, window.closeProfile
    gallery-agg.js                — window.Gallery (cross-trip aggregation)
    explore.js                    — window.Explore (curated discovery)
    saved-trips.js                — window.SavedTrips (saved trip list/detail)

  Inline Script 1 (CORE) — lines 1437-4300, 2863 lines, NOT IIFE-wrapped:
    → ALL vars/functions are GLOBAL by design
    → state, colState, resolveIdentity, ensureAuth, navigateHome,
      applyUserAvatar, updateHeaderAvatar, busyBtn/freeBtn/showLoading/hideLoading,
      createGroupDirectly, shareGroup/copyGroupLink/shareTrip, askName,
      makeGroupFromTrip, joinGroup, openGroup,
      loadShared/loadMembers/reconcileTrip/loadGroupExpenses/loadWishlists,
      loadExternal, loadIdentities, loadCrewMap, openGroupSettings,
      renderHome/renderGuestView/renderGroupPlanner/renderGroupWishlist/renderJourneyView,
      applyPermsUI, canEditTripDates/Expenses/Wishlist,
      openFromHash, save/saveTrip/useSavedTrip/deleteSavedTrip/openSavedTrips,
      renderSavedDay, load, show, $ (getElementById shorthand)
    → window.* guards: guestSession→window.guestSession, pendingAction→window.pendingAction,
      pendingGuestToken→window.pendingGuestToken, plus typeof guards for all feature fns
      (renderGuestView, openAuth, renderGroupPlanner, renderGroupWishlist,
       renderJourneyView, loadCrewMap, openGroupSettings, renderHome)

  Inline Script 2 (REMAINING) — lines 4303-4626, ~316 lines, NOT IIFE-wrapped:
    → Avatar upload handler comment (no code)
    → Import modal: renderImportFeedback, importSubmit onclick (flexible JSON import)
    → showPw toggle (password visibility checkbox)
    → Google OAuth button handler (API.signInWithOAuth, errEl, humanErr)
    → humanErr local alias (window.utils.humanErr)
    → API.onAuthChange listener (auth-state bridge: SIGNED_IN → onSessionReady + soft-convert;
       SIGNED_OUT → return to index.html or stay for guests)
    → makeGroup button handler (openAuth('login') fallback)
    → nav wiring: setActiveNav, goNav (patched to window.SavedTrips/Explore/Gallery interfaces)
    → global back button handler
    → show() patch (view syncing + nav tab update)
    → window.loadTrip, window.openImport, window.showView, window.loadIdentities, window.resolveIdentity
    → gallery thin wrappers (13 × window.gallery._xxx delegates)
    → NO dangling IIFE closer (removed in fix)

  Inline CSS-only blocks:
    Lines 14-21: Supabase config (window.__MARKICAB_SUPABASE__)
    Lines 26-49: toast/alert/confirm wrappers (window.alert→mcToast, window.confirm→mcConfirmImpl)
    Lines 53-940: main <style> block (887 lines — visual system, Penpot-mapped)

INDEX.HTML (landing page):
    Gallery row 05 added ("Satu folder, semua perjalanan" — gallery studio)
    No JS changes.
```

---

## 2. Current Global/State Inventory

### 2a. Script 1 globals (CORE, inline, NOT IIFE-wrapped — all are window properties)

| Symbol | Type | First line | Purpose |
|--------|------|-----------|---------|
| `STORE_KEY` | const string | 1440 | localStorage key for personal trips v2 |
| `LEGACY_STORE_KEY` | const string | 1441 | legacy key v1 |
| `state` | const object | 1442 | {trips, toGo, activeTripId, activeDate, pendingToGoId, editTripId, readOnlyTrip} |
| `colState` | var object | 1449 | {uid, name, group, userAvatarUrl, groupDetails, trip, isGuest, expenses, wishlists, curSer} — single shared collaborative state |
| `$` | function | 1443 | `document.getElementById` shorthand |
| `dbg` | function | 1444 | no-op debug logger |
| `esc` | const function | 1445 | `window.utils.esc` bound |
| `tripBgCat` | const function | 1446 | `window.utils.tripBgCat` bound |
| `resolveIdentity` | function | ~1500 | Cached identity resolution; canonical chain for creator/member/gGuest/anon |
| `ensureAuth` | function | ~1550 | If no session → openAuth('login'); returns uid or null |
| `navigateHome` | function | ~1600 | Navigates to #home, resets nav tab |
| `applyUserAvatar` | function | ~1620 | Applies colState.userAvatarUrl to header avatar |
| `updateHeaderAvatar` | function | ~1625 | Updates header avatar display element |
| `busyBtn/freeBtn/showLoading/hideLoading` | functions | ~1650 | UI state helpers for buttons/loading indicators |
| `createGroupDirectly` | function | ~1700 | Creates a group without a trip template |
| `shareGroup/copyGroupLink/shareTrip` | functions | ~1750 | Share helpers (copy link to clipboard, share trip via link) |
| `askName` | function | ~1800 | Prompts guest to set a name (cache + colState) |
| `makeGroupFromTrip` | function | ~1850 | Creates a group from current trip (pendingAction='makeGroup') |
| `joinGroup` | function | ~1900 | Joins an existing group by code/id; sets colState.group |
| `openGroup` | function | ~1950 | Opens a group session; handles guest → member transition |
| `loadShared/loadMembers/reconcileTrip/loadGroupExpenses/loadWishlists` | functions | ~2000-2150 | Group data loading from Supabase |
| `loadExternal` | function | ~2200 | Loads an external trip (shared link) |
| `loadIdentities` | function | ~2250 | Refreshes identity list for a group |
| `loadCrewMap` | function | ~2300 | Renders Leaflet crew map (typeof-guarded — only if map-renderer loaded) |
| `openGroupSettings` | function | ~2350 | Opens group settings modal (typeof-guarded) |
| `renderHome` | function | ~2400 | Home view: list of trips (typeof-guarded + setTimeout to avoid race) |
| `renderGuestView` | function | ~2450 | Guest view (typeof-guarded) |
| `renderGroupPlanner` | function | ~2500 | Planner view for a group (typeof-guarded) |
| `renderGroupWishlist` | function | ~2550 | Wishlist view for a group (typeof-guarded) |
| `renderJourneyView` | function | ~2600 | Journey/map view (typeof-guarded) |
| `renderPlanner` | function | ~2650 | Planner rendering (items, dates, budget) |
| `applyPermsUI` | function | ~2700 | Applies permission UI: read-only badges, disabled inputs |
| `canEditTripDates/canEditExpenses/canEditWishlist` | functions | ~2710-2720 | Permission check helpers (uses colState.userIdentity) |
| `openFromHash` | function | ~2750 | Deep-linking from URL hash (#trip/xyz, #group/xyz, #explore/xyz) |
| `save/saveTrip/useSavedTrip/deleteSavedTrip/openSavedTrips` | functions | ~2800-2880 | Saved trip CRUD |
| `renderSavedDay` | function | ~2890 | Saved day rendering (NOTE: defined twice — line 3896 and line 4008; line 4008 is dead code) |
| `load` | function | ~2900 | Main trip loading entry (sets state.activeTripId, calls render) |
| `show` | function | ~2950 | View switching (patched in Script 2 to add nav syncing) |

### 2b. Script 2 local vars (inline remaining, NOT IIFE-wrapped — become globals)

| Symbol | Type | First line | Purpose |
|--------|------|-----------|---------|
| `API` | var | 4306 | `window.MarkiAPI` — RESTERTED after auth-UX extraction (was local to removed IIFE) |
| `errEl` | var | 4307 | `document.getElementById('authError')` — RESTORED (was local to removed IIFE) |
| `importModal` | var | 4309 | import modal DOM element |
| `importTextarea` | var | 4310 | import textarea |
| `importFeedback` | var | 4311 | import feedback area |
| `importSubmit` | var | 4312 | import submit button |
| `importTripBtn` | var | 4313 | import trip button (open import modal) |
| `importCancel` | var | 4314 | import cancel button |
| `lineOfOffset` | const | 4315 | `window.importParser.lineOfOffset` bound |
| `renderImportFeedback` | function | 4328 | Preview rendering for flexible JSON import |
| `showPwEl` | var | 4450 | show password checkbox element |
| `humanErr` | const | 4468 | `window.utils.humanErr` local alias (used by OAuth error display) |
| `setActiveNav` | function | 4555 | Sets active nav tab class |
| `goNav` | function | 4559 | Bottom nav routing; PATCHED to use window.SavedTrips/Explore/Gallery interfaces |
| `window.loadTrip` | export | 4590 | `load` (trip loading entry) |
| `window.openImport` | export | 4591 | Opens import modal |
| `window.showView` | export | 4592 | `show` (view switching) |
| `window.loadIdentities` | export | 4593 | Identity refresh |
| `window.resolveIdentity` | export | 4594 | Identity resolution |
| `show/setActiveNav` imports | — | — | Script 1's `show` is assigned to local `show` (line 4584: `var _show=show; show=function(v){...}` — patches show to sync nav tabs) |

### 2c. auth-ux.js exports (external module, loaded BEFORE Script 2)

| Symbol | Type | Notes |
|--------|------|--------|
| `window.Auth` | object | {init, openAuth, closeAuth, openProfile, closeProfile} |
| `window.openAuth` | function | Direct export (also on window.Auth.openAuth) |
| `window.openProfile` | function | Direct export (also on window.Auth.openProfile) |
| `window.closeProfile` | function | Direct export (also on window.Auth.closeProfile) |
| `closeAuth` | NOT on window | Only accessible via `window.Auth.closeAuth` |
| `API` | var (local) | `window.MarkiAPI` — NOT exported |
| `pendingGuestToken` | var (local) | `window.pendingGuestToken` — reads from window, NOT exported |
| `humanErr/localErr` | var (local) | `window.utils.humanErr` with fallback |
| `saveName` | var (local) | `window.saveName` bound |

### 2d. Other feature modules' window exports

| Module | window.* exports |
|--------|-----------------|
| gallery-agg.js | `window.Gallery` {init, show}, `window.loadGalleryAgg` |
| explore.js | `window.Explore` {init, show}, `window.openExploreView`, `window.openExploreDetail`, `window.saveExploreTrip`, `window.renderExploreList` |
| saved-trips.js | `window.SavedTrips` {init, show} |
| feature-bootstrap.js | `window.FeatureBootstrap` {register, bootstrap, run, errors, health, registry, _reset} |
| gallery.js | `window.gallery` {init, loadGallery, renderGallery, openGalleryLightbox, closeGalleryLightbox, navigateLightbox, updateLightboxContent, showCameraError, clearCameraError, stopCamera, startCamera, capturePhoto, _formatSize, _isVideo, _validateFile, _renderBatchQueue, _updateBatchSummary, _removeBatchItem, _retryBatchItem, _uploadSingleItem, _processBatch, _addBatchFiles, wireGalleryDOM} |
| gallery-lightbox.js | `window.galleryLightbox` {open, close, navigate, updateContent, setOnNavigate} |
| map-renderer.js | `window.mapRenderer` (crew map) |
| trip-domain.js | `window.TripDomain` (import → trip model) |
| canonical-adapter.js | `window.MarkicabCanonicalAdapter` (import pipeline bridge) |
| json-import-parser.js | `window.JSONImportParser` |
| import-parser.js | `window.importParser` (flexible JSON → canonical) |
| sync.js | `window.MarkiSync` (localStorage + Supabase sync) |
| utils.js | `window.utils` {esc, money, dateText, daysBetween, normalizeLink, categoryIcon, isPlaceholderName, humanErr, saveName, tripBgCat} |

### 2e. External `<script src>` chain (loaded before inline Script 1)

| # | src | provides | notes |
|---|-----|----------|-------|
| 1 | supabase-js CDN | Supabase client | global `supabase` (or window.supabase) |
| 2 | markicab-ls-migrate.js | LS migration | runs once, migrates v1 → v2 |
| 3 | map-renderer.js | Leaflet crew map | optional — if fails, crew map feature degrades |
| 4 | backend/supabase-client.js | MarkiBackend | Supabase client + RLS setup |
| 5 | backend/markicab-api.js | MarkiAPI | `window.MarkiAPI` — the API boundary |
| 6 | backend/canonical-adapter.js | MarkicabCanonicalAdapter | import → pipeline bridge |
| 7 | backend/json-import-parser.js | JSONImportParser | strict JSON parse (used by import-parser.js) |
| 8 | lzstring.js | LZ string encoding | hash deep-link compression |
| 9 | utils.js | window.utils | utility functions |
| 10 | import-parser.js | window.importParser | flexible JSON → canonical |
| 11 | gallery-lightbox.js | window.galleryLightbox | modal lightbox for gallery |
| 12 | gallery.js | window.gallery | group-scoped gallery |
| 13 | sync.js | window.MarkiSync | localStorage + Supabase sync |
| 14 | trip-domain.js | window.TripDomain | import → Trip domain model |
| 15 | toast.js | window.mcToast | toast notifications |
| 16 | mc-confirm.js | window.mcConfirm | confirmation dialogs |
| 17 | explore-catalog.js | window.EXPLORE_CATALOG | curated trip discovery data (array) |
| 18 | avatar-crop.js | window.AvatarCrop | avatar crop library (optional — if fails, FALLBACK to direct upload) |

**Critical blocking scripts (failure → app crashes before interactive):**
- markicab-api.js (window.MarkiAPI — used everywhere)
- utils.js (window.utils — used everywhere)
- trip-domain.js (window.TripDomain — used by import pipeline)

**Non-blocking scripts (failure → feature degrades, app still works):**
- map-renderer.js (crew map — typeof guard in core.js line ~2300)
- gallery-lightbox.js (lightbox — gallery.js has null checks)
- avatar-crop.js (avatar crop — auth-ux.js has FALLBACK to direct upload)
- explore-catalog.js (explore — explore.js has `window.EXPLORE_CATALOG || []` guard)
- toast.js (toast — mcToast is wrapped in try/catch in feature-bootstrap)
- mc-confirm.js (confirm — window.mcConfirm has typeof guard)

---

## 3. Proposed Core Boundary

**Core (inline Script 1 + Script 2's infrastructure):**
- **App bootstrap:** DOM ready handling, hash-based deep linking (openFromHash), state/colState initialization
- **Auth/session:** MarkiAPI binding, API.onAuthChange listener, Google OAuth button handler, ensureAuth, askName
- **Current user state:** colState (uid, name, group, avatar, isGuest, userIdentity)
- **Current trip/group context:** state.activeTripId, state.readOnlyTrip, colState.group
- **API access:** window.MarkiAPI (from backend/markicab-api.js), API.onAuthChange, API.getSession, API.signInWithOAuth, API.signInWithEmail, API.signUpWithEmail, API.updateUserEmailAndPassword, API.clearMemberAnonFlag, API.ensureProfile, API.redeemInvitation, API.signOut, API.updateMyProfile, API.listMyGroups, API.listMedia, API.saveTrip, API.loadTrip, API.uploadAvatar
- **Navigation:** navigateHome, goNav (patched), setActiveNav, global back button, show() patch (nav tab syncing)
- **Permissions:** applyPermsUI, canEditTripDates/Expenses/Wishlist, colState.userIdentity chain
- **Identity system:** resolveIdentity chain (canonical) — cached identity lookup for creator/member/guest/anon
- **Import pipeline:** import modal, flexible JSON import, MarkicabCanonicalAdapter.setContext/ingestAndOpen, JSONImportParser, import-parser.js
- **Gallery delegation:** 13 × window.gallery._xxx thin wrappers (batch upload, camera, lightbox navigation)
- **Saved trip CRUD:** saveTrip, useSavedTrip, deleteSavedTrip, openSavedTrips
- **Guest handling:** pendingGuestToken, isGuest(), openGuestTrip, guest → member conversion

**What Core EXPOSES to features (via window or bare globals):**
- `colState` — shared state (uid, name, group, avatar, isGuest, userIdentity)
- `state` — local trip state (trips, toGo, activeTripId, activeDate, pendingToGoId, editTripId, readOnlyTrip)
- `API` — `window.MarkiAPI` (in Script 2: `var API = window.MarkiAPI`)
- `resolveIdentity` — identity resolution (exported to window)
- `ensureAuth` — auth guard (used by features when they need a session)
- `navigateHome`, `openGroup`, `openSavedTrips`, `loadTrip` — navigation
- `applyPermsUI`, `canEditTripDates/Expenses/Wishlist` — permission checks
- `window.utils`, `window.gallery`, `window.importParser`, `window.EXPLORE_CATALOG`, `window.MarkiSync`, `window.TripDomain` — external module exports

**What Core does NOT know about features:**
- Feature DOM structure (auth modal, profile modal, explore detail, gallery agg, saved trip detail)
- Feature-specific event handlers (login submit, profile save, explore save, gallery thumb click)
- Feature-specific state (beyond colState — e.g., explore catalog items, gallery agg state)
- Feature init/registration mechanics (FeatureBootstrap is infrastructure, not feature-specific)

**Design intent:** Core is a flat namespace (NOT IIFE-wrapped) because it was built as a monolith and all vars/functions are `var`/function declarations at the top level of the `<script>` block → they become window properties. This is intentional for the cross-feature access pattern (features need colState, API, navigateHome, etc.).

---

## 4. Proposed Feature Boundaries (extracted modules)

### 4a. auth-ux.js (493 lines) — Phase 3 extraction ✓

**Public interface:**
```
window.Auth.init()              — one-time setup (CSS injection + DOM wiring)
window.Auth.openAuth(mode)      — show auth modal (login | signup)
window.Auth.closeAuth()         — hide auth modal (returns to index.html if no session)
window.Auth.openProfile()       — show profile modal
window.Auth.closeProfile()      — hide profile modal
window.openAuth(mode)           — direct export (alias of window.Auth.openAuth)
window.openProfile()            — direct export
window.closeProfile()           — direct export
```

**Owns:**
- Auth modal CSS injection (style element with .auth-modal, .auth-card, .auth-error, .show-pw, etc.)
- Auth modal DOM wiring (openAuth, closeAuth, renderMode, form.onsubmit, authCancel, authToggle, authSwitch)
- Auth form submit: login (signInWithEmail) and signup (signUpWithEmail → signInWithEmail)
- Anonymous → registered conversion (updateUserEmailAndPassword + clearMemberAnonFlag)
- Profile modal: openProfile, closeProfile, onProfileSave, onProfileLogout
- Avatar upload: direct upload (FALLBACK) + AvatarCrop integration (mount + exportNow)
- Avatar crop modal: cancel, overlay click, Escape key, save (exportNow → File → uploadAvatarFile)
- Auth-state listener: API.onAuthChange (SIGNED_IN → onSessionReady + soft-convert + ensureProfile;
  SIGNED_OUT → index.html redirect or stay for guests)
- Google OAuth button handler
- showPw toggle reset on openAuth (checkbox → unchecked, password → type=password)
- openAuth override: resets showPw checkbox + password type on every modal open
- init() defers to FeatureBootstrap.register('auth', init) when available

**Dependencies (via window.* — no direct feature imports):**
- `window.MarkiAPI` (API)
- `window.colState` (colState)
- `window.utils.humanErr` (humanErr)
- `window.utils.saveName` (saveName)
- `window.utils` (utils)
- `window.mcToast` (toast, optional — try/catch in feature-bootstrap)
- `window.mcConfirm` (confirm, optional)
- `window.isGuest` (isGuest, optional — defaults to `function(){return false}`)
- `window.pendingGuestToken` (guest token state)
- `window.AvatarCrop` (avatar crop library, optional — FALLBACK to direct upload)
- `window.__initialAuthMode` (landing CTA handoff, optional)
- `window.saveName` (named export from Core)
- `window.loadIdentities` (typeof-guarded)
- `window.renderCrewStatusList` (typeof-guarded)
- `window.renderGroupPlanner` (typeof-guarded)

**Does NOT export to window:** `closeAuth` (only via `window.Auth.closeAuth`), `API`, `colState`, `errEl`, `pendingGuestToken`, `humanErr`, `saveName`, `mcToast`, `mcConfirm`, `isGuest`

### 4b. explore.js (161 lines) — Phase 3 extraction ✓

**Public interface:**
```
window.Explore.init()           — one-time setup (register with FeatureBootstrap)
window.Explore.show()            — show explore view (calls openExploreView internally)
window.openExploreView()         — show explore list
window.openExploreDetail(id)     — show explore detail for a catalog item
window.saveExploreTrip(item)     — save explore item as a trip (auth gate → API.saveTrip)
window.renderExploreList()       — render explore list (for server-side render or refresh)
```

**Owns:**
- Explore view rendering: openExploreView, openExploreDetail
- Explore list rendering: renderExploreList (reads window.EXPLORE_CATALOG)
- Explore detail rendering: detail hero, body, day-by-day plan, "Kenapa trip ini?" section
- Explore save flow: saveExploreTrip (auth gate → snapshot → API.saveTrip → openSavedTrips)
- Event wiring: [data-explore] buttons, exploreSaveBtn

**Dependencies (via window.* — no direct feature imports):**
- `window.EXPLORE_CATALOG` (explore data — required; defaults to `[]` if missing)
- `window.MarkiAPI` (API — for saveTrip)
- `window.colState` (colState — for uid check in save path)
- `window.openAuth` (typeof-guarded — for auth gate in save path: `if(!colState.uid){ openAuth('login'); return; }`)
- `window.utils.esc` (via `esc` local alias, for HTML escaping in rendering)

### 4c. gallery-agg.js (166 lines) — Phase 3 extraction ✓

**Public interface:**
```
window.Gallery.init()           — one-time setup (register with FeatureBootstrap)
window.Gallery.show()            — show cross-trip gallery aggregation
window.loadGalleryAgg()          — load gallery aggregation (called by show)
```

**Owns:**
- Cross-trip gallery aggregation: loadGalleryAgg (lists all groups → listMedia per group → filters by uploader_id → sorts by most recent photo date → renders year/month timeline)
- Gallery count display: document.getElementById('galleryCount')
- Empty state rendering: "Belum ada foto perjalanan" / "Galeri gagal dimuat" / "Memuat galeri..."
- Lightbox wiring: .gt-thumb click → window.galleryLightbox.open(idx, items)
- "Lihat semua" + "+N" click: goNav('trip') + openGroup(groupId)
- Month/year header formatting: _galleryFmtDate, _galleryFmtMonth

**Dependencies (via window.* — no direct feature imports):**
- `window.MarkiAPI` (API — for listMyGroups, listMedia)
- `window.colState` (colState — for uid check: `if(!uid){...}`)

### 4d. saved-trips.js (85 lines) — Phase 4 extraction ✓

**Public interface:**
```
window.SavedTrips.init()         — one-time setup (register with FeatureBootstrap)
window.SavedTrips.show()         — show saved trip list
```

**Owns:**
- Saved trip list rendering (reads from localStorage or Supabase)
- Empty state: "Belum ada trip tersimpan"
- Item click → openSavedTripDetail (inline function in Script 1, via window.openSavedTrips)
- Fallback: if window.openSavedTrips is not available (core bootstrap didn't run), degrades gracefully

**Dependencies (via window.* — no direct feature imports):**
- `window.MarkiAPI` (API — for listing saved trips)
- `window.openSavedTrips` (typeof-guarded fallback — if feature bootstrap didn't run, use inline function from Script 1)

### 4e. feature-bootstrap.js (105 lines) — Phase 4 extraction ✓

**Public interface:**
```
window.FeatureBootstrap.register(name, initFn)  — register a feature for deferred init
window.FeatureBootstrap.bootstrap()              — run all registered inits with try/catch
window.FeatureBootstrap.run(name, fn)            — run a single init with containment
window.FeatureBootstrap.errors                  — [{name, error, message}]
window.FeatureBootstrap.health                  — {name: 'registered'|'ok'|'error'}
window.FeatureBootstrap.registry                — [{name, initFn}]
window.FeatureBootstrap._reset()                 — clear state (for tests)
```

**Owns:**
- Feature init registry (`registry` array)
- Failure isolation: try/catch per init → console.error + #debugEl + mcToast (non-blocking, best-effort)
- Health tracking: 'registered' → 'ok' (success) or 'error' (throw)
- Error collection: `errors` array for inspection
- UMD: works as `<script>` (window.FeatureBootstrap) or CommonJS (module.exports)

**No feature dependencies.** Pure infrastructure. Features call `window.FeatureBootstrap.register('name', init)` in their IIFE, and `window.FeatureBootstrap.bootstrap()` is called at the END of the page (after all feature scripts have loaded).

**Design:** Each feature publishes its interface on `window` BEFORE calling `init()`. The bootstrap runs `init()` inside try/catch, so a throw during init does NOT re-throw and does NOT prevent sibling features from initializing. This is the failure-isolation layer.

---

## 5. Highest-Risk Coupling Points

| # | Coupling | Risk | Current Status | Mitigation |
|---|----------|------|---------------|------------|
| 1 | Script 2 `API.onAuthChange` calls `closeAuth()` — was local to removed auth-UX IIFE | **HIGH** — would throw ReferenceError at runtime | **FIXED** — changed to `if(window.Auth&&typeof window.Auth.closeAuth==='function')window.Auth.closeAuth()` |
| 2 | Script 2 OAuth handler references bare `API` and `errEl` — were local to removed IIFE | **HIGH** — SyntaxError in block 4 (node --check fails) + ReferenceError at runtime | **FIXED** — restored `var API = window.MarkiAPI` and `var errEl = document.getElementById('authError')` |
| 3 | Script 2 makeGroup button calls bare `openAuth('login')` — was local to removed IIFE | **HIGH** — ReferenceError at runtime | **FIXED** — changed to `if(typeof window.openAuth==='function')window.openAuth('login')` |
| 4 | Script 2 window exports `window.openAuth=openAuth; window.openProfile=openProfile; window.closeProfile=closeProfile;` — references IIFE-local fns | **MEDIUM** — undefined references in current scope (would throw or shadow auth-ux.js) | **FIXED** — removed duplicate exports; auth-ux.js handles these |
| 5 | Script 2 duplicate `openAuth` override (`var _openAuth=openAuth; openAuth=function(m){...}`) — references IIFE-local `openAuth` | **MEDIUM** — would throw ReferenceError; if it somehow ran, would double-override auth-ux.js's openAuth | **FIXED** — removed duplicate override; auth-ux.js handles showPw reset |
| 6 | Dangling `})();` closer at end of Script 2 (line 4623 baseline) | **HIGH** — SyntaxError in block 4 (node --check fails); no matching opener | **FIXED** — removed dangling closer |
| 7 | Script 1 is NOT IIFE-wrapped — all 164 fns + 327 vars are globals by design | **LOW** — intentional, but means any feature can access Core internals | Accepted by design. Core uses `typeof` guards for feature fns and `window.*` bindings for shared state. Features are trusted to use Core exports correctly. |
| 8 | `colState` is the single shared state — no read-only enforcement | **MEDIUM** — any feature can mutate colState | Accepted by design. resolveIdentity chain is canonical. Features are trusted to use colState correctly. The permission matrix (canEdit*) enforces read-only at the UI level. |
| 9 | `colState.uid` is set in both Script 1 (onSessionReady) and Script 2 (API.onAuthChange) | **LOW** — both set the same field; no conflict | On SIGNED_IN, Script 2's onAuthChange sets colState.uid, then calls onSessionReady(uid) which does idempotent backfill. No double-write issue. |
| 10 | `renderSavedDay` defined twice (lines 3896 and 4008 in baseline) | **LOW** — second definition is dead code (line 4008 is after the first definition's scope ends) | Accepted. The first definition (line 3896) is the live one. The second (4008) is unreachable. |
| 11 | `window.alert` monkey-patched to `mcToast` and `window.confirm` to `mcConfirmImpl` in Script 1 | **LOW** — this is by design (window.alert/mcConfirm replacement for consistent UI) | Accepted. The monkey-patch happens in Script 1 (early) and auth-ux.js uses `window.mcToast`/`window.mcConfirm` directly. |
| 12 | `pendingAction` hoisted to top-level scope (both Script 1 and Script 2 reference it) | **LOW** — intentional, cross-module communication for "action to run after login" | Accepted. `pendingAction` is set in Script 1 (startup gate) and checked in Script 2 (onAuthChange). It's a var (not const), so reassignment is by design. |

---

## 6. Recommended Extraction Order (remaining work, outside this task)

All Phase 1–4 work is complete. If further extraction is desired (future tasks):

| Priority | Target | Scope (lines) | Risk | Notes |
|----------|--------|---------------|------|-------|
| 1 | Nav wiring (`goNav`, `setActiveNav`, `show` patch, global back) | ~65 | Low | Only references Core globals + feature window interfaces. Would become `window.Nav` or `window.Navigation` module. Low risk because it's already using feature interfaces (window.SavedTrips, window.Explore, window.Gallery). |
| 2 | Gallery thin wrappers (13 × window.gallery._xxx delegates) | ~25 | Low | Already delegated to window.gallery. Could be in gallery.js or a separate `gallery-wrap.js`. Low risk — these are pure pass-through functions. |
| 3 | Import modal + flexible JSON import pipeline | ~110 | Medium | Cross-cuts Core (state, colState, MarkiAPI, canonical adapter). Needs careful boundary for `MarkicabCanonicalAdapter.setContext`. The importSubmit onclick handler is async and touches Core state. |
| 4 | Script 1 startup/auth-gate (`resolveIdentity`, `openFromHash`, startup race logic, guest token handling) | ~150 | High | Deeply coupled to Core state (colState, state), auth flow, guest token lifecycle, and the race between cached session and onAuthChange registration. Extract only if Core itself is being modularized. |
| 5 | Permission helpers (`applyPermsUI`, `canEditTripDates/Expenses/Wishlist`) | ~80 | Medium | Used by Core rendering AND features (planner, group view). Would become `window.Permissions` or `window.AuthZ` module. Medium risk because it's called from rendering functions that are themselves in Core. |
| 6 | Core rendering functions (`renderHome`, `renderPlanner`, `renderSavedDay`, etc.) | ~400+ | High | These are the heart of the app. Extracting them would require moving rendering logic out of Core while keeping state access. High risk without a clear boundary. |

**Recommended next step after this task:** Priority 1 (nav wiring) — it's the clearest boundary with the lowest risk, and it's already partially feature-interface-aware.

---

## 7. Estimated Scope of Each Extraction

| Extraction | Current location | Lines | External file | Inline retained | Risk | Status |
|------------|-----------------|-------|---------------|-----------------|------|--------|
| auth-ux.js | Script 2 (IIFE) | 493 | ✓ (auth-ux.js) | 0 (extracted) | Done | **Done** |
| explore.js | Script 3 (IIFE) | 161 | ✓ (explore.js) | 0 (extracted) | Done | **Done** |
| gallery-agg.js | Script 2 (inline) | 166 | ✓ (gallery-agg.js) | 0 (extracted) | Done | **Done** |
| saved-trips.js | Script 2 (inline) | 85 | ✓ (saved-trips.js) | 0 (extracted) | Done | **Done** |
| feature-bootstrap.js | NEW | 105 | ✓ (feature-bootstrap.js) | 0 (new) | Done | **Done** |
| core.js | Script 1 (inline) | 865 | ✓ (core.js) — standalone only, NOT wired into page | Script 1 still inline (2863 lines) | N/A | **Done** (standalone copy) |
| Nav wiring | Script 2 (inline) | ~65 | TBD | ~0 | Low | Not started |
| Gallery wrappers | Script 2 (inline) | ~25 | TBD | ~0 | Low | Not started |
| Import modal | Script 2 (inline) | ~110 | TBD | ~0 | Medium | Not started |
| Startup/auth-gate | Script 1 (inline) | ~150 | TBD | ~0 | High | Not started |
| Permission helpers | Script 1 (inline) | ~80 | TBD | ~0 | Medium | Not started |

**Total extracted to external files:** 1,010 lines (4 features + bootstrap)
**Total standalone (core.js, not wired):** 865 lines
**Remaining inline Script 2:** ~316 lines (import modal + nav + gallery wrappers + onAuthChange + OAuth + makeGroup button)
**Remaining inline Script 1 (Core):** ~2,863 lines (unchanged at baseline; core.js is a standalone extract for testing/forensics)

---

## 8. Inline Regression Fix — Detailed

**Root cause:** Auth-UX extraction (commit `ecedda7`) removed the `(function(){` IIFE opener from inline Script 2 but left 6 lines of code that reference IIFE-local symbols (`API`, `errEl`, `closeAuth()`, bare `openAuth('login')`, duplicate `openAuth` override, duplicate window exports) AND a dangling `})();` closer (originally the IIFE closer).

**Symptom:** Inline Script 2 block 4 (316 lines) failed `node --check` with `SyntaxError: Unexpected token '}'` at line 321 (`})();`). Even if it parsed, at runtime the block would throw `ReferenceError: API is not defined` at the OAuth button handler and `ReferenceError: closeAuth is not defined` at the onAuthChange listener.

**Fix (commit 8cf4382 + inline regression fix):**

| # | Location | Before | After | Reason |
|---|----------|--------|-------|--------|
| 1 | Script 2 top (~L4306) | (missing) | `var API = window.MarkiAPI;` + `var errEl = document.getElementById('authError');` | Restored IIFE-local vars as Script 2 locals; API is used by OAuth handler and onAuthChange listener; errEl is used by OAuth handler |
| 2 | Script 2 (~L4448-4449) | `var _openAuth=openAuth; openAuth=function(m){...showPw reset...};` | Removed (comment: "openAuth's showPw reset now lives in auth-ux.js init()") | Duplicate of auth-ux.js's openAuth override; auth-ux.js handles showPw reset |
| 3 | Script 2 onAuthChange listener (~L4524) | `closeAuth()` | `if(window.Auth&&typeof window.Auth.closeAuth==='function')window.Auth.closeAuth()` | closeAuth is now in auth-ux.js as `window.Auth.closeAuth`; guard against missing module |
| 4 | Script 2 makeGroup button (~L4543) | `openAuth('login')` | `if(typeof window.openAuth==='function')window.openAuth('login')` | openAuth is now `window.openAuth` in auth-ux.js; guard against missing module |
| 5 | Script 2 (~L4546-4548) | `window.openAuth=openAuth; window.openProfile=openProfile; window.closeProfile=closeProfile;` | Removed (comment: "window.openAuth/openProfile/closeProfile exports now live in auth-ux.js") | Duplicate of auth-ux.js's window exports; openAuth/openProfile/closeProfile are IIFE-local in current scope (would throw) |
| 6 | Script 2 end (~L4623) | `})();` (dangling IIFE closer) | Removed | No matching `(function(){` opener — was the auth-UX IIFE closer that was not removed during extraction |

**Verification after fix:**
- `node --check` on all 5 inline blocks in trip-planner.html: **5/5 OK**
- `node --check` on all 16 standalone JS modules: **16/16 OK**
- npm test (utils + import-parser + gallery-lightbox + avatar-crop): **69/69 OK**
- Regression matrix (Phase 8 forensic audit): **15/15 OK**
- Feature isolation tests (Phase 4, 17 tests): **17/17 OK**

**Production impact:** The fix restores Script 2's syntax validity and runtime behavior. The OAuth button handler, API.onAuthChange listener, and makeGroup button handler now work correctly. The app's auth-state listening, Google OAuth login, and group creation flow are restored to their baseline behavior.

---

## 9. Git Status

```
HEAD: 8cf4382 + inline regression fix (9 insertions, 9 deletions on trip-planner.html)
Baseline tag: safety/fcfc557-baseline (annotated, pushed to origin)
Branch: master, 5 commits ahead of origin/master

Changes vs baseline:
  trip-planner.html   | 458 lines removed (auth-UX IIFE, explore IIFE, gallery agg inline,
                        |  nav wiring patched, feature-bootstrap + feature script tags added)
                        |  9 lines added (inline regression fix — this commit)
  index.html          | 5 lines added (gallery row 05)
  ARCHITECTURE_INVENTORY.md | 1225 lines (Phase 1 inventory, no code changes)
  assets/js/core.js   | 865 lines (standalone Core extract, not wired into page)
  assets/js/auth-ux.js| 493 lines (auth UX feature)
  assets/js/explore.js| 161 lines (explore feature)
  assets/js/gallery-agg.js | 166 lines (cross-trip gallery feature)
  assets/js/saved-trips.js | 85 lines (saved trips feature)
  assets/js/feature-bootstrap.js | 105 lines (failure isolation bootstrap)
  tests/feature-isolation.test.js | 466 lines (17 isolation tests)
```

**Working tree:** 1 modified file (trip-planner.html) + 1 new report (MODULARIZATION_REPORT.md) + 3 untracked scratch files (core_extracted_raw.txt, test_fn.js, wrap_test.js — debug leftovers, not committed).

---

## 10. Test Results Summary

| Test suite | Assertions | Passed | Failed |
|-----------|-----------|--------|--------|
| utils.test.js | 34 | 34 | 0 |
| import-parser.test.js | 19 | 19 | 0 |
| gallery-lightbox.test.js | 11 | 11 | 0 |
| avatar-crop.test.js (TAP) | 5 | 5 | 0 |
| regression-matrix.test.js | 15 | 15 | 0 |
| feature-isolation.test.js | 17 | 17 | 0 |
| **TOTAL** | **101** | **101** | **0** |

**Syntax checks:**
- Inline scripts (trip-planner.html): 5/5 OK
- Inline scripts (index.html): 0/0 OK
- Standalone JS modules: 16/16 OK
- New module files (auth-ux.js, explore.js, gallery-agg.js, saved-trips.js, feature-bootstrap.js, core.js): all parse clean

---

## 11. What Was NOT Changed

- Production behavior on the live page (except restoring Script 2's broken syntax — which was a regression, not a behavioral change)
- Any visual styling or CSS
- Any feature logic (auth UX, explore, gallery agg, saved trips all work identically to baseline)
- Any Supabase schema, RLS policies, or backend code
- Any external dependencies
- The `applyPermsUI is not defined` runtime error — already resolved in baseline (commit fcfc557)
- The Saved Trip incident — already resolved in baseline (commit fcfc557)
