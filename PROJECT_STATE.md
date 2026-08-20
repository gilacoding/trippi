# Trippi — Project State

## MANDATORY STARTUP INSTRUCTION (D015)

Before any implementation, every agent must:
1. Read `PROJECT_STATE.md` (this file)
2. Read `DECISIONS.md` (LOCKED decisions + D016 Proven Pattern First Policy)
3. Read `HANDOFF.md` (current gate + operational state)
4. Check whether an existing solution exists in the codebase
5. Prefer reuse over invention

## Agent Roles

### ChatGPT
**Role:** Advisor / Auditor

**Authority:**
- Architecture review and approval
- Security review of RPC designs
- Migration gate authorization
- Frontend/backend behavior consistency checks
- A/B realtime verification protocol design

**Restrictions:**
- Does not execute Supabase mutations
- Does not directly modify repository code
- Does not own project state (reads from repo files only)

### GPT (DB Operator)
**Role:** Supabase Database Operator (read/write for approved DB operations only)

**Authority:**
- Read-only production Supabase inspection (schema, RLS, policies, triggers)
- Deploy approved migrations/RPC functions
- Verify DB-level authorization and constraints
- Read-only pg_catalog / information_schema queries

**Restrictions:**
- No frontend/code changes
- No unapproved DDL/DML
- Must obey HANDOFF.md execution gates
- Must report DB owner verification before executing SECURITY DEFINER functions

### Hermes (Code Executor)
**Role:** Code executor outside Supabase

**Authority:**
- Repository inspection and code changes
- Frontend/backend code modifications
- Test execution (JS syntax, realtime A/B)
- Browser-based A/B behavior verification

**Restrictions:**
- No Supabase mutations
- No DB migrations, DDL, or schema changes
- No RLS/trigger/publication modifications
- Must wait for "DB RPC GO" in HANDOFF.md before frontend RPC migration

---

## Current Phase

**Phase 4 — RPC database deployment**

### Completed
- Phase 1 API boundary complete
- `trip-planner.html` has zero direct `.from()` calls
- `backend/trippi-api.js` is the Supabase API boundary (17 methods)
- Production schema compatibility matrix verified (see `.agent/rpc-compatibility-matrix.md`)
- RPC draft v3 reviewed and approved by ChatGPT
- `003_rpc_collaboration.sql` created (9 functions, SECURITY DEFINER, REVOKE/GRANT)

### Current Gate

**BLOCKED** — awaiting GPT's verification of:
1. SECURITY DEFINER function owner semantics
2. Trusted non-client role ownership confirmed
3. No ownership assumptions (must NOT assume `authenticated` is owner)

### Database State

| Item | Status |
|---|---|
| 9 RPC functions created | **NOT DEPLOYED** — SQL draft only |
| `create_group` | Pending DB go |
| `join_group` | Pending DB go |
| `create_group_from_trip` | Pending DB go |
| `create_shared_item` | Pending DB go |
| `update_shared_item` | Pending DB go |
| `delete_shared_item` | Pending DB go |
| `create_expense` | Pending DB go |
| `delete_expense` | Pending DB go |
| `leave_group` | Pending DB go |

### Not yet authorized
- Frontend RPC migration (switch `trippi-api.js` from `.from()` to `rpc()`)

### Phases on hold (until Phase 4 complete)
- Phase 2: A/B behavior verification of RPC-based flow
- Phase 5: RLS consolidation
- Phase 6: Production cleanup

---

## Contracts (LOCKED)

### Realtime topic
```
group:<uuid>
```

### Tables (no renames)
- `groups`
- `group_members`
- `shared_items`
- `group_expenses`

### Architecture
```
UI → trippi-api.js → Supabase JS Client → Postgres
                        ↓ (mutations → rpc())
                        ↓ (reads → direct .from().select())
                    Postgres RPC functions (SECURITY DEFINER)
                        ↓
                    existing realtime publication/triggers
                        ↓
                    group:<uuid>
```

---

## Critical Production Facts (LOCKED — do not re-derive)

### `group_members` PK
```sql
PRIMARY KEY (group_id, user_id)
```
Composite, NOT a separate `id` column. Duplicates return 409.

### Production column types (verified, authoritative)
| Table.Column | Production Type | Note |
|---|---|---|
| `shared_items.date` | `DATE` | NOT TEXT (despite trippi-migration.sql saying TEXT) |
| `shared_items.budget` | `INTEGER` nullable | NOT `numeric NOT NULL` |
| `group_expenses.date` | `DATE` | NOT TEXT |
| `group_expenses.amount` | `NUMERIC` nullable | NOT `NOT NULL` |

**Do not trust `trippi-migration.sql` for these types.** The production compatibility matrix (`.agent/rpc-compatibility-matrix.md`) is authoritative.

### `shared_items.title`
NOT NULL (verified via 23502 error on NULL insert)

### `group_expenses.name`
NOT NULL (verified via 23502 error on NULL insert)

---

## Current Next Action

### GPT (DB Operator)
Verify SECURITY DEFINER owner semantics and trusted owner. Do NOT execute DDL yet. Report result to HANDOFF.md.

### Hermes (Code Executor)
**WAIT.** Do not modify frontend RPC calls until HANDOFF.md shows `DB RPC GO`.

### ChatGPT (Advisor)
Audit GPT's DB verification result. Issue one of:
- `DB RPC GO` (proceed to CREATE FUNCTION + grants)
- `DB NO-GO` (investigate further)
- `DB INVESTIGATE` (need more information)

---

## Startup Instruction For All Agents

Before doing any work:
1. Read `PROJECT_STATE.md`
2. Read `DECISIONS.md`
3. Read `HANDOFF.md`
4. Do not infer project state from conversation history when repository state is available
5. Follow the current gate in HANDOFF.md
6. Update `HANDOFF.md` after completing your assigned work
7. Never cross another agent's authority boundary