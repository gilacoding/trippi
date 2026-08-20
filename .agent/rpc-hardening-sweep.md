# RPC Hardening Sweep (Trippi) — verified procedure (2026-08, R2-sharpened)

When a public RPC is suspected broken, do NOT patch blind. Follow the **read-only-first,
reproduce-then-fix, new-card-per-bug** discipline. This is a HIGH-risk class (function
definitions) → requires the Auditor gate / Founder awareness per change-risk rules.

## 0. Preconditions
- Board: add a card per bug (R1, R2, …) under "P2 RPC Hardening Sweep". Do NOT reopen Phase 4.
- No RLS / auth / schema-policy change. Fixes preserve: owner=postgres, SECURITY DEFINER,
  search_path="", authenticated EXECUTE, PUBLIC access, return shape, authenticated execution.
- **Workflow gate (user directive):** audit is strictly READ-ONLY first. Do NOT proactively fix
  every suspicious pattern. Only patch a card AFTER its failure is proven by reproduction. Each
  confirmed bug → its own card. Preserve RPC signatures + frontend return contracts.

## 1. Read-only: pull the DEPLOYED definition (not local SQL files)
Legacy account has NO `supabase` CLI and NO admin user-create (`/v1/projects/{REF}/auth/users` = 404).
Query `pg_proc` via the Management API SQL endpoint:
```sql
SELECT p.proname AS fname,
       pg_get_function_arguments(p.oid) AS args,
       pg_get_function_result(p.oid)    AS rettype,
       p.prosecdef AS security_definer,
       p.proowner::regrole::text AS owner,
       p.proconfig AS proconfig,
       has_function_privilege('authenticated'::regrole, p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('anon'::regrole, p.oid, 'EXECUTE') AS anon_exec,
       p.proacl AS acl,
       pg_get_functiondef(p.oid) AS def
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('<a>','<b>',...)
ORDER BY p.proname;
```
Run via Node `https` POST to `https://api.supabase.com/v1/projects/ishflkcsdzlhhxtanhxf/database/query`
with headers `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>`, `apikey: <same>`, `Content-Type: application/json`,
body `{"query": "<sql>"}`. Token from `C:/Users/ASUS/AppData/Local/hermes/.env` (`SUPABASE_ACCESS_TOKEN=`).
This endpoint runs arbitrary SQL as postgres — use for SELECT (read) AND for the DDL apply step.
**NOTE:** the endpoint does NOT support `$1` params — inline values (e.g. an `IN (...)` list) directly.
`pg_get_functiondef` may render spacing differently than source, so a `LIKE '%RETURNING ge.id%'`
text check can false-negative; rely on reproduction + `proconfig`/`acl` instead.

## 2. Read-only: check the REAL column types (return-shape mismatches)
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('<t1>','<t2>',...) ORDER BY table_name, ordinal_position;
```
Compare against each function's `RETURNS TABLE(...)` declared types. Known text-column traps:
`group_expenses.date` = **text**, `shared_items.date` = **text**, `shared_items.budget` = **numeric**.
A mismatch (e.g. declaring `date date` or `budget integer` when columns are text/numeric) is a latent 42804.

## 3. Resolve RPC inventory BEFORE assuming the DB is wrong
A frontend "calls a missing RPC" alarm is often a false positive. The deployed frontend
(`trippi-api.js`) exposes DESCRIPTIVE method names (`addItem`, `updateItem`, `deleteItem`,
`addExpense`, `addItemsBatch`, `addExpensesBatch`, `makeGroupFromTrip`) that ALL map internally to
real `.rpc()` calls. **Checklist:** (a) grep the deploy tree for the suspect name; (b) read the
`.rpc()` site to see the real function; (c) cross-check `pg_proc`. In the 2026-08 sweep, the 7 names
`update_expense/add_item/add_expense/add_items_batch/add_expenses_batch/update_item/delete_item` were
NOT in `pg_proc` AND NOT in the frontend — they were audit-checklist artifacts, not product defects.
Classify each as: confirmed-missing / implemented-elsewhere / dead-code / unresolved. Only confirmed
actionable defects get a card.

## 4. Reproduce in an AUTHENTICATED context (prove, don't assume)
Mint a distinct anonymous identity (legacy server returns `access_token` at TOP level, not wrapped in
`data.user` — the SDK shape mismatch is why in-app `signInAnonymously` failed but the REST endpoint works):
```js
const data = JSON.stringify({ data: { type: 'anonymous' } });
// POST /auth/v1/signup  with apikey + Authorization Bearer <anonKey>  → json.access_token
```
anonKey = `sb_publishable_7g_crQO8fm0SVVIdqDU78w_gIglXx8Q` (from `window.__TRIPPI_SUPABASE__` in the HTML head).
For the target RPC, first create a group the identity is a member of. `create_group` has FIVE required
params (no defaults) — omitting any → PostgREST **404** "Searched for the function … no matches"
(which is NOT a missing function):
```js
const cg = await rpc('create_group',
  { p_name:'X', p_destination:'', p_start_date:'2026-08-18', p_end_date:'2026-08-20', p_display_name:'T' }, tok);
