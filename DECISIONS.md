# Trippi — Decisions

This file records important decisions that are LOCKED or APPROVED.
Once recorded, do not re-derive these in conversation.

## D001 — Supabase remains provider of record
**Status:** LOCKED
**Rationale:** Trippi's realtime and auth capabilities depend on Supabase. No replacement planned.

## D002 — Existing table names and columns remain
**Status:** LOCKED
- `groups` — `id (uuid PK gen_random_uuid)`, `name (text NOT NULL)`, `created_by (uuid)`, `created_at (timestamptz default now())`, `destination (text)`, `start_date (date)`, `end_date (date)` — 7 columns, NO `updated_at`
- `group_members` — `group_id (uuid, PK composite)`, `user_id (uuid, PK composite)`, `display_name (text)`, `joined_at (timestamptz default now())` — PK is `(group_id, user_id)` composite, NOT a separate `id` column
- `shared_items` — `id (uuid PK)`, `group_id (uuid)`, `created_by (uuid)`, `title (text NOT NULL)`, `note (text default '')`, `link (text default '')`, `done (boolean default false)`, `created_at (timestamptz default now())`, `date (date)`, `time (text)`, `budget (integer, nullable)` — 11 columns
- `group_expenses` — `id (uuid PK)`, `group_id (uuid)`, `created_by (uuid)`, `name (text NOT NULL)`, `amount (numeric)`, `category (text)`, `note (text default '')`, `date (date)`, `created_at (timestamptz default now())` — 9 columns

## D003 — Realtime topic contract
**Status:** LOCKED
```
group:<uuid>
```
Supabase Realtime subscribes on `postgres_changes` filtered by `group_id=eq.<uuid>`.

## D004 — API boundary pattern
**Status:** LOCKED
Frontend (`trip-planner.html`) → `backend/trippi-api.js` → Supabase JS Client → Postgres
The frontend never calls `sb.from()` or `sb.rpc()` directly. All calls go through the `TrippiAPI` object.

## D005 — Collaboration mutations via RPC
**Status:** APPROVED (v3 review)
All business mutation operations route through transactional Postgres RPC functions in `supabase/003_rpc_collaboration.sql`.
Read operations (`getGroup`, `getItems`, `getMembers`, `getExpenses`) remain direct PostgREST queries.
Realtime channel management (`_getSb`, `subscribeToGroup`, `removeChannel`) stays in `trippi-api.js`.

## D006 — groups table not in realtime publication
**Status:** LOCKED
The `groups` table is NOT in the `supabase_realtime` publication. Group metadata changes are not broadcast via realtime. Group membership changes ARE broadcast (via `group_members` publication).

## D007 — Creator display name
**Status:** LOCKED
`create_group` and `create_group_from_trip` receive `p_display_name` as a parameter.
Default: `'Creator'` if empty/null.
Max length: 40 characters (matches frontend convention).
`join_group` defaults to `'Guest'` if empty/null.

## D008 — Agent separation
**Status:** LOCKED
- ChatGPT: advisor/auditor — architecture, security, gates, verification
- GPT: Supabase operator — DB inspection and approved migrations only
- Hermes: code executor — frontend/backend code changes, tests, browser A/B

## D009 — RPC security model
**Status:** APPROVED
- `SECURITY DEFINER` on all 9 collaboration RPC functions
- `SET search_path = ''` (hardened against schema spoofing)
- No `p_user_id` or `p_created_by` parameters — identity from `auth.uid()`
- `REVOKE EXECUTE FROM PUBLIC` + `GRANT EXECUTE TO authenticated`
- Target-row authorization: update/delete/leave look up group from the target row, not caller-supplied
- `SECURITY DEFINER` owner must be a trusted non-client role (NOT `authenticated`)

## D010 — No destructive migrations during Phase 4
**Status:** LOCKED
No ALTER TABLE, CREATE TABLE, DROP POLICY, DROP TABLE, or trigger modifications during RPC rollout.
Phase 5 (RLS consolidation) is a separate phase with separate gates.

