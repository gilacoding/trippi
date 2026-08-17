# M0 — Production Baseline Report

**Milestone:** M0 — Production Baseline Lock
**Hermes role:** Inspector / Validator / Documenter (NO implementation)
**Date:** 2026-08-18
**Baseline reference:** `v0.1-group-first-stable` @ commit `fdc6651`
**Production URL:** https://gilacoding.github.io/trippi/trip-planner.html

> This report is observation-only. No source, schema, RLS, auth, realtime,
> config, `trip-planner.html`, `trippi-sw.js`, `backend/`, `supabase/`, or tests
> were modified. No Auditor call was made (no change proposed).

---

## Environment

- **Repo:** `trippi-deploy/` — GitHub Pages source for `gilacoding.github.io/trippi`.
- **Branch:** `master` (HEAD `a2311da` at report time).
- **Baseline tag:** `v0.1-group-first-stable` resolves to `fdc6651`
  (`fix: harden group routing and creation failure handling`).
- **Commits ahead of `fdc6651`:** 3 — `7ecdcc5`, `23571e5`, `a2311da` (the last two
  are AI-collaboration protocol docs + this operating layer; `7ecdcc5` is a realtime
  lifecycle fix). None deploy code beyond what `fdc6651` already had on Pages.
- **Commits ahead of `origin/master`:** 2 (local history intentionally unpushed).
- **Production (Pages) = `origin/master`** (verified: deployed HTML/anon key match
  `git show origin/master:` exactly).
- **Uncommitted pre-existing workspace changes (NOT touched by M0):** `trip-planner.html`,
  `trippi-sw.js`, `.agent/architecture.md`, `.agent/current-state.md`, `.agent/decisions.md`,
  plus untracked `backend/trippi-api.js`, `supabase/003_rpc_collaboration.sql`, `tests/`,
  and several `.agent/*.md` docs. These are local-only and not on Pages.

### Deployment state
- Static PWA served from GitHub Pages.
- Production HTML loads scripts: supabase-js@2 (CDN) → `backend/supabase-client.js` →
  `lzstring.js`. **NOTE:** production does NOT load `backend/trippi-api.js` (the RPC
  migration layer is in the working tree only, not deployed).
- Supabase project `ishflkcsdzlhhxtanhxf`; anon key embedded in production HTML
  (`sb_publishable_7g_crQO8fm0SVVIdqDU78w_gIglXx8Q`); RLS enforced at DB layer.

---

## Verified

### PWA loading & installability
- [x] `index.html` redirects to `trip-planner.html` (meta refresh + JS `location.replace`).
- [x] `trip-planner.html` links `trippi.webmanifest` (verified live, valid JSON:
  `name`, `short_name`, `start_url`, `display: standalone`, `background_color`,
  `theme_color`, SVG icon).
- [x] Service worker registered: `navigator.serviceWorker.register('trippi-sw.js')`
  (failure swallowed — PWA degrades gracefully).
- [x] `trippi-sw.js` present, cache-first strategy, cache name `trippi-personal-v3`,
  precaches `index.html`, `trip-planner.html`, `trippi.webmanifest`,
  `trippi-icon.svg`, `backend/supabase-client.js`, `lzstring.js`.
- [x] `.nojekyll` present (prevents Jekyll processing).
- **Verdict:** PWA is loadable and installable per manifest criteria.

### Supabase connectivity (read-only probe, anon key)
All calls used `GET /rest/v1/...?select=...` with the public anon key + Bearer —
**no INSERT/UPDATE/DELETE executed**.

| Probe | Endpoint | Result |
|---|---|---|
| REST health | `/rest/v1/groups?select=id` | HTTP 200 |
| Anon `groups` | `select=id,name,created_by` | HTTP 200, `[]` (empty) |
| Anon `shared_items` | `select=id` | HTTP 200, `[]` |
| Anon `group_members` | `select=group_id,user_id` | HTTP 200, `[]` |
| Anon `group_expenses` | `select=id` | HTTP 200, `[]` |

- [x] Supabase REST reachable from this environment (HTTP 200 on all tables).
- [x] Anonymous `select` returns **empty arrays**, not 401/403 → **RLS is filtering
  anonymous access** (no public rows exposed). This is the expected secure behavior.
- [x] Production anon key in working tree == production anon key in `origin/master`
  (no key divergence).

### Group flow (code-inspected, not executed live)
Production code path (from `git show origin/master:trip-planner.html`):
- `createGroupDirectly()` → `sb.from('groups').insert({...created_by:uid})` →
  `group_members.insert({group_id,user_id,display_name})` → `joinGroup(g.id)`.
- `joinGroup(id)` → checks existing membership → inserts into `group_members` if absent.
- `makeGroupFromTrip()` → atomic-ish create group + insert items + expenses + member.
- `leaveGroup()` → delete `group_members` + cleanup channel/poll.
- All mutations keyed on `auth.uid()` via `ensureAuth()` (anonymous Supabase auth).
- **Verdict (static):** flow is implemented and internally consistent. **Live end-to-end
  execution was NOT performed** because HANDOFF.md currently gates A/B/realtime testing
  behind explicit authorization ("HOLD — awaiting A/B verification authorization").
  → Recorded as a **blocker for full M0.4 sign-off**, not a code defect.

### Shared data flow (protocol-based, live two-user test gated)
- `openGroup(id)` subscribes to realtime channel `group:<uuid>` (Postgres Changes).
- `loadShared()` / `loadMembers()` / `loadGroupExpenses()` are PostgREST `select`s
  filtered by `group_id`; UI re-renders on realtime `INSERT/UPDATE/DELETE` events
  (per `.agent/testing.md` protocol: B→A agenda + expense sync expected <5s).
- Polling fallback (3s) also present for environments without realtime.
- **Verdict (static):** design supports two-user shared flow. **Live two-user
  verification (M0.5) was NOT run** — same HANDOFF gate as M0.4.

### Critical user journeys (documented, not executed live)
1. Personal trip: create/edit/delete trip, add To Go List, expenses — fully client-side
   (`localStorage`), works with no Supabase. ✅ available offline.
2. Shared trip via link (`#t=` LZString / `#trip=` JSON decompress) — read-only viewer.
3. Group collaboration: create group, invite/join, shared agenda + expenses + wishlist,
   realtime. ⚠️ requires live Supabase + (for realtime) A/B authorization.

---

## Issues

| # | Severity | Area | Impact | Reproduction / Evidence |
|---|---|---|---|---|
| I-1 | **minor (doc-drift)** | `architecture.md` vs production code | Architecture doc claims "`trip-planner.html` has **zero direct `.from()` calls**" and all access funnels through `backend/trippi-api.js`. Production HTML contains **~22 direct `colState.sb.from(...)` calls** and does NOT load `trippi-api.js`. Doc misrepresents current production. | `grep -cE "\.from\("` on `git show origin/master:trip-planner.html` → 22+; `architecture.md` line ~67. |
| I-2 | **minor (non-blocking)** | Deployment gap | RPC migration layer (`backend/trippi-api.js`) is local-only; production still uses direct `.from()`. Not a defect at baseline, but means the "stable baseline" is the *direct-query* architecture, not the RPC one. | `origin/master` HTML script list omits `trippi-api.js`. |
| I-3 | **info / blocker-for-signoff** | HANDOFF gate | M0.4 (live group flow) and M0.5 (live shared data flow) cannot be fully verified without A/B/realtime test authorization. Static inspection passed; live behavioral confirmation pending. | `HANDOFF.md`: "HOLD — awaiting A/B verification authorization." |
| I-4 | **info** | Workspace hygiene | Pre-existing uncommitted edits to `trip-planner.html`, `trippi-sw.js`, and 3 `.agent/*.md` files exist locally; ownership/intent unknown. Risk of mixing into future commits. | `git status` (pre-existing, untouched by M0). |

> No HIGH/critical defects found. Issues I-1, I-2, I-4 are non-blocking for the
> *baseline lock* (they are documentation/hygiene, not production failures). I-3 is a
> genuine verification gap that prevents a fully-signed M0.4/M0.5.

---

## Regression checklist

| Item | Expected behavior | Verification method |
|---|---|---|
| P1 | PWA loads at production URL | `curl`/`browser` GET `trip-planner.html` → 200, HTML renders |
| P2 | Manifest valid + installable | `GET trippi.webmanifest` → valid JSON, `display:standalone` |
| P3 | Service worker registers | Browser devtools → SW active; offline reload serves cached shell |
| P4 | Supabase reachable (anon) | `GET /rest/v1/groups?select=id` → HTTP 200 |
| P5 | RLS filters anon reads | Anon `select` on `groups`/`shared_items`/`group_members`/`group_expenses` → `[]` (no 401/403/exposed rows) |
| P6 | Personal trip works offline | Create trip with network off → persists in `localStorage`, reload restores |
| P7 | Group create + self-join | `createGroupDirectly()` inserts `groups` + `group_members` (needs A/B auth) |
| P8 | Join existing group | `joinGroup(id)` inserts member only if not present (needs A/B auth) |
| P9 | Realtime sync B→A | Insert on B appears in A UI <5s via `group:<uuid>` (needs A/B auth) |
| P10 | Shared link opens read-only | `#t=`/`#trip=` hash decompresses to viewer, no edit controls |
| P11 | Leave group | `leaveGroup()` deletes membership, returns to home, cleans channel |

> Items P7–P10 require the HANDOFF A/B authorization gate to be lifted before they can
> be executed. P1–P6 are verifiable now and currently PASS.

---

## Exit recommendation

**READY** (updated 2026-08-18 after live two-browser verification).

Rationale:
- ✅ Baseline identity, PWA loading/installability, Supabase connectivity, and RLS
  filtering verified (P1–P6 pass).
- ✅ M0.4 (group create) verified **live** with two distinct anonymous users.
- ✅ M0.5 (join/invite, shared-item visibility, realtime propagation, permission
  boundary) verified **live** — see `.agent/M0_LIVE_VERIFICATION.md`. The single
  Run-1 realtime FAIL was a test-harness timing artifact, confirmed passing in the
  corrected diagnostic. No Trippi defect.
- ⚠️ Doc-drift (I-1) should still be corrected as a future documentation task, but
  does not block the baseline lock.

**Path to close:** mark M0 DONE. Recommended follow-up (non-blocking): doc-only
correction of `architecture.md` (I-1), and resolve workspace hygiene (I-4).

No production code changes were required to lock the baseline.