const gid = cg.json[0].group_id;   // RETURNS TABLE → array; read [0]
const ce = await rpc('create_expense',
  { p_group_id: gid, p_name:'Lunch', p_amount:50, p_category:'food', p_note:'t', p_date:'2026-08-18' }, tok);
// ce.status 400 + body.code 42702 / 42804 = reproduced
```
Then for the specific RPC under test (e.g. `update_shared_item`): create the parent row, then call it.

## 5. The defect class — unqualified name collides with a RETURNS TABLE OUT variable
PL/pgSQL raises **42702 "column reference X is ambiguous"** whenever an unqualified name in a query
inside the function could be BOTH a table column (FROM/INSERT target) AND a `RETURNS TABLE` OUT variable.
It surfaces on the FIRST colliding name encountered (id, group_id, name, …) — not necessarily the one
you expect. Proven collision sites across the 2026-08 sweep:
- `RETURN QUERY INSERT ... RETURNING id, group_id, created_by, name, ...` (create_expense) — RETURNING list.
- `return query select id, group_id, created_by, title, ... from public.shared_items` (update_shared_item) — even WITH a FROM clause, unqualified names collide with OUT vars.
- `select group_id, created_by, title into v_... from public.shared_items` (update_shared_item) — SELECT-INTO.
- `where group_id = v_group_id` in a `not exists (...)` subquery (update_shared_item) — unqualified WHERE.
- `on conflict (group_id, user_id) do nothing` (create_group_from_trip) — ON CONFLICT COLUMN-LIST form
  collides with the OUT var `group_id`. **Fix:** use the CONSTRAINT-NAME form `on conflict on constraint
  group_members_pkey do nothing` (this is what `create_group` already does — the safe pattern).
**WHY create_group / join_group / create_shared_item survive:** they QUALIFY every column with a table
alias (`g.` / `gm.` / `si.` via `INSERT ... AS si` + `RETURNING si.id AS "id", ...`). Any function that
qualifies all colliding refs is SAFE.

## 6. Minimal fix (preserve everything except the broken expression)
For 42702: qualify every colliding ref with a table alias (`si.`, `gm.`, `g.`). Rules:
- `INSERT INTO public.<table> AS ge (...) VALUES (...)` — the `AS` is REQUIRED (`INSERT ... ge` → 42601).
- In `UPDATE ... SET`, the SET **target** column must be UNQUALIFIED (`set title = ...`), but the RHS may
  be qualified (`coalesce(v_title, si.title)`). `set si.title = ...` → 42703 "SET target columns cannot be
  qualified with the relation name".
- `return query select si.id, si.group_id, ... from public.<table> si where si.id = p_id;`
- `on conflict on constraint <pk> do nothing;` (never the column-list form for functions with a
  colliding OUT var).
For 42804 (type mismatch): either cast in RETURNING (`ge.date::date`) OR align `RETURNS TABLE` to the
real column types (e.g. `date text, budget numeric` — this also matches the sibling `create_shared_item`
contract the frontend already consumes). Prefer the cast when only the RETURN path needs changing; prefer
RETURNS alignment when the declared type was simply wrong (as in update_shared_item). Apply the 42702 fix
FIRST, re-run, read the new 42804 error, THEN fix the type — do not guess both at once.

## 7. RETYPE requires DROP + CREATE
`CREATE OR REPLACE FUNCTION` with a CHANGED `RETURNS TABLE(...)` type fails: `42P13 cannot change return
type of existing function / Row type defined by OUT parameters is different`. You must `DROP FUNCTION IF
EXISTS public.<rpc>(<exact arg types>);` then `CREATE FUNCTION ...` (same body otherwise). Keep
SECURITY DEFINER + `SET search_path TO ''`; ownership is inherited from the postgres session. A function
left with `acl: null` keeps the DEFAULT grant (anon can EXECUTE, gated internally by `auth.uid()`) —
that matches `create_shared_item`'s existing design and is NOT a weakening; `create_expense` instead keeps
an explicit `authenticated` grant (`{postgres=X, authenticated=X}`).

## 7b. ⚠ OVERLOAD-creation pitfall (live-verified 2026-08, M3 Phase 2)
`CREATE OR REPLACE FUNCTION` replaces a function ONLY IF the new argument signature matches an existing
one (identity = name + arg types). **Changing the arg list — adding a param, changing a type, or reordering —
creates a NEW OVERLOAD instead of replacing.** The old signature silently survives. When two overloads of an
RPC exist with near-identical params, PostgREST returns an **ambiguous-function error** ("Could not choose
the best candidate function between: ...p_date date / ...p_date text") that is NOT a stale cache, NOT a
missing grant, and NOT a body defect.

**Real case:** `create_expense(p_date text)` was canonical; an intermediate migration ran
`CREATE OR REPLACE FUNCTION create_expense(..., p_date date, p_paid_by)`. Since `date ≠ text`, Postgres
stacked a second overload instead of replacing → client `create_expense` calls became ambiguous → expense
feature broken, surfaced as a "backend" failure.

**Detection (always enumerate ALL overloads, not one):**
```sql
SELECT pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='<rpc>';
```
Count > 1 with signatures differing only in a changed/reordered/added param → stealth overload.

**Fix:** explicitly `DROP FUNCTION public.<rpc>(<all arg types of the unwanted overload>);` by its exact
full signature, then ensure the canonical signature is `CREATE`d (or `CREATE OR REPLACE` on the canonical
signature). **Do NOT rely on `CREATE OR REPLACE` to "fix" signature drift** — it stacks yet another overload.

**Prevention when evolving an RPC signature:** always `DROP FUNCTION IF EXISTS public.<rpc>(<old arg types>);`
then `CREATE FUNCTION` the new one. After any DROP/CREATE, RELOAD the PostgREST cache from a **direct
SQL-editor connection** (`NOTIFY pgrst, 'reload schema';`) — the Mgmt SQL-endpoint NOTIFY will NOT
propagate. Then re-enumerate (`pg_proc`) to confirm exactly ONE overload remains.

## 8. Verify after apply (all of these)
- Re-run the reproduction → target RPC returns **200** + correct row (authenticated member).
- Full-RPC smoke: call ALL deployed RPCs as an authenticated member; assert each is 200 and no 42xxx
  defect remains (a cheap, authoritative "no further collisions" proof — see `scripts/r2_smoke_all.js`).
- Re-query `pg_proc`: owner=postgres, prosecdef=true, proconfig=`["search_path=\"\""]`, auth_exec=true.
- Non-member call still rejected (`not a group member`); validation still rejects empty/invalid input.
- Return shape unchanged (frontend contract intact: `date` string, `amount`/`budget` number).
- Do NOT silently expand scope: Phase 4 frozen; RLS/auth untouched; only function bodies (+ return-type
  alignment where proven) changed.

## 9. Sweep the OTHER public RPCs for the same class
Read defs for every `public` function (the 2026-08 inventory = 10 RPCs + 3 broadcast triggers). For each,
check: RETURNS TABLE OUT names vs table columns, RETURN QUERY/SELECT/SELECT-INTO/WHERE/ON-CONFLICT
unqualified refs, RETURN-type vs real column types, numeric↔integer / text↔date mismatches. Each confirmed
bug → its own card (R2-1, R2-2, …). No bulk changes.

## 2026-08 sweep outcome (all proven + fixed + verified)
- **R1** `create_expense` — 42702 (RETURNING collision) + 42804 (`date` text↔date). Alias `ge.` + `ge.date::date`.
- **R2-1** `update_shared_item` — 42702 (SELECT/INTO/WHERE) + 42804 (`date`/`budget` types). Qualify `si.`/`gm.`, `p_date::text`, align RETURNS to `date text, budget numeric`.
- **R2-2** `create_group_from_trip` — 42702 (ON CONFLICT column-list). Switch to `on conflict on constraint group_members_pkey`.
- Remaining 7 RPCs verified SAFE (qualified aliases / unique OUT names); all 10 return 200.
- Frontend "missing RPC" alarm = false positive (descriptive method names map to real RPCs).



## 10. M4.3 Pattern — Identity server-derivation with zero caller params + empty-set-as-denial

**Live-verified 2026-08-20 (M4.3 Journey Permission).** Two class-level patterns for consent/permission
RPCs that generalize to any opt-in authorization model:

### 10a. No caller-supplied identity parameter (auth.uid() is the only source)
A consent-grant/revocation RPC must NEVER accept a `p_user_id` or `p_target_user_id` parameter. The
function derives `user_id := auth.uid()` internally. This enforces: **a user can only consent for
themselves; an owner/admin cannot grant/revoke consent on behalf of another member.**

- If a `p_user_id` parameter EXISTS in the signature, it is a latent privilege-escalation vector:
  an authenticated caller could target another user's consent row. Reject any review that has it.
- Structural check: `pg_get_function_arguments(p.oid) ~* 'user_id'` MUST be false for consent RPCs.
- RLS backstop: the row policy (`user_id = auth.uid()` for UPDATE/INSERT-with-check) is defense-in-depth,
  NOT the primary enforcement. The function signature (no identity param) IS the primary control.
- The owner is NOT exempt from this rule: even the trip owner must call `grant_location_permission`
  to share THEIR OWN position. Owner ≠ automatic consent.

Example (correct):
```sql
create or replace function public.grant_location_permission(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); begin
  insert into public.location_permissions (group_id, user_id, permission, granted_at ...)
  values (p_group_id, v_uid, 'granted', now() ...)  -- v_uid, NOT a param
  on conflict (group_id, user_id) do update set ...;
  return jsonb_build_object('user_id', v_uid, ...);
