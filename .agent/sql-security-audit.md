# Hermes SQL Security Audit — 003_rpc_collaboration.sql

**Date:** 2026-08-17
**Auditor:** Hermes Agent (Code Executor)
**File:** `trippi-deploy/supabase/003_rpc_collaboration.sql`
**Purpose:** Repository-only file inspection (NO database execution)
**GPT production inspection:** `current_user = postgres`, `session_user = postgres`, `postgres` has `CREATE` on `public`, target RPC functions do not exist yet

---

## SQL SECURITY AUDIT

| Function | SECURITY DEFINER | `SET search_path = ''` | `auth.uid()` | Caller-controlled user_id param |
|---|---|---|---|---|
| `create_group` | ✅ Yes | ✅ Yes | ✅ Yes (4 calls) | ✅ No `p_user_id` |
| `join_group` | ✅ Yes | ✅ Yes | ✅ Yes (3 calls) | ✅ No `p_user_id` |
| `create_group_from_trip` | ✅ Yes | ✅ Yes | ✅ Yes (5 calls) | ✅ No `p_user_id` |
| `create_shared_item` | ✅ Yes | ✅ Yes | ✅ Yes (4 calls) | ✅ No `p_user_id` |
| `update_shared_item` | ✅ Yes | ✅ Yes | ✅ Yes (4 calls) | ✅ No `p_user_id` |
| `delete_shared_item` | ✅ Yes | ✅ Yes | ✅ Yes (3 calls) | ✅ No `p_user_id` |
| `create_expense` | ✅ Yes | ✅ Yes | ✅ Yes (4 calls) | ✅ No `p_user_id` |
| `delete_expense` | ✅ Yes | ✅ Yes | ✅ Yes (3 calls) | ✅ No `p_user_id` |
| `leave_group` | ✅ Yes | ✅ Yes | ✅ Yes (2 calls) | ✅ No `p_user_id` |

**Totals:**
- `SECURITY DEFINER`: 9/9 ✅
- `SET search_path = ''`: 9/9 ✅ (verified all are empty string)
- `auth.uid()` calls: 40 ✅
- `p_user_id` parameters: 0 ✅
- `p_created_by` parameters: 0 ✅

---

## OWNERSHIP FINDING

The migration contains **NO** ownership-changing statements:

| Pattern | Count | Status |
|---|---|---|
| `ALTER FUNCTION ... OWNER TO` | 0 | ✅ |
| `SET ROLE` | 0 | ✅ |
| SQL `AUTHORIZATION` clause (CREATE ... AUTHORIZATION name) | 0 | ✅ |
| `CREATE ... AUTHORIZATION` pattern | 0 | ✅ |

The 6 regex matches for the word "authorization" are all in **English comments** (e.g., `-- target-row authorization`, `-- Authorization is based on`). No SQL `AUTHORIZATION` clauses exist.

**Finding:** Function ownership is inherited from the role executing `CREATE FUNCTION`. The SQL itself does not change function ownership. GPT production inspection reports `current_user = postgres`, so if `CREATE FUNCTION` is executed in a session where `current_user = postgres`, the functions will be owned by `postgres`.

---

## ADDITIONAL SECURITY CHECKS

### Permissions
- `REVOKE EXECUTE FROM PUBLIC`: 9 functions ✅
- `GRANT EXECUTE TO authenticated`: 9 functions ✅

### JSONB validation in `create_group_from_trip`
- `jsonb_typeof(p_items) != 'array'` check: ✅ Present
- `jsonb_typeof(p_expenses) != 'array'` check: ✅ Present
- `jsonb_typeof(item) != 'object'` check: ✅ Present (per-item)
- `jsonb_typeof(exp) != 'object'` check: ✅ Present (per-expense)
- `item->>'title'` non-empty validation: ✅ Present
- `exp->>'name'` non-empty validation: ✅ Present
- `(item->>'date')::date` try/catch validation: ✅ Present (invalid_text_representation handler)
- `(item->>'budget')::integer` try/catch validation: ✅ Present
- `(exp->>'date')::date` try/catch validation: ✅ Present
- `(exp->>'amount')::numeric` try/catch validation: ✅ Present

### Target-row authorization (update/delete)
- `update_shared_item`: ✅ Selects `group_id` from the `shared_items` row by `id`, then checks membership — caller cannot choose a different group
- `delete_shared_item`: ✅ Same pattern — looks up group from target row
- `delete_expense`: ✅ Same pattern — looks up group from target row

### Caller identity
- `leave_group`: ✅ Only `p_group_id` parameter; `user_id` derived from `auth.uid()`
- All functions use `auth.uid()` for `created_by` and `user_id` fields — no caller-supplied identity

### `search_path` safety
- All 9 functions: `SET search_path = ''` ✅ (empty string prevents schema spoofing)

---

## DEPLOYMENT IMPLICATION

SQL is compatible with deployment under the verified `postgres` execution session. Ownership should be `postgres` because `CREATE FUNCTION` is executed as `postgres`.

The migration contains:
- 9 `CREATE OR REPLACE FUNCTION` statements
- 9 `REVOKE EXECUTE ... FROM PUBLIC`
- 9 `GRANT EXECUTE ... TO authenticated`
- No `ALTER TABLE`, `CREATE TABLE`, `DROP`, `SET ROLE`, or `ALTER FUNCTION ... OWNER TO`

This is a `CREATE FUNCTION` + permission-only migration. **INSPECTION COMPLETE — GPT MUST MAKE THE DB GO/NO-GO DECISION.**