## D011 — trippi-migration.sql is NOT authoritative
**Status:** LOCKED
The file at repo root (`trippi-migration.sql`) defines some column types differently from production:
- `shared_items.date`: migration says `TEXT`, production is `DATE`
- `shared_items.budget`: migration says `numeric NOT NULL default 0`, production is `INTEGER` nullable
- `group_expenses.date`: migration says `text`, production is `DATE`
- `group_expenses.amount`: migration says `numeric NOT NULL default 0`, production is `NUMERIC` nullable
The RPC SQL uses PRODUCTION-VERIFIED types from `.agent/rpc-compatibility-matrix.md`.

## D012 — Idempotency semantics
**Status:** APPROVED
- `create_group`: NOT idempotent (new group each call)
- `join_group`: YES idempotent (ON CONFLICT DO NOTHING, returns existing row)
- `create_group_from_trip`: NOT idempotent (new group each call)
- `create_shared_item`: NOT idempotent (new item each call)
- `update_shared_item`: YES idempotent (same input → same result)
- `delete_shared_item`: YES idempotent (NULL return if not found)
- `create_expense`: NOT idempotent (new expense each call)
- `delete_expense`: YES idempotent (NULL return if not found)
- `leave_group`: YES idempotent (returns false if not a member)

## D013 — Last member can leave
**Status:** LOCKED
`leave_group` does NOT enforce minimum membership. The last member is allowed to leave, making the group empty. This matches current behavior.

## D014 — Frontend RPC migration is a separate step from DB RPC deployment
**Status:** LOCKED
The RPC SQL deployment and the frontend `trippi-api.js` switch are separate deployment steps.
| Frontend must NOT begin switching to `rpc()` calls until GPT confirms all 9 functions are deployed and verified in production.

## D015 — Startup instruction for all agents

**Status:** LOCKED

Before any implementation:
1. Read `PROJECT_STATE.md`
2. Read `DECISIONS.md`
3. Read `HANDOFF.md`
4. Check whether an existing solution exists in the codebase before building new
5. Prefer reuse over invention
6. Escalate before proposing new architecture

## D016 — Proven Pattern First Policy

**Status:** LOCKED

## Principle

Do not invent new architecture, workflows, abstractions, or systems unless an existing proven solution cannot satisfy the requirement.

The default behavior is:

1. **Reuse existing project capabilities.**
   Prefer extending existing APIs, adding thin wrappers, or modifying existing flows.
   Avoid duplicate systems, parallel abstractions, or replacing working components.

2. **Use native platform capabilities.**
   Prefer native database features, existing authentication, existing realtime,
   existing storage, and existing security primitives over custom implementations.

3. **Adapt proven patterns from mature applications.**
   For common capability types, study mature implementations:
   - collaboration → Google Docs / Notion / Slack patterns
   - invitations → Discord / Slack / Google Workspace patterns
   - expenses → Splitwise / Tricount patterns
   - itinerary → Wanderlog / TripIt patterns
   - permissions → Google Drive role model

   Do not copy blindly. Extract the proven pattern and adapt it.

4. **Custom design exception.**
   Custom architecture requires justification:
   - why existing solutions do not fit
   - alternatives considered
   - maintenance cost
   - migration impact

### Required Evaluation Before Building

Before implementing any new feature or system:

**Step 1 — Existing Project Check:** Does the codebase already have this capability? Can the existing architecture be extended instead?

**Step 2 — Platform Check:** Does Supabase already provide this? Does PostgreSQL already solve this? Does the browser/native platform already solve this?

**Step 3 — Industry Pattern Check:** If the capability is common, study mature implementations. Extract the proven pattern and adapt it.

**Step 4 — Custom Design Exception:** If none of the above work, document why, list alternatives considered, estimate maintenance cost, and estimate migration impact.

### Agent Rules

- **ChatGPT (Advisor/Auditor):** Challenge unnecessary invention. Ask "who already solved this?" Prefer proven patterns during reviews.
- **GPT (Database Operator):** Prefer existing Supabase/Postgres primitives. Avoid schema redesign unless required. Do not create new tables/functions if existing mechanisms solve the problem.
- **Hermes (Code Executor):** Preserve existing working code paths. Avoid rewrites. Make the smallest change that achieves the goal.

### Decision Test

Before approving a new component:

> "Is this solving a problem nobody solved before, or are we rebuilding something that already exists?"

If the latter: reuse/adapt instead.