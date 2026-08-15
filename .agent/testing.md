# TRIPPI Testing Protocol

## Collaboration Feature Testing

### Required Setup
- **Browser A:** Normal Chrome profile (port 9222)
- **Browser B:** Incognito Chrome profile (port 9223)
- **Group:** Fresh test UUID or existing group
- **Users:** Different anonymous sessions (separate profiles)

### Pre-Test Checklist
- [ ] Both browsers loaded to `?group=<uuid>`
- [ ] Both users joined group (memberCount >= 2)
- [ ] Console open on both browsers
- [ ] No errors in console before test starts

### Test 1: Subscription Status
**On both A and B:**
- Expected: `[RT STATUS] SUBSCRIBED`
- Expected: `[Trippi] realtime group:<id> status: SUBSCRIBED`
- FAIL if: `joined`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`

### Test 2: B → A Agenda Sync
**On B:**
- Insert: Title `RT PATCH TEST B`, Date: active date, Time: `12:00`
- Expected: DB row created, B UI updates immediately

**On A (without refresh):**
- Expected: `[RT EVENT] shared_items` appears in console
- Expected: `loadShared()` called
- Expected: New item appears in UI within 5s
- FAIL if: No event, no UI update

### Test 3: A → B Agenda Sync
**On A:**
- Insert: Title `RT PATCH TEST A`
- Expected: DB row created, A UI updates

**On B (without refresh):**
- Expected: `[RT EVENT] shared_items` appears
- Expected: New item appears in UI within 5s

### Test 4: Expense Sync
**On B:**
- Insert expense: Name `RT Expense Test`, Amount `10000`, Category `Lainnya`
- Expected: DB row created, B UI updates

**On A (without refresh):**
- Expected: `[RT EVENT] group_expenses` appears
- Expected: Expense appears in UI within 5s

### Failure Diagnostic
If realtime event not received:
1. Check `colState.channel.state` on both A and B
2. Check `colState.items.length` before and after
3. Direct DB query: `colState.sb.from('shared_items').select('*').eq('group_id', GID)`
4. Check if DB row exists but UI missing → render issue
5. Check if DB row missing → event delivery issue
6. Do NOT refresh — capture state first

### Regression Testing
- [ ] Personal trip still works (no group)
- [ ] Group creation still works
- [ ] Group join still works
- [ ] Polling fallback still works (3s interval)
- [ ] Refresh preserves data
- [ ] Leave group works
- [ ] Share link works

## Environment Notes
- MCP `chrome-devtools-win` can only observe one page at a time
- Direct Node.js WebSocket to Chrome debug ports may timeout on port 9223
- Use local server for testing: `python -m http.server 5174 --directory mockup/`
- Test group: `d62161f5-79bf-4b33-8f4a-7da0bb5d4bd4`
