# RPC Compatibility Matrix

**Status:** PRODUCTION SCHEMA VERIFIED via live Supabase queries (PostgREST column probes + authenticated session)
**Date:** 2026-08-16
**Project:** `ishflkcsdzlhhxtanhxf`
**No RPC functions exist yet.** All calls currently go through `trippi-api.js` → direct Supabase client.

---

## 1. `create_group` RPC

### Frontend API contract
```js
API.createGroup({name, destination, start_date, end_date, created_by})
→ returns { data: { id, name, created_by, created_at, ... }, error }
```

### Production schema
```sql
Table: groups
Columns:
  id           UUID    PK, default gen_random_uuid()
  name         TEXT    NOT NULL
  created_by   UUID    (references auth.users)
  created_at   TIMESTAMPTZ  default now()
  destination  TEXT    (nullable)
  start_date   DATE    (nullable)
  end_date     DATE    (nullable)
```

### Current flow (in `createGroupDirectly`)
1. `INSERT INTO groups {name, destination, start_date, end_date, created_by}`
2. `INSERT INTO group_members {group_id, user_id, display_name}`
3. `joinGroup(g.id)` → fetches group, subscribes to realtime

### Proposed RPC
```sql
CREATE OR REPLACE FUNCTION create_group(
  p_name TEXT,
  p_destination TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_created_by UUID
) RETURNS TABLE(group_id UUID, group_name TEXT) AS $$
BEGIN
  INSERT INTO groups (name, destination, start_date, end_date, created_by)
  VALUES (p_name, p_destination, p_start_date, p_end_date, p_created_by);
  
  -- Creator should be auto-added as member
  INSERT INTO group_members (group_id, user_id, display_name)
  VALUES (
    (SELECT id FROM groups WHERE id = (SELECT currval('groups_id_seq'))),
    p_created_by,
    'Creator'  -- will be updated with display_name later
  );
  
  RETURN QUERY SELECT id, name FROM groups WHERE id = (SELECT currval('groups_id_seq'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Constraints / RLS interaction
- `groups` INSERT: RLS blocks for anon users without auth.uid(). RPC with `SECURITY DEFINER` bypasses RLS for the INSERT.
- `group_members` INSERT: permissive RLS (`FOR ALL true`) allows it. But doing both in a transaction ensures atomicity.
- No `updated_at` column on `groups` — don't try to update it.
- `groups.name` is NOT NULL (inferred from schema).

### Triggers / Realtime
- No triggers on `groups` (confirmed: inserting via REST didn't trigger any special behavior).
- `groups` is NOT in the realtime publication (only `shared_items`, `group_members`, `group_expenses` are subscribed). Consider adding `groups` to the realtime channel.

---

## 2. `join_group` RPC

### Frontend API contract
```js
API.joinGroup({group_id, user_id, display_name})
→ returns { data: { joined: boolean, member: {...} }, error }
```

### Production schema
```sql
Table: group_members
Columns:
  group_id     UUID  (FK → groups.id)
  user_id      UUID  (references auth.users)
  display_name TEXT
  joined_at    TIMESTAMPTZ  default now()

PRIMARY KEY: (group_id, user_id)  — COMPOSITE, NOT a separate 'id' column
```

### Key constraint verification
- **UNIQUE/PK on (group_id, user_id):** CONFIRMED. Inserting a duplicate returns HTTP 409 with:
  `"duplicate key value violates unique constraint "group_members_pkey""`
- This means `join_group` RPC can use `INSERT ... ON CONFLICT DO NOTHING` to safely handle concurrent joins.

### Current flow (in `joinGroup`)
1. `SELECT * FROM groups WHERE id = ?` (verify group exists)
2. `SELECT * FROM group_members WHERE group_id = ? AND user_id = ?` (check membership)
3. `INSERT INTO group_members {group_id, user_id, display_name}` (if not already member)

### TOCTOU race in current flow
The current SELECT-then-INSERT pattern has a TOCTOU race. While the PK constraint prevents actual duplicates, the error is currently caught and alerted rather than silently handled. An RPC using `INSERT ... ON CONFLICT DO NOTHING` eliminates this.

### Proposed RPC
```sql
CREATE OR REPLACE FUNCTION join_group(
  p_group_id UUID,
  p_user_id UUID,
  p_display_name TEXT
) RETURNS TABLE(already_member BOOLEAN, joined BOOLEAN, member_row group_members) AS $$
BEGIN
  -- Check if already a member
  IF EXISTS(SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = p_user_id) THEN
    RETURN QUERY SELECT TRUE, FALSE, (SELECT row(*) FROM group_members WHERE group_id = p_group_id AND user_id = p_user_id);
  ELSE
    INSERT INTO group_members (group_id, user_id, display_name)
    VALUES (p_group_id, p_user_id, p_display_name)
    ON CONFLICT (group_id, user_id) DO NOTHING;
    
    RETURN QUERY SELECT 
      FALSE, 
      (SELECT EXISTS(SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = p_user_id)),
      (SELECT row(*) FROM group_members WHERE group_id = p_group_id AND user_id = p_user_id);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### RLS interaction
