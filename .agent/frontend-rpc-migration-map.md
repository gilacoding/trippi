# Frontend RPC Migration Map

## Architecture

```
                    ┌── reads ──→ PostgREST direct queries
                        (getGroup, getItems, getMembers, getExpenses)
UI                    │  (direct .from().select() or .update()/.delete()
(trip-planner.html)   │   for single-row ops that don't need membership gate)
  ↓                   │
trippi-api.js         │
  ↓                   │  mutations → rpc() calls
  (collaboration     ──→┤  (business mutations routed through transactional RPCs)
   API boundary)         │
                         ↓
                    Supabase JS Client (CDN)
                         ↓
                    PostgREST (RPC endpoint)
                         ↓
                    Postgres (transactional)
                         ↓
                    existing realtime triggers
                    (supabase_realtime publication)
                         ↓
                    group:<uuid> realtime channels
```

## Migration Map

| Current Frontend Method | New RPC | Operation | Multi-table? | Idempotency |
|---|---|---|---|---|
| `API.createGroup()` | `create_group` | CREATE | Yes (groups + group_members) | No |
| `API.joinGroup()` | `join_group` | INSERT membership | No | **Yes** |
| `API.makeGroupFromTrip()` | `create_group_from_trip` | CREATE + batch INSERTs | Yes (4 tables) | No |
| `API.addItem()` | `create_shared_item` | INSERT | No | No |
| `API.updateItem()` | `update_shared_item` | UPDATE | No | **Yes** |
| `API.deleteItem()` | `delete_shared_item` | DELETE | No | **Yes** |
| `API.addExpense()` | `create_expense` | INSERT | No | No |
| `API.deleteExpense()` | `delete_expense` | DELETE | No | **Yes** |
| `API.leaveGroup()` | `leave_group` | DELETE membership | No | **Yes** |

## Methods that STAY as direct Supabase queries (no RPC)

| Method | Reason |
|---|---|
| `API.getGroup(id)` | Read-only, no invariants |
| `API.getMembers(groupId)` | Read-only |
| `API.getItems(groupId)` | Read-only |
| `API.getExpenses(groupId)` | Read-only |
| `API.ensureAuth()` | Auth session management, not DB mutation |
| `API._getSb()` | Supabase client access for realtime channels |

## Changes Required in `api.js`

### createGroup()
```js
// BEFORE:
async createGroup({name, destination, start_date, end_date, created_by}) {
    const sb = this._getSb();
    const uid = await this.ensureAuth();
    const { data: g, error } = await sb.from('groups').insert({...});
    const { error: em } = await sb.from('group_members').insert({group_id: g.id, user_id: uid, display_name});
    if (em) { /* cleanup group */ }
    return { id: g.id, ... };
}

// AFTER:
async createGroup({name, destination, start_date, end_date, display_name}) {
    const sb = this._getSb();
    await this.ensureAuth();  // ensures session exists
    const { data, error } = await sb.rpc('create_group', {
        p_name: name, p_destination: destination,
        p_start_date: start_date, p_end_date: end_date,
        p_display_name: display_name
    });
    if (error) return { error };
    return { id: data?.group_id, ...data };
}
```
Key changes:
- `created_by` removed from params (RPC uses `auth.uid()`)
- `display_name` now passed (was hardcoded as "Creator" in HTML)
- Second `insert` for `group_members` removed (atomic in RPC)
- Return shape shifts from `id`/`name`/`created_by` to `group_id`/`group_name`/etc.

### joinGroup()
```js
// BEFORE:
async joinGroup({group_id, user_id, display_name}) {
    const sb = this._getSb();
    const existing = await sb.from('group_members').select().eq('group_id', group_id).eq('user_id', user_id);
    if (existing.length) return { member: existing[0] };
    const { data, error } = await sb.from('group_members').insert({group_id, user_id, display_name});
    return { member: data?.[0] };
}

// AFTER:
async joinGroup({group_id, display_name}) {
    const sb = this._getSb();
    await this.ensureAuth();
    const { data, error } = await sb.rpc('join_group', {
        p_group_id: group_id, p_display_name: display_name
    });
    if (error) return { error };
    return { member: data, already_joined: data?.already_joined };
}
```
Key changes:
- `user_id` removed from params (RPC uses `auth.uid()`)
- TOCTOU pre-check removed (RPC handles via ON CONFLICT)

