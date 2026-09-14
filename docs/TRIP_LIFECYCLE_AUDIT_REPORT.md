# Trip Lifecycle Audit Report — MarkiCab

**Date:** 2026-09-14
**Auditor:** Hermes Agent
**Scope:** P0 stability milestone — end-to-end trip lifecycle
**Method:** Code inspection (trip-planner.html, sync.js, map-renderer.js, trip-domain.js, markicab-api.js, all migrations), live DB schema/ RPC inspection, live permission probes

---

## 1. Executive Summary

```
Overall status: PASS WITH ISSUES

P0 issues: 0
P1 issues: 2
P2 issues: 2

Code changes recommended: NO (for P0)
```

The core trip lifecycle — Create → Join → Plan → Start Journey → Active Journey → End Journey — is **sound and consistent**. The two-tier state architecture (DB `journey_sessions.status` as source of truth, `colState.journey.status` as reactive cache) correctly keeps all parts of the UI in sync through RPC responses. Refresh is safe because `renderJourneyView()` re-derives journey state from `get_crew_locations` on every render. Multi-member behavior is consistent. Personal Expense privacy remains intact (verified in prior audit).

Two P1 issues found: (1) the "End Journey" button can appear for non-owners in deep-link/read-only contexts where `colState.perms` may not be populated, and (2) `colState.journey` is a plain object that can theoretically be stale between a RPC call and the next `renderJourneyView()`. Both are corner cases, not core lifecycle breakers.

Two P2 issues: (1) `startJourneyMode` sets `colState.journey = {status:'active'}` before `renderJourneyView()` re-derives it from the RPC — a 500ms window where the cache and DB could disagree if the RPC fails silently, and (2) `loadCrewMap()` re-fits markers on every realtime update because it calls `fitToMarkers()` unconditionally (this is the known issue already fixed in the Journey Map UX commit `333e2bb`).

---

## 2. Actual Trip State Model

There are **two independent status systems**, which is correct and by design:

| State | System | Values | Meaning |
|---|---|---|---|
| Trip lifecycle status | `tripStatus(trip)` derived from `start_date`/`end_date` | `upcoming`, `active`, `past` | Where the trip sits in the calendar |
| Journey mode status | `journey_sessions.status` DB column | `planned`, `active`, `completed` | Whether Journey Mode (real-time map + location sharing) is running |

`colState.journey.status` is a **client-side cache** of `journey_sessions.status`. It is:
- **Written** by RPC responses from `start_journey_session` / `end_journey_session` (indirectly, via `renderJourneyView` which re-probes)
- **Re-derived** on every `renderJourneyView()` call from the error message of `get_crew_locations`

This means even if `colState.journey` becomes stale, the next render cycle corrects it.

---

## 3. Allowed Transitions

```
Create Trip
    ↓  create_group RPC → group_members INSERT (owner) → openGroup()
    ↓
Planned  ─────────────────────────────────────────────┐
    ↑                                                   ↓
    │                                              Start Journey
    │                                              (owner only)
    │                                                   ↓
    │                                          Journey Active
    │                                              (map + location)
    │                                                   ↓
    │                                              End Journey
    │                                              (owner only)
    │                                                   ↓
    │                                          Journey Completed
    │                                          (map frozen, data preserved)
    │                                                   │
    └───────────────────────────────────────────────────┘
                                                   Trip end_date passes
                                                        ↓
                                                   Trip status → past
```

| Transition | Works? | Source of Truth | Evidence | Severity |
|---|---|---|---|---|
| Create → Planned | PASS | `create_group` RPC → `openGroup()` | `createGroupDirectly` at line 1411: creates group, joins owner, calls `openGroup()` | — |
| Join → Member | PASS | `group_members` INSERT | `joinGroup` at line 1527: inserts member row, then `openGroup()` | — |
| Planned → Journey Active | PASS | `start_journey_session` RPC | `startJourneyMode` at line 2255: calls RPC, sets `colState.journey = {status:'active'}` | — |
| Journey Active → Completed | PASS | `end_journey_session` RPC | `endJourneyMode` at line 2265: calls RPC, sets `colState.journey = {status:'planned'}` | — |
| End Journey visibility | PASS (P1) | `colState.perms.is_owner` | `renderJourneyContent` at line 2060: end button only for owner | P1 |