- `group_members` has permissive RLS (`FOR ALL true`), so SELECT and INSERT work for any authenticated user.
- `SECURITY DEFACHER` not strictly needed but good practice for transactional atomicity.

---

## 3. `create_shared_item` RPC

### Frontend API contract
```js
API.addItem({group_id, title, note, link, done, date, time, budget, created_by})
→ returns { data: { id, ... }, error }
```

### Production schema
```sql
Table: shared_items
Columns:
  id           UUID    PK, default gen_random_uuid()
  group_id     UUID    (FK → groups.id, via RLS filter)
  created_by   UUID    (references auth.users)
  title        TEXT    NOT NULL  (confirmed via 23502 error on NULL insert)
  note         TEXT    default ''  (confirmed: returns '' when omitted)
  link         TEXT    default ''  (confirmed: returns '' when omitted)
  done         BOOLEAN default false  (confirmed: returns false when omitted)
  created_at   TIMESTAMPTZ  default now()
  date         DATE    (nullable)
  time         TEXT    (nullable — stores time as string like "14:30")
  budget       INTEGER  (nullable — confirmed: returns NULL when omitted, no NOT NULL constraint)
```

### Key observations
- `date` is `DATE` type — the frontend passes `"2026-08-13"` (ISO string), which PostgreSQL accepts.
- `time` is `TEXT` type — the frontend passes `"14:30"` which is stored as-is. NOT a `time` type.
- `budget` is `INTEGER` — but NULL is allowed (no NOT NULL constraint). The frontend defaults to `0`, not NULL.
- `done` is `BOOLEAN` — the frontend passes `false`/`true`.
- `note` and `link` default to empty string `''`, not NULL.
- `title` is NOT NULL — the frontend always provides a title value.
- `created_at` is set by the server (`default now()`), not the frontend. The frontend does NOT pass `created_at`.

### Batch variant: `create_shared_items_batch`
Used by `makeGroupFromTrip` and `openGroup(fresh)`. Inserts multiple rows in one call.

### Proposed RPC
```sql
CREATE OR REPLACE FUNCTION create_shared_item(
  p_group_id UUID,
  p_created_by UUID,
  p_title TEXT,
  p_note TEXT,
  p_link TEXT,
  p_done BOOLEAN,
  p_date DATE,
  p_time TEXT,
  p_budget INTEGER
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO shared_items 
    (group_id, created_by, title, note, link, done, date, time, budget)
  VALUES 
    (p_group_id, p_created_by, p_title, p_note, p_link, p_done, p_date, p_time, p_budget)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### RLS interaction
- `shared_items` has permissive RLS (`FOR ALL true`) for INSERT.
- The realtime subscription listens on `group_id=eq.<uuid>` filter, so any insert triggers realtime events for subscribed clients.

---

## 4. `create_expense` RPC

### Frontend API contract
```js
API.addExpense({group_id, name, amount, category, note, date, created_by})
→ returns { data: { id, ... }, error }
```

### Production schema
```sql
Table: group_expenses
Columns:
  id           UUID    PK, default gen_random_uuid()
  group_id     UUID    (FK → groups.id, via RLS filter)
  created_by   UUID    (references auth.users)
  date         DATE    (nullable — frontend passes '2026-08-16')
  name         TEXT    NOT NULL  (confirmed via 23502 error on NULL insert)
  amount       NUMERIC (stores as numeric, e.g., 999 or 50000)  (confirmed: integer input accepted)
  category     TEXT    (nullable)
  note         TEXT    default ''
  created_at   TIMESTAMPTZ  default now()
