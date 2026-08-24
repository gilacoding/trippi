# PGRST202 / 404 Decision Tree — Supabase PostgREST

## Symptom
RPC call returns `404 PGRST202`: `"Searched for the function public.<name> but no matches were found in the schema cache"`

## Decision tree

### 1. Check the REAL request payload
Capture what the client actually sends. For REST `/rest/v1/rpc/<name>`:
```
POST /rest/v1/rpc/get_route
{"p_group_id": "e573ca39-..."} 
```
If the param names / count don't match the function signature → **caller bug**.

### 2. Compare signature in `pg_proc` (NOT what you remember)
```sql
SELECT proname, pg_get_function_arguments(p.oid) as args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = '<function_name>';
```
If signatures **exactly match** what the client sends → NOT a regression (proceed to step 3).

### 3. Reload PostgREST schema cache
```sql
NOTIFY pgrst, 'reload schema';
-- or Dashboard: Settings → Database → "Reload project"
```
- Reload via **direct SQL connection** (SQL Editor, psql, Mgmt API SQL endpoint with direct pool)
- Does NOT work via Mgmt API `execute_sql` or REST `/rest/v1/rpc` (pooled connection listener doesn't see NOTIFY)
- If reload **fixes** it → stale cache was the cause
- If reload **does NOT fix** it → missing explicit grant (step 4)

### 4. Check `proacl` (explicit grants)
```sql
SELECT proname,
  CASE WHEN proacl IS NULL THEN 'DEFAULT (PUBLIC)' 
       ELSE array_to_string(proacl, ' | ') END AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';
```
- `DEFAULT (PUBLIC)` = no explicit grant → PostgREST REST doesn't register this function → PGRST202 even after cache reload
- **Fix:** `GRANT EXECUTE ON FUNCTION public.<name>(<exact arg types>) TO authenticated;`

### 5. Flip-flop 404s between identical calls
If the same RPC sometimes 400 and sometimes 404 with no deployment changes → the test harness is sending **inconsistent params** (e.g., one run sends 8 params, another sends 9). Confirm the test client matches the frontend `rpc()` call shape exactly.

### 6. 404 ONLY when the function body executes (not on early gates) — `isfinite()` trap
If early `raise exception` gates (P0001) work fine but you get **42883 / PGRST202 404 only when all security gates PASS**, the function body contains a runtime PL/pgSQL error surfacing as a dispatch-level "no function matches":

| Gate outcome | Symptom | Root cause |
|---|---|---|
| Gate fails (P0001) | 400 with clear message | ✅ gate working |
| All gates pass | 42883 / 404 "no function matches" | ❌ body has unresolvable call |

**Root-cause example:** `isfinite(double precision)` inside a SECURITY DEFINER (`search_path=''`)
function — PostgreSQL's `isfinite()` exists only for `date`, `timestamp`, `interval`, `numeric`,
**NOT `float8`/`double precision`**. The `CREATE OR REPLACE` succeeds (resolved at definition time);
the 42883 fires at **execution time** — only when gates 1-4 pass and code reaches the bad call.
Symptoms look like per-group routing flakiness, but it's deterministic: 404 ⟺ code path reaches the bad call.

**Diagnostic:** run the function body directly via the Management API SQL endpoint
with `auth.uid()` faked via `SET LOCAL` inside a transaction — the raw error is
`function isfinite(double precision) does not exist`.

**Fix:** use `x <> x` for NaN (NaN ≠ NaN in SQL) + range checks (catch ±Infinity).

**Verify the body directly:**
```sql
BEGIN;
SET LOCAL request.jwt.claim.sub = '<caller_uid>';
SELECT public.upsert_member_location('<group_uuid>', 42.0, 42.0, 0, 0, 0);
ROLLBACK;
-- If this errors 42883, the body has an unresolvable call (e.g. isfinite(float8))
```

## Quick reference
| Symptom | Cause | Fix |
|---|---|---|
| PGRST202, signature matches `pg_proc` | Stale cache | `NOTIFY pgrst` via direct SQL |
| PGRST202 after reload | Missing GRANT (proacl IS NULL) | `GRANT EXECUTE ... TO authenticated` |
| PGRST202, signature differs | Param mismatch | Fix client params to match `pg_get_function_arguments` |
| PGRST202 flip-flops same params | Test harness inconsistency | Match frontend `rpc()` signature exactly |
| 42883/404 only when gates pass | Runtime body error (e.g. `isfinite(float8)`) | `x<>x` for NaN + range check; see Pitfall 4c |