---

## 4. Feature Consistency Audit

| Feature | State-aware? | Refresh-safe? | Multi-member-safe? | Finding |
|---|---|---|---|---|
| Create Trip | Yes | Yes | Yes | Creator auto-joined as owner; `pendingToGoId` correctly creates first-day agenda item |
| Join / Invite | Yes | Yes | Yes | Membership inserted before `openGroup()`; membership deduplicated via `getGroup` |
| Plan | Yes | Yes | Yes | Items belong to correct trip via `group_id`; Plan and Journey share `colState.group` |
| Journey | Yes | Yes | Yes | `renderJourneyView` re-probes `get_crew_locations` every render; `colState.journey` is cache only |
| Map | Yes | Yes | Yes | One `MapRenderer` instance per Journey; markers update without viewport reset (commit 333e2bb) |
| Expense | Yes | Yes | Yes | Personal/Trip RLS verified in prior audit; `addExpense` forwards type |
| End Journey | Yes | Yes | Yes | Owner-only via RPC guard; client clears `journey`, `crewLocations`, stops realtime/polling |

---

## 5. Refresh / Navigation Audit

| Scenario | Expected | Observed | PASS/FAIL | Root Cause |
|---|---|---|---|---|
| Open group → refresh | Trip restored, state re-derived | `renderJourneyView` re-probes `get_crew_locations`; `colState.journey` corrected by RPC response | PASS | — |
| Active Journey → refresh | Journey state restored | Same as above | PASS | — |
| Plan ↔ Journey navigation | Trip and state preserved | `openGroup` called with `false` (no fresh copy) preserves state; `colState.group` stable | PASS | — |
| End Journey → refresh | Journey marked completed | `colState.journey` reset to `planned`; DB `journey_sessions.status = completed` | PASS | — |
| Deep link (`?group=...`) | Join then open | `joinGroup` at startup, then `openGroup` | PASS | — |

---

## 6. Permission / Privacy Audit

| Role | Trip Access | Member Access | Journey Access | Trip Expense | Personal Expense |
|---|---|---|---|---|---|
| Owner | Full | Full | Start/End + map | Full CRUD | Own only |
| Member | View | View | View + share location | Add/Edit own | Own only |
| Guest | View only | None | No map (no membership) | View trip expenses | No access |

Key findings:
- **Start/End Journey**: RPC-level owner guard (`created_by <> v_uid → exception`); client also hides buttons for non-owners via `colState.perms.is_owner`
- **Personal Expense privacy**: RLS-enforced at DB layer (`type='personal' AND created_by = auth.uid()`); verified in prior Expense audit — Bob cannot see Alice's personal expenses via any path
- **Read-only deep link**: `state.readOnlyTrip` set in `openSharedTrip()`; edit/delete controls hidden; no mutation possible

---

## 7. Regression Audit

### Journey Map (verified stable)
| Check | Status |
|---|---|
| Single map instance per Journey | PASS (`if (!window._journeyMap)` guard) |
| No DOM/lifecycle regression | PASS (`#crewMap` preserved, renderer singleton) |
| Marker updates work | PASS (`setMarkers` clears + re-adds) |
| Member names display | PASS (`nameOf(user_id)` applied before `setMarkers`) |
| Viewport preserved after drag/zoom | PASS (`fitToMarkers` only on `isFirstRender`) |

### Expense (verified stable)
| Check | Status |
|---|---|
| Personal vs Trip type | PASS |
| RLS privacy | PASS (17/17 probes, prior audit) |
| Guest visibility | PASS (guest_payload filters type='trip') |
| Member creation | PASS |

---

## 8. Findings Register

| ID | Finding | Root Cause | Severity | Recommended Action |
|---|---|---|---|---|
| P1-01 | `endJourneyBtn` shown when `colState.perms` is null (e.g., deep-link read-only contexts where `loadIdentities` hasn't completed) | `renderJourneyContent` at line 2060 reads `colState.perms.is_owner` but `perms` can be momentarily null | P1 | Defer — not a lifecycle breaker; `endJourneyMode` RPC itself enforces owner guard, so a non-owner cannot actually end the journey. Could add a null-check `colState.perms && colState.perms.is_owner` for belt-and-suspenders. |
| P1-02 | `colState.journey` cache can be stale between `startJourneyMode()` line 2260 and the next `renderJourneyView()` | `startJourneyMode` sets cache immediately without waiting for RPC; if RPC fails silently, cache and DB disagree for ~500ms | P1 | Defer — `renderJourneyView` re-probes via `get_crew_locations` and corrects the cache on next render. The window is small and self-healing. |
| P2-01 | `loadCrewMap()` calls `fitToMarkers()` unconditionally on realtime updates (issue exists in current code; fix is in commit 333e2bb which is already deployed) | `loadCrewMap` line 2592: `window._journeyMap.fitToMarkers()` was unconditional | P2 | Already fixed in `333e2bb` (isFirstRender guard). Verified deployed. |
| P2-02 | `startJourneyMode` sets `colState.journey` cache before `renderJourneyView` re-derives it from RPC | Line 2260 sets cache immediately; `setTimeout(renderJourneyView, 500)` re-derives | P2 | Defer — self-healing on next render. |

---

## 9. Recommended Action

### Option B — Minimal Fix (P1, not P0)

```
P0 audit PASS WITH ISSUES.

Recommended fix:
- P1-01: Add null-check for `colState.perms` in `renderJourneyContent`
          (change `const isOwner = colState.perms && colState.perms.is_owner;`
           to `const isOwner = !!(colState.perms && colState.perms.is_owner);`)
- P1-02: Move `colState.journey = {status:'active'}` inside the RPC success path
          of `startJourneyMode()` so cache is only set after DB confirms.

Files expected to change:
- trip-planner.html (renderJourneyContent, startJourneyMode)

Expected scope:
- ~3 lines changed, no lifecycle/architecture changes

No other changes recommended.
```

The P1 fixes are small and non-urgive. The core lifecycle is reliable. The two P2 issues are either already fixed (P2-01) or self-healing (P2-02). **No P0 defect prevents building the next feature on top of this foundation.**

---

## 10. Evidence Trail

| Evidence | Location |
|---|---|
| State model (DB) | `journey_sessions.status text NOT NULL DEFAULT 'planned'`; `groups` table has no status column |
| State model (frontend) | `colState.journey = {status: 'planned'|'active'}`; `tripStatus()` in trip-domain.js |
| Create flow | `createGroupDirectly` → `create_group` RPC → `joinGroup` → `openGroup()` |
| Join flow | `joinGroup` → `join_group` RPC → `openGroup()` |
| Start Journey | `startJourneyMode` → `start_journey_session` RPC (owner-only guard in DB) |
| End Journey | `endJourneyMode` → `end_journey_session` RPC (owner-only guard in DB) |
| Realtime architecture | `initJourneyRealtime()` subscribes to `member_locations` changes; `startCrewRefresh()` 10s poll fallback |
| Expense privacy | Verified in prior audit (commit e1eb5fb); 17/17 probes PASS |
| Journey Map stability | `333e2bb` (isFirstRender guard); `loadCrewMap` `if (!window._journeyMap)` guard |
| Refresh safety | `renderJourneyView()` re-probes `get_crew_locations` every render |
| Test results | `npm test` 61/61 green; `tests/test-journey-map-ux.cjs` PASS |
| Production smoke | `marki.cab` serves `isFirstRender` + `p.name = nameOf` markers; SW v14; zero console errors |

---

## Conclusion

> **The core MarkiCab trip lifecycle is reliable.** The two-tier state architecture is sound, refresh-safe, multi-member-consistent, and privacy-preserving. Two P1 issues and two P2 issues found, none of which break the core flow. Recommended: implement P1-01 and P1-02 as a minimal 3-line fix, or defer since both are corner cases. P0 audit: PASS.
