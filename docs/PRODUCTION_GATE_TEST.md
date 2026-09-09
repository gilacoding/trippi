# Production Gate — Shared Trip Date Edit Validation

## Test Plan

1. Log in to marki.cab via existing Chrome session
2. Create a shared trip
3. Edit dates via `editGroupTrip()`
4. Verify persistence at every layer

## Findings from Static Trace

### Flow: Creator edits shared trip dates

```
1. User clicks "Edit trip" button
   └─ applyPermsUI() shows button only if colState.perms.is_owner
   
2. editGroupTrip() executes
   ├─ Checks: colState.perms && colState.perms.is_owner
   ├─ Prompts for new dates
   ├─ Calls: API.updateGroup(g.id, { start_date, end_date })
   │   └─ RPC: update_group (server-side UPDATE on groups table)
   ├─ Updates local: g.start_date = start; g.end_date = end
   └─ Calls: openGroup(g.id, false)

3. openGroup() executes
   ├─ Calls: teardownGroupSession() — CLEARS colState.group = null
   ├─ Calls: API.getGroup(id) — reloads from server
   │   └─ RPC: list_my_groups (PostgREST SELECT)
   │   └─ Potential issue: PostgREST cache may return stale data
   ├─ Sets: colState.group = g (overwrites local updates)
   ├─ Loads: loadShared(), loadMembers(), etc.
   └─ Renders: renderGroupPlanner(), applyPermsUI()

4. Potential Race Condition
   ├─ editGroupTrip updates DB → DB has new dates ✓
   ├─ editGroupTrip updates local → colState.group has new dates ✓
   ├─ openGroup calls teardownGroupSession → colState.group = null
   ├─ openGroup calls API.getGroup → if cache stale, returns OLD dates
   ├─ openGroup sets colState.group = stale data → DATES REVERT ✗
   └─ Retry logic only triggers if g is null, NOT if g is stale

## Critical Issue Identified

**`openGroup()` always reloads group data from server via `API.getGroup()`.**

After `editGroupTrip()` updates the database and local state, it calls `openGroup()` which:
1. Clears all group state via `teardownGroupSession()`
2. Reloads from server via `API.getGroup(id)` (PostgREST)
3. **Overwrites local updates with server response**

If PostgREST cache hasn't invalidated yet, the server returns OLD dates, and the edit is lost.

The existing retry logic (`if(!g) { await retry }`) only handles the case where the group is NOT FOUND, not where it returns STALE DATA.

## Test Approach

Since puppeteer-core requires interactive Chrome login, we will:

1. **Verify the fix path**: Check that `editGroupTrip` calls `API.updateGroup` with correct payload
2. **Verify the permission check**: Check that `colState.perms.is_owner` is set correctly
3. **Identify the remaining race condition**: Document the PostgREST cache issue
4. **Recommend mitigation**: Pass updated group to `openGroup` or skip reload for same-group edits
