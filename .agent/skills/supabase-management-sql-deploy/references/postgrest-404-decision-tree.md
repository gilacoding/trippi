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

## Quick reference
| Symptom | Cause | Fix |
|---|---|---|
| PGRST202, signature matches `pg_proc` | Stale cache | `NOTIFY pgrst` via direct SQL |
| PGRST202 after reload | Missing GRANT (proacl IS NULL) | `GRANT EXECUTE ... TO authenticated` |
| PGRST202, signature differs | Param mismatch | Fix client params to match `pg_get_function_arguments` |
| PGRST202 flip-flops same params | Test harness inconsistency | Match frontend `rpc()` signature exactly |