### makeGroupFromTrip()
```js
// BEFORE: 3 separate batch inserts (groups, shared_items, group_expenses)
// AFTER: single rpc('create_group_from_trip', { p_items: [...], p_expenses: [...] })
```
The `items` and `expenses` arrays are passed as JSONB to the RPC, which batch-inserts within the transaction.

### addItem()
```js
// BEFORE: sb.from('shared_items').insert({group_id, created_by, title, ...})
// AFTER:  sb.rpc('create_shared_item', {p_group_id, p_title, p_note, ...})
```
Key change: `created_by` removed (RPC uses `auth.uid()`)

### Other methods
`updateItem`, `deleteItem`, `addExpense`, `deleteExpense`, `leaveGroup` follow the same pattern — remove `created_by` from params, route through `rpc()`.

## Error Handling

All RPCs raise exceptions with `ERRCODE = 'P0001'` for business logic errors. The supabase-js client converts these to error objects with `message` containing the exception text. The frontend should map:

| RPC Exception | Frontend Error |
|---|---|
| `unauthorized: auth.uid() is null` | → redirect to auth or show "Please sign in" |
| `group not found: <id>` | → show "Group not found" |
| `not a group member` | → show "You don't have access to this group" |
| `name is required` | → show "Group name is required" |
| `title is required` | → show "Item title is required" |
| `name is required` (expense) | → show "Expense name is required" |
| `start_date cannot be after end_date` | → show "Start date cannot be after end date" |

## Return Shape Changes (breaking)

The RPCs return slightly different field names than the old `sb.from().insert()` response. The `trippi-api.js` methods must normalize:

| Old return field | New RPC return field |
|---|---|
| `data.id` | `data.group_id` / `data.id` |
| `data.name` | `data.group_name` |
| `data.created_by` | same |
| `data.created_at` | same |

## Live Deployment Status (verified 2026-08-23)

The following has been verified against the **live production** site (marki.cab)
and Supabase project `ishflkcsdzlhhxtanhxf`:

| Layer | Status | Detail |
|---|---|---|
| **`trip-planner.html`** (GitHub `master`) | **M2 P0** deployed | Guest flow forces login via `openAuth('login')` (line 309). No `signInAnonymously` in the deployed `<body>`. |
| **`trippi-api.js`** (GitHub `master`) | **P0.2** code present | Has `signInAnonymously()` function (line 108). But P0.2 frontend flow NOT wired in deployed HTML. |
| **Supabase DB functions** (live) | **P0.2** deployed | `get_guest_trip` returns `participant_limit` + `current_count`. `redeem_invitation` accepts authenticated users. |
| **`invitations` table** (live) | **P0.2** schema | Has `participant_limit` column (verified via RPC behavior). |
| **Anonymous Auth** | **DISABLED** (intentional) | `signInAnonymously()` → `422 anonymous_provider_disabled`. Guests use anon API key + token-scoped RPCs. |
| **GitHub Pages** (marki.cab) | Does NOT match local repo | Local repo has P0.2 frontend code (commit `53d428f`) but `master` branch still deploys M2 flow. |

**Conclusion**: P0.2 **DB migration is already deployed**. The gap is **frontend
deployment only** — the P0.2 `trip-planner.html` (with `signInAnonymously` flow)
needs to be pushed to GitHub Pages.

**Known frontend bug** in registered-user soft-convert path (line 1285-1286):
`pendingGuestToken` auto-redeem calls `openGroup(colState.group.id)` but
`colState.group` is null when the app is in guest view mode. DB-level join
succeeds (member_count increases) but UI doesn't transition to groupView.