end; $$;
```

### 10b. Empty set as a denial signal (do not throw on denied admission)
A read RPC gated by multiple admission checks (membership, active session, consent) should return
`'[]'::jsonb` (empty set) when ANY check fails — NOT throw an exception to the caller. Reason:

- The caller cannot distinguish "denied by policy" from "denied by missing data" via exceptions.
- Returning empty lets the frontend render the same "no locations" UI whether the user is denied,
  the journey hasn't started, or (in M4.3) no locations exist yet.
- Exceptions leak information (the user knows they ARE a member but lack consent; or the session state).
  A uniform empty-set response is information-theoretically safe.

Admission predicate (4 gates, all required):
1. `auth.uid() is not null` (caller authenticated — if NULL, the RPC raises 401, NOT returns [])
2. `is_group_member(p_group_id)` (membership)
3. `exists (active journey_sessions row where expires_at > now())` (Journey Mode ON)
4. `location_permissions.permission = 'granted' for this caller` (own consent)

If ANY of 2–4 is false → return `'[]'::jsonb`. Only gate 1 raises on failure (anon → 401).
This keeps `get_crew_locations` an **immutable privacy gate**: M4.4 adds the `member_locations` join
behind the same 4 checks with zero changes to authorization semantics.

Verification: assert structurally that `pg_get_functiondef(...)` contains all 4 predicate variables,
and runtime-test via `M4_3_DB_VERIFY.js` with separate owner/member/non-member JWTs (the JS harness
calls `/rest/v1/rpc/get_crew_locations` directly — no browser needed, no CDP context-destroy issue).


## Cost/risk note
Each `pg_proc` SELECT + each apply is one Management API call (~free). Token usage on the OpenAI Auditor
for the change is printed per run. Keep audit packages compact (diff only).
