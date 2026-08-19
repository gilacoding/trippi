# TRIPPI Current State

## Last Updated
2026-08-15

## Active Branch
master

## Live Deployment
https://gilacoding.github.io/trippi/trip-planner.html

## Recent Changes
├── Phase 1 complete: Extracted API boundary layer (`backend/trippi-api.js`)
├── All direct Supabase calls in trip-planner.html replaced with `API.*` methods
├── Auth consolidated into `API.ensureAuth()` singleton (no more `SB.init()` in HTML)
├── Fixed `shareGroup` shadowing bug: removed duplicate sync definition, unified async version
├── Removed dead code: `myGroups()`, `renderGroups()`, `colState.sb`, `colState.groups`
├── `createGroupDirectly` now uses `API.createGroup()`, `API.joinGroup()`, `API.addItem()`
├── `makeGroupFromTrip` now uses `API.createGroup()`, `API.addItemsBatch()`, `API.addExpensesBatch()`, `API.joinGroup()`
├── `joinGroup` now uses `API.getGroup()`, `API.isMember()`, `API.joinGroup()`
├── `openGroup` now uses `API.getGroup()`, `API._getSb().channel()`, `API.addItemsBatch()`
├── `loadShared`/`loadMembers`/`loadGroupExpenses` now use `API.getItems()`, `API.getMembers()`, `API.getExpenses()`
├── `addGroupAgenda`/`addGroupExpense`/`addGroupWish` now use `API.addItem()`, `API.addExpense()`
├── `editGroupTime`/`editGroupCost` now use `API.updateItem()`
├── `removeGroupItem`/`removeGroupExpense` now use `API.deleteItem()`, `API.deleteExpense()`
├── `leaveGroup` now uses `API._getSb().removeChannel()`, `API.leaveGroup()`
├── Mockup synced: `mockup/trip-planner.html` and `mockup/backend/trippi-api.js` are identical to deploy
├── JS syntax validation: PASS (all 3 files)
└── Realtime syntax test (`rt-syntax-check.mjs`): PASS (`[RT STATUS] SUBSCRIBED`)

## Verification Status
- A subscription: PASS (`SUBSCRIBED` confirmed)
- B subscription: BLOCKED by test environment; direct WebSocket to port 9223 times out
- B→A agenda sync: BLOCKED
- A→B agenda sync: BLOCKED
- Expense sync: BLOCKED

## Current Issue
Live A/B realtime verification incomplete. Node.js WebSocket to B's DevTools page (`DC51787B95CC8D54D24CED372D5D8AF8`) times out on `Runtime.evaluate`. MCP `chrome-devtools-win` can only observe one page at a time.

## Pending Actions
├── Phase 2 (Preserve Behavior): A/B realtime test with both Chrome windows to verify no regressions
├── Phase 2: Verify on deployed GitHub Pages
├── Phase 2: Remove temporary `[RT STATUS]` / `[RT EVENT]` console logs from openGroup() after A/B verification approval
├── Phase 4: Create RPC functions for `create_group`, `join_group`, `create_group_from_trip`, `create_shared_item`, `update_shared_item`, `delete_shared_item`, `create_expense`, `delete_expense`, `leave_group` (SQL draft complete in `supabase/003_rpc_collaboration.sql` — NOT executed, AWAITING REVIEW)
└── Phase 4: Migrate `trippi-api.js` methods to use `supabase.rpc()` internally (frontend contract unchanged)
