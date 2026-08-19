# TRIPPI Decisions

## API Boundary Layer (2026-08-15)
- **Decision:** Extract all direct Supabase calls from `trip-planner.html` into `backend/trippi-api.js`, creating a stable contract boundary.
- **Rationale:** Provides the seam needed to introduce transactional RPCs without rewriting the frontend. The frontend calls `API.*()` methods, not `sb.from()` directly.
- **Status:** Phase 1 complete. All 22 direct Supabase calls replaced with API wrapper calls. Dead code removed. `shareGroup` shadowing bug fixed.

## RPC Strategy (2026-08-16)
- **Decision:** Use RPCs only for business transactions (mutations with invariants), not for simple reads or realtime channel management.
- **Rationale:** Reads (`getGroup`, `getMembers`, `getItems`, `getExpenses`) don't need transactional guarantees. Mutations (`createGroup`, `joinGroup`, `addItem`, `addExpense`, `updateItem`, `deleteItem`, `leaveGroup`) benefit from atomic transactions and centralized authorization.
- **Direction:** `create_group` RPC wraps INSERT into `groups` + INSERT into `group_members` in a single transaction. `join_group` RPC uses `INSERT ... ON CONFLICT DO NOTHING` to eliminate TOCTOU race. `create_shared_item` and `create_expense` RPCs are thin wrappers (future extensibility).

## RPC Compatibility Matrix (2026-08-16)
- **Decision:** Production schema verified via live PostgREST column probes and authenticated session tests before writing any RPC SQL.
- **Findings:** All 5 tables exist. `group_members` PK is composite `(group_id, user_id)` with unique constraint (409 on duplicate). `locations` has no `id` column — PK is `(group_id, user_id)`. `shared_items.title` and `group_expenses.name` are NOT NULL. `note`/`link` default to `''`. `budget` allows NULL. No existing RPC functions. RLS is permissive (`FOR ALL true`) for all tables except `groups`.
- **CRITICAL:** `trippi-migration.sql` defines `shared_items.date` as TEXT and `budget` as NOT NULL, but production has DATE type and nullable budget. The RPC SQL is based on PRODUCTION-VERIFIED types, not the migration file.
- **File:** `.agent/rpc-compatibility-matrix.md`

## RPC Strategy Applied (2026-08-16)
- **Decision:** RPCs only for business mutations (create/update/delete), NOT for reads or realtime channel management.
- **Reads stay as direct PostgREST queries:** `getGroup`, `getItems`, `getMembers`, `getExpenses` — no RPC needed, no benefit.
- **Mutations route through RPCs:**
  1. `create_group` — atomic groups + group_members INSERT with `auth.uid()` for `created_by`, name/display-name validation, date range check
  2. `join_group` — membership check + `INSERT ... ON CONFLICT (group_id, user_id) DO NOTHING` using verified composite PK, eliminates TOCTOU race
  3. `create_shared_item` — membership gate + `title` NOT NULL enforcement (matches production constraint)
  4. `create_expense` — membership gate + `name` NOT NULL enforcement (matches production constraint)
- **Keep direct Supabase for simple operations:** `updateItem`, `deleteItem`, `deleteExpense`, `leaveGroup` — single-row operations with no multi-table invariants, no benefit from RPC overhead.
- **Security:** All 4 RPCs use `SECURITY DEFINER`, `SET search_path = ''`, reject unauthenticated callers (`auth.uid() IS NULL`), enforce membership gates. `REVOKE EXECUTE FROM PUBLIC` + `GRANT EXECUTE TO authenticated`.
- **File:** `supabase/003_rpc_collaboration.sql` (DRAFT v2 — not executed)
- **Frontend migration map:** `.agent/frontend-rpc-migration-map.md` (draft, no code changes yet)
- **No `created_by` parameter in RPCs** — uses `auth.uid()` server-side. Frontend calls must remove `created_by` from API method params.
- **Return shape changes:** `create_group` returns `group_id`/`group_name` (not `id`/`name`). `trippi-api.js` normalizes this for the frontend.

## Realtime Subscription Fix (2026-08-15)
- **Problem:** `ch.subscribe()` Promise resolves before `postgres_changes` subscription is confirmed (`SUBSCRIBED`). Observed `channelState: "joined"` instead of `SUBSCRIBED`.
- **Decision:** Replace bare `await ch.subscribe()` with callback-based gate that resolves only on `SUBSCRIBED`.
- **Location:** `trip-planner.html`, function `openGroup()`, line 279
- **Temporary:** Added `[RT STATUS]` and `[RT EVENT]` console logs for verification only.
- **Commit status:** NOT YET COMMITTED — awaiting A/B realtime test completion and approval to remove logs.

## Deploy Source
- **Decision:** `trippi-deploy/` is the GitHub Pages source. Changes in `mockup/` must be mirrored to `trippi-deploy/` before deployment.
- **Rationale:** Separate git repo history in `mockup/`; deploy folder is clean.

## Browser Automation
- **Decision:** Use MCP `chrome-devtools-win` for single-page observation. Direct Node.js WebSocket to Chrome debug ports is unreliable in this environment.
- **Rationale:** Port 9223 times out on `Runtime.evaluate` despite page being listed; MCP provides stable single-page access.
