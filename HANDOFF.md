# CURRENT HANDOFF

Last updated: 2026-08-17

## Current phase
Phase 4 — Frontend RPC migration complete, awaiting A/B test authorization

## Current gate
**HOLD — awaiting A/B verification authorization**

Database RPCs are deployed (GPT confirmed `DB RPC GO`). Frontend RPC migration in `trippi-api.js` is complete. A/B realtime testing is the next gate.

## No blocking issues

DB owner verification is complete. Security DEFINER owner verified as `postgres`.

## GPT must do next (Supabase Operator)
None — RPCs are deployed and verified. GPT is on standby for A/B test issues.

## Hermes must do next (Code Executor)
**WAIT — awaiting A/B verification authorization.**

Frontend RPC migration is complete. Do not deploy to browser yet.
When authorized, run:
1. Chrome A/B test (9222 vs 9223)
2. 13 behavior test scenarios
3. Realtime propagation verification on `group:<uuid>`
4. Verify return shape compatibility (normalized in trippi-api.js)

## ChatGPT must do next (Advisor/Auditor)
After A/B test authorization, audit the results and authorize final deployment.

## Last completed

| Task | Agent | Status |
|---|---|---|
| Phase 1: API boundary extraction | Hermes | ✅ Complete |
| Phase 3: RPC SQL draft v3 + corrections | Hermes | ✅ Reviewed |
| Phase 3: SECURITY DEFINER typo fix | Hermes | ✅ Applied |
| Phase 3: Security note correction | Hermes | ✅ Applied |
| Phase 3: Realtime wording correction | Hermes | ✅ Applied |
| Phase 4: Security audit of 003_rpc_collaboration.sql | Hermes | ✅ Complete |
| Phase 4: State management setup (PROJECT_STATE/DECISIONS/HANDOFF) | Hermes | ✅ Complete |
| Phase 4: SQL security audit deliverable | Hermes | ✅ Complete |
| Phase 4: DB owner verification | GPT | ✅ Verified — DB RPC GO |
| Phase 4: Frontend RPC migration (trippi-api.js) | Hermes | ✅ Complete |
| Phase 4: Mirror to mockup/ | Hermes | ✅ Complete |
| Phase 4: JS syntax validation + sync verification | Hermes | ✅ Complete |
| Phase 4: A/B realtime test + 13 behavior tests | Hermes | ⏸️ HOLD — awaiting authorization |

## Forbidden right now

- RLS changes
- Schema changes (ALTER TABLE, CREATE TABLE)
- Trigger/publication changes
- CREATE FUNCTION execution (already done by GPT)
- Any DDL/DML in Supabase (functions deployed)
- Browser A/B testing (not yet authorized)

## Files

| File | Purpose |
|---|---|
| `supabase/003_rpc_collaboration.sql` | RPC SQL draft v3 (DEPLOYED by GPT) |
| `.agent/rpc-compatibility-matrix.md` | Production schema reference |
| `.agent/frontend-rpc-migration-map.md` | Frontend changes plan |
| `.agent/sql-security-audit.md` | Hermes security audit |
| `backend/trippi-api.js` | ✅ API boundary — RPC migration complete |
| `trip-planner.html` | Unchanged (zero direct .from() calls) |
| `PROJECT_STATE.md` | Canonical project state |
| `DECISIONS.md` | Immutable decisions (D001–D016) |
| `HANDOFF.md` | Current gate + operational state |

## Return Shape Changes (trippi-api.js internal)

| API Method | RPC | Normalization |
|---|---|---|
| `createGroup()` | `rpc('create_group')` | `group_id`→`id`, `group_name`→`name` |
| `makeGroupFromTrip()` | `rpc('create_group_from_trip')` | `group_id`→`id`, `group_name`→`name`, + `member_count` |
| `joinGroup()` | `rpc('join_group')` | Pass-through (extra `already_joined` field, ignored by HTML) |
| `leaveGroup()` | `rpc('leave_group')` | `removed` boolean, ignored by HTML (fire-and-forget) |
| `addItem()` | `rpc('create_shared_item')` | Pass-through (same column names) |
| `updateItem()` | `rpc('update_shared_item')` | Pass-through |
| `deleteItem()` | `rpc('delete_shared_item')` | `deleted_id` (HTML ignores return) |
| `addExpense()` | `rpc('create_expense')` | Pass-through |
| `deleteExpense()` | `rpc('delete_expense')` | `deleted_id` (HTML ignores return) |