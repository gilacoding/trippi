# M0 LIVE VERIFICATION REPORT

**Milestone:** M0 — Production Baseline Lock (live two-browser verification)
**Hermes role:** Inspector / Validator / Documenter (NO implementation)
**Date:** 2026-08-18
**Baseline:** `v0.1-group-first-stable` @ `fdc6651` · production = Pages (`origin/master`)
**Driver:** CDP (Chrome DevTools Protocol) harness, two isolated headless Chrome
profiles, each signs in anonymously → two distinct Supabase users (true A/B).
Target = **production Pages URL** (true baseline), not the local RPC-migration build.

> Read-only + my own test data only. No source/schema/RLS/auth/UI changes.
> Test group + members + items created during the run were deleted in cleanup.
> No Auditor call (observation only).

---

## Environment

- **Browser A (owner):** fresh headless Chrome profile, port 9332, anon user
  `edbfd7c4-…` (run 1) / `…` — authenticated via `sb.auth.signInAnonymously()`.
- **Browser B (second user):** fresh headless Chrome profile, port 9333, anon user
  `ec7ed632-…` (run 1). Separate identity from A.
- **App config present:** `window.__TRIPPI_SUPABASE__` resolved; supabase-js@2 loaded
  (`hasCfg:true, hasSupabase:true` in both).
- **Backend:** Supabase `ishflkcsdzlhhxtanhxf`, anon key `sb_publishable_7g_…`.
- **Target URL:** `https://gilacoding.github.io/trippi/trip-planner.html`
  (deployed `origin/master` build — direct-query architecture, no `trippi-api.js`).

---

## Tests

### Run 1 — full flow (9 checks)
| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | A anonymous auth | PASS | stage:ok, uid obtained |
| 2 | B anonymous auth | PASS | stage:ok, uid obtained |
| 3 | A create group | PASS | groupId `189b0b7a-…` |
| 4 | B join group | PASS | joined:true |
| 5 | A insert shared item | PASS | itemId `a82a36c4-…` |
| 6 | B shared-item visibility (member read) | PASS | memberVisibleCount:1, readError:null |
| 7 | B realtime event received | **FAIL** | count:0 (see Findings F-1) |
| 8 | Anon permission boundary | PASS | REST anon `select` → `[]` (RLS enforced) |
| 9 | Cleanup test data | PASS | group+members+items deleted |

### Run 2 — realtime diagnostic (isolating F-1)
| Check | Result | Evidence |
|---|---|---|
| B subscribe (await + status callback) | PASS | channel `SUBSCRIBED` after 4s |
| B realtime result (2 inserts from A) | **PASS** | events: `INSERT:M0RT-1`, `INSERT:M0RT-2`, count:2 |
| Cleanup | PASS | done |

---

## Findings

| ID | Severity | Area | Problem | Reproduction / Resolution |
|---|---|---|---|---|
| F-1 | **info / harness artifact (not a product defect)** | M0 driver (run 1) | B received 0 realtime events when subscribed via `channel().on().subscribe()` **without `await`** and measured after only 6s. | Re-run 2 subscribed with `await ch.subscribe(cb)`, confirmed `SUBSCRIBED` status, waited 10s → received both INSERTs. **Realtime is functional in baseline.** No code change required. |
| F-2 | info | Verification lag | Run-1 false negative was a test-harness timing/await issue, not Trippi behavior. | Documented; do not open a "realtime broken" task — the subsystem is verified working. |

**No product defects found.** All collaboration primitives (group create, join,
shared-item insert, member read visibility, realtime propagation, RLS anonymous
boundary) behave correctly against the production baseline.

---

## Recommendation

**READY**

Rationale:
- ✅ PWA loading/installability, Supabase connectivity, RLS filtering (M0.1–M0.3) verified.
- ✅ Group creation (M0.4) verified live.
- ✅ Join/invite flow, shared-item visibility, realtime propagation, and permission
  boundary (M0.5) verified live across two distinct anonymous users.
- ✅ Test data cleaned up; no production data affected.
- ⚠️ The single Run-1 FAIL was a measurement artifact in the test harness, confirmed
  passing in the corrected Run-2 diagnostic. No Trippi code change implied.

**Residual (non-blocking, carry-forward as documentation tasks, not M0 fixes):**
- I-1 (doc-drift: `architecture.md` claims "zero direct `.from()` calls" — production
  has ~22; production does not load `trippi-api.js`). Proposed fix: correct the doc.
- I-2 (RPC migration `trippi-api.js` is local-only, undeployed).
- I-4 (pre-existing uncommitted workspace edits — hygiene).

These do not block the **baseline lock**. M0 may be closed as READY.

---

## Reproducibility

Driver scripts (temporary, not committed to repo):
- `C:/Users/ASUS/AppData/Local/Temp/m0_live.py` — run 1 (full flow).
- `C:/Users/ASUS/AppData/Local/Temp/m0_rt_diag.py` — run 2 (realtime diagnostic).

Re-run: launch two isolated Chrome profiles with `--remote-debugging-port`,
navigate to the Pages URL, sign in anonymously, and exercise the group/shared/realtime
flow. No mutations to production data beyond self-created-and-deleted test rows.
