# TRIPPI Current State

## Last Updated
2026-08-15

## Active Branch
master

## Live Deployment
https://gilacoding.github.io/trippi/trip-planner.html

## Recent Changes
- Applied realtime subscription fix in `openGroup()`
- Changed from bare `await ch.subscribe()` to callback-based `SUBSCRIBED` gate
- Added temporary `[RT STATUS]` and `[RT EVENT]` console logs for verification
- Change mirrored to `trippi-deploy/trip-planner.html`

## Verification Status
- A subscription: PASS (`SUBSCRIBED` confirmed)
- B subscription: BLOCKED by test environment; direct WebSocket to port 9223 times out
- B→A agenda sync: BLOCKED
- A→B agenda sync: BLOCKED
- Expense sync: BLOCKED

## Current Issue
Live A/B realtime verification incomplete. Node.js WebSocket to B's DevTools page (`DC51787B95CC8D54D24CED372D5D8AF8`) times out on `Runtime.evaluate`. MCP `chrome-devtools-win` can only observe one page at a time.

## Pending Actions
- [ ] Remove temporary `[RT STATUS]` / `[RT EVENT]` logs after approval
- [ ] Complete A/B realtime test with both Chrome windows
- [ ] Commit clean diff
- [ ] Verify on deployed GitHub Pages
