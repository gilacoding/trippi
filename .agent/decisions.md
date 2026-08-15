# TRIPPI Decisions

## Realtime Subscription Fix (2026-08-15)
- **Problem:** `ch.subscribe()` Promise resolves before `postgres_changes` subscription is confirmed (`SUBSCRIBED`). Observed `channelState: "joined"` instead of `SUBSCRIBED`.
- **Decision:** Replace bare `await ch.subscribe()` with callback-based gate that resolves only on `SUBSCRIBED`.
- **Location:** `trip-planner.html`, function `openGroup()`, line 279
- **Temporary:** Added `[RT STATUS]` and `[RT EVENT]` console logs for verification only.
- **Commit status:** NOT YET COMMITTED — awaiting A/B realtime test completion and approval to remove logs.

## Deploy Source
- **Decision:** `trippi-deploy/` is the GitHub Pages source. Changes in `mockup/` must be mirrored to `trippi-deploy/` before deployment.
- **Rationale:** Separate git repo history in `mockup/`; deploy folder is clean.

## Browser Automation
- **Decision:** Use MCP `chrome-devtools-win` for single-page observation. Direct Node.js WebSocket to Chrome debug ports is unreliable in this environment.
- **Rationale:** Port 9223 times out on `Runtime.evaluate` despite page being listed; MCP provides stable single-page access.