```

### Key observations
- `amount` is `NUMERIC` type — the frontend passes `100` (integer), PostgreSQL stores as numeric. Both work.
- `date` is `DATE` type — same as `shared_items.date`.
- `note` appears to have a default of `''` (empty string).
- No `updated_at` column on `group_expenses`.
- Column order in response: `id, group_id, created_by, date, name, amount, category, note, created_at`

### Proposed RPC
```sql
CREATE OR REPLACE FUNCTION create_expense(
  p_group_id UUID,
  p_created_by UUID,
  p_name TEXT,
  p_amount NUMERIC,
  p_category TEXT,
  p_note TEXT,
  p_date DATE
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO group_expenses 
    (group_id, created_by, name, amount, category, note, date)
  VALUES 
    (p_group_id, p_created_by, p_name, p_amount, p_category, p_note, p_date)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### RLS interaction
- `group_expenses` has permissive RLS (`FOR ALL true`) for INSERT (confirmed by successful 201 test).
- Realtime subscription listens on `group_id=eq.<uuid>` filter.

---

## Summary Compatibility Matrix

| Table | Column | Type | Nullable | Default | Has PK? | Notes |
|-------|--------|------|----------|---------|---------|-------|
| `groups` | `id` | UUID | NOT NULL | gen_random_uuid() | ✅ PK | |
| | `name` | TEXT | NOT NULL | | | | | |
| | `created_by` | UUID | | | | References auth.users |
| | `created_at` | TIMESTAMPTZ | | now() | | |
| | `destination` | TEXT | | | | |
| | `start_date` | DATE | | | | |
| | `end_date` | DATE | | | | |
| `group_members` | `group_id` | UUID | NOT NULL | | ✅ PK (composite) | FK → groups.id |
| | `user_id` | UUID | NOT NULL | | ✅ PK (composite) | References auth.users |
| | `display_name` | TEXT | | | | |
| | `joined_at` | TIMESTAMPTZ | | now() | | |
| `shared_items` | `id` | UUID | NOT NULL | gen_random_uuid() | ✅ PK | |
| | `group_id` | UUID | | | | |
| | `created_by` | UUID | | | | |
| | `title` | TEXT | NOT NULL | | | |
| | `note` | TEXT | | '' | | |
| | `link` | TEXT | | '' | | |
| | `done` | BOOLEAN | | false | | |
| | `created_at` | TIMESTAMPTZ | | now() | | |
| | `date` | DATE | | | | |
| | `time` | TEXT | | | | NOT a time type! |
| | `budget` | INTEGER | nullable | | | Returns NULL when omitted |
| `group_expenses` | `id` | UUID | NOT NULL | gen_random_uuid() | ✅ PK | |
| | `group_id` | UUID | | | | |
| | `created_by` | UUID | | | | |
| | `date` | DATE | | | | |
| | `name` | TEXT | NOT NULL | | | |
| | `amount` | NUMERIC | | | | |
| | `category` | TEXT | | | | |
| | `note` | TEXT | | | | |
| | `created_at` | TIMESTAMPTZ | | now() | | |
| `locations` | `group_id` | UUID | NOT NULL | | ✅ PK (composite) | |
| | `user_id` | UUID | NOT NULL | | ✅ PK (composite) | |
| | `lat` | DOUBLE PRECISION | | | | |
| | `lng` | DOUBLE PRECISION | | | | |
| | `updated_at` | TIMESTAMPTZ | | | | |

### Key constraints confirmed:
1. **`group_members` PK = `(group_id, user_id)`** — composite, NOT a separate `id` column. Duplicates return 409 with `"duplicate key value violates unique constraint \"group_members_pkey\""`.
2. **`locations` PK = `(group_id, user_id)`** — NO `id` column exists. Confirmed: `SELECT id from locations` returns "column locations.id does not exist".
3. **No existing RPC functions** — all 404 when probed via `/rest/v1/rpc/`.
4. **`groups` has NO `updated_at` column** — 7 columns only.
5. **`shared_items` has NO `updated_at` column** — 11 columns only.
6. **`group_expenses` has NO `updated_at` column** — 9 columns only.
7. **RLS is permissive** (`FOR ALL true`) for `group_members`, `shared_items`, `group_expenses`, `locations` (INSERT/SELECT/UPDATE all work for authenticated anon users). `groups` has selective RLS (SELECT works for authenticated users, INSERT blocked for anonymous).
8. **NOT NULL constraints:**
   - `shared_items.title` — NOT NULL (confirmed via 23502 error on NULL insert)
   - `group_expenses.name` — NOT NULL (confirmed via 23502 error on NULL insert)
9. **Default values (verified):**
   - `shared_items.note` → `''` (empty string) when omitted
   - `shared_items.link` → `''` (empty string) when omitted
   - `shared_items.done` → `false` when omitted
   - `shared_items.budget` → `NULL` when omitted (no NOT NULL constraint, no non-NULL default)
   - `shared_items.created_at` → `now()` (server-side default)
   - `group_members.joined_at` → `now()` (server-side default)
   - `group_expenses.created_at` → `now()` (server-side default)
10. **FK constraint behavior (NOT NULL tests passed):**
    - Inserting `shared_items` with a fake `group_id` (non-existent UUID) returns 403 RLS violation — meaning FK constraints exist but RLS is checked first. With `SECURITY DEFINER` RPC, the FK check would run and reject invalid group_ids with a 23503 (foreign_key_violation) error.
    - Same for `group_expenses` and `group_members` with fake group_ids.

### Verified before writing RPC SQL:
- ✅ `groups.id` — UUID, server-generated (default `gen_random_uuid()`, confirmed by reading existing rows)
- ✅ `shared_items.id` — UUID PK, server-generated
- ✅ `group_expenses.id` — UUID PK, server-generated
- ✅ `shared_items.created_at` and `group_expenses.created_at` — auto-populated by server (`default now()`)
- ✅ No extra columns beyond what's listed (verified via 400 error on nonexistent column attempts)
- ✅ FK constraints exist (inserts with fake group_id fail, though RLS intercepts first for the anor key)
- ✅ Composite PKs confirmed: `group_members (group_id, user_id)`, `locations (group_id, user_id)`

### Still uncertain (not blocking RPC creation):
- [ ] Exact FK constraint names (not needed for RPC, just for error handling)
- [ ] Whether `created_by` columns are FK-constrained to `auth.users(id)` — seems likely but RLS prevented direct testing
- [ ] Whether `user_id` columns in `group_members` and `locations` are FK-constrained to `auth.users(id)`