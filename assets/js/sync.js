/**
 * MarkiCab Sync / Persistence Orchestration
 * Extracted from trip-planner.html — no behavior change.
 *
 * Dependencies:
 *   - window.state (local trip/to-go state)
 *   - window.colState (collaborative group state)
 *   - window.MarkiAPI (API boundary layer)
 */
(function (root, factory) {
  const sync = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = sync;
  }
  if (typeof window !== 'undefined') {
    window.MarkiSync = sync;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.MarkiSync = sync;
  }
})(this, function () {
  'use strict';

  // ── Personal Trip Sync (M2 dual-write) ────────────────────────────

  /**
   * Sync a single trip to Supabase.
   * @param {object} trip
   */
  async function syncTrip(trip) {
    if (!colState.uid || !trip) return;
    try {
      const sb = await API.upsertTrip({ local_id: trip.id, name: trip.name, destination: trip.destination, start: trip.start, end: trip.end, note: trip.note });
      if (sb.error) { console.error('[sync] trip upsert failed', sb.error); return; }
      const sbId = sb.data && sb.data.id;
      if (!sbId) return;
      trip.supabase_trip_id = sbId;
      const agendaResult = await API.upsertAgenda(sbId, trip.items || []);
      await API.upsertExpenses(sbId, trip.expenses || []);
      trip.synced_at = Date.now();
      try { localStorage.setItem(STORE_KEY, JSON.stringify({ trips: state.trips, toGo: state.toGo })); } catch {}
    } catch (e) { console.error('[sync] trip sync error', e); }
  }

  /**
   * Sync the active trip to Supabase.
   */
  async function syncActiveTrip() {
    if (!colState.uid) return;
    const t = getTrip();
    if (t && !t.readOnlyTrip) await syncTrip(t);
  }

  /**
   * Backfill all local trips lacking a server id.
   */
  async function backfillAndSync() {
    if (!colState.uid) return;
    const localTrips = (state.trips || []).filter(t => !t.supabase_trip_id);
    for (const t of localTrips) {
      try { await syncTrip(t); } catch (e) { console.error('[sync] backfill trip failed (skipped, non-fatal):', e); }
    }
    if (localTrips.length) setMig(SYNC_VERSION);
    await verifySync();
  }

  /**
   * Verify local(server-backed) vs Supabase counts; logs only.
   */
  async function verifySync() {
    try {
      const sb = await API.countTrips();
      if (sb.error) {
        console.log('[sync] verify FAILED server=request_error local=' + (state.trips || []).filter(t => t.supabase_trip_id).length);
        return;
      }
      const sbCount = (sb.data && typeof sb.data.count === 'number') ? sb.data.count : (sb.count || 0);
      const localCount = (state.trips || []).filter(t => t.supabase_trip_id).length;
      console.log('[sync] verify local(server-backed)=' + localCount + ' server=' + sbCount + (sbCount === localCount ? ' MATCH' : ' MISMATCH'));
    } catch (e) { console.error('[sync] verify error', e); }
  }

  /**
   * Load server groups into local state.
   */
  async function loadServerGroups() {
    if (!colState.uid) return;
    try {
      const { data, error } = await API.listMyGroups();
      if (error || !data || !data.length) return;
      const now = [...state.trips];
      data.forEach(g => {
        const existing = now.find(t => t.id === g.id || t.serverId === g.id || t.groupId === g.id);
        if (existing) {
          existing.name = g.name; existing.destination = g.destination || '';
          existing.start = g.start_date || existing.start; existing.end = g.end_date || existing.end;
          existing.serverId = g.id; existing.groupId = g.id; existing.isGroup = true; existing.role = g.role;
          existing._member_count = g.member_count; existing._item_count = g.item_count; existing._expense_total = g.expense_total;
        } else {
          now.push({ id: g.id, serverId: g.id, groupId: g.id, name: g.name, destination: g.destination || '', start: g.start_date || '2026-01-01', end: g.end_date || '2026-01-01', items: [], expenses: [], isGroup: true, role: g.role, _member_count: g.member_count, _item_count: g.item_count, _expense_total: g.expense_total });
        }
      });
      state.trips = now; save(); renderHome();
    } catch (e) { console.warn('[groups] loadServerGroups failed', e); }
  }

  /**
   * Fetch personal trips from Supabase and merge into local state.
   */
  async function loadPersonalTrips() {
    if (!colState.uid) return;
    try {
      const { data, error } = await API.listPersonalTrips();
      if (error || !data || !data.length) return;
      const now = [...state.trips];
      data.forEach(t => {
        const existing = now.find(trip => trip.supabase_trip_id === t.id || (t.local_id && trip.id === t.local_id));
        if (existing) {
          existing.name = t.name; existing.destination = t.destination || '';
          existing.start = t.start_date; existing.end = t.end_date;
          existing.note = t.note || '';
          existing.supabase_trip_id = t.id;
          if (t.items && t.items.length && (!existing.items || !existing.items.length)) {
            existing.items = t.items.map(i => ({
              id: i.local_id || i.id, date: i.date, title: i.title || '', time: i.time || '', budget: i.budget || 0, link: i.link || '', note: i.note || ''
            }));
          }
          if (t.expenses && t.expenses.length && (!existing.expenses || !existing.expenses.length)) {
            existing.expenses = t.expenses.map(x => ({
              id: x.local_id || x.id, date: x.date, name: x.name || '', amount: x.amount || 0, category: x.category || 'Lainnya', note: x.note || ''
            }));
          }
        } else {
          now.push({
            id: t.local_id || t.id, supabase_trip_id: t.id, name: t.name, destination: t.destination || '',
            start: t.start_date, end: t.end_date, note: t.note || '',
            items: (t.items || []).map(i => ({
              id: i.local_id || i.id, date: i.date, title: i.title || '', time: i.time || '', budget: i.budget || 0, link: i.link || '', note: i.note || ''
            })),
            expenses: (t.expenses || []).map(x => ({
              id: x.local_id || x.id, date: x.date, name: x.name || '', amount: x.amount || 0, category: x.category || 'Lainnya', note: x.note || ''
            })),
            synced_at: Date.now()
          });
        }
      });
      state.trips = now; save(); renderHome();
    } catch (e) { console.warn('[trips] loadPersonalTrips failed', e); }
  }

  /**
   * Hook: when a session appears, backfill.
   */
  async function onSessionReady(uid) {
    if (uid) { colState.uid = uid; await backfillAndSync(); await loadServerGroups(); await loadPersonalTrips(); }
  }

  // ── Group Data Loading ─────────────────────────────────────────────

  /**
   * Load shared items for a group.
   * @param {string} id - Group ID
   */
  async function loadShared(id) {
    const { data } = await API.getItems(id);
    const ad = colState.activeDate || (colState.group && daysBetween(String(colState.group.start_date || ''), String(colState.group.end_date || ''))[0]) || '';
    colState.items = (data || []).map(i => i.date ? i : { ...i, date: ad });
    renderGroupPlanner();
  }

  /**
   * Load group members.
   * @param {string} id - Group ID
   */
  async function loadMembers(id) {
    const ml = document.getElementById('memberList');
    if (ml) showLoading(ml, 'Memuat anggota...');
    const { data } = await API.getMembers(id);
    colState.members = data || [];
    seedIdentities(colState.members);
    renderGroupPlanner();
  }

  /**
   * Load group expenses.
   * @param {string} id - Group ID
   */
  async function loadGroupExpenses(id) {
    const { data } = await API.getExpenses(id);
    colState.expenses = data || [];
    renderGroupExpenses();
  }

  // ── P0.5 Realtime Reconciliation ──────────────────────────────────

  /**
   * The ONE reconciliation contract. Fetches authoritative snapshot and replaces state.
   * @param {string} reason - Trigger reason for logging
   */
  async function reconcileTrip(reason) {
    const g = colState.group;
    if (!g || !g.id) return;
    const id = g.id;

    if (colState._reconciling) { colState._reconcileAgain = true; return; }
    colState._reconciling = true;
    try {
      do {
        colState._reconcileAgain = false;
        const [itemsRes, membersRes, expensesRes] = await Promise.all([
          API.getItems(id), API.getMembers(id), API.getExpenses(id)
        ]);
        if (!colState.group || colState.group.id !== id) return;
        const ad = colState.activeDate || daysBetween(String(g.start_date || ''), String(g.end_date || ''))[0] || '';
        if (itemsRes && !itemsRes.error) {
          colState.items = (itemsRes.data || []).map(i => i.date ? i : Object.assign({}, i, { date: ad }));
        }
        if (membersRes && !membersRes.error) {
          colState.members = membersRes.data || [];
          seedIdentities(colState.members);
          await loadIdentities(id);
        }
        if (expensesRes && !expensesRes.error) {
          colState.expenses = expensesRes.data || [];
        }
        renderGroupPlanner();
        renderGroupExpenses();
        if (document.getElementById('groupWishList')) await loadWishlists(id);
        if (colState.journey && colState.journey.status === 'active') await loadCrewMap();
      } while (colState._reconcileAgain);
    } catch (e) {
      console.warn('[sync] reconcileTrip(' + reason + ') failed:', e && e.message);
    } finally {
      colState._reconciling = false;
    }
  }

  /**
   * Install recovery triggers for visibility/focus/online events.
   */
  function installSyncRecovery() {
    if (colState._syncRecoveryWired) return;
    colState._syncRecoveryWired = true;
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) routeReconcile('visibility');
    });
    window.addEventListener('focus', function () { routeReconcile('focus'); });
    window.addEventListener('online', function () { routeReconcile('online'); });
  }

  /**
   * Route reconciliation to guest or member path.
   * @param {string} reason
   */
  function routeReconcile(reason) {
    if (colState.isGuest) {
      if (colState._guestTrip) reconcileGuestTrip(reason);
      return;
    }
    if (colState.group && colState.group.id) reconcileTrip(reason);
  }

  /**
   * Tear down group session: channels, polling, state.
   */
  async function teardownGroupSession() {
    if (colState.poll) { clearInterval(colState.poll); colState.poll = null; }
    if (colState.channel) {
      const sb = API._getSb();
      if (sb) { try { await sb.removeChannel(colState.channel); } catch (e) { console.warn('[MarkiCab] removeChannel failed:', e && e.message); } }
      colState.channel = null;
    }
    await stopJourneyRealtime();
    colState.group = null;
    colState.items = [];
    colState.members = [];
    colState.expenses = [];
    colState.nameMap = {};
    colState.activeDate = null;
    colState.journey = null;
    colState.perms = null;
    colState.crewLocations = [];
  }

  // ── Guest Sync ────────────────────────────────────────────────────

  /**
   * Guest counterpart of reconcileTrip.
   * @param {string} reason
   */
  async function reconcileGuestTrip(reason) {
    if (!guestSession || !guestSession.token) return;
    if (colState._guestReconciling) { colState._guestReconcileAgain = true; return; }
    colState._guestReconciling = true;
    try {
      do {
        colState._guestReconcileAgain = false;
        const { data, error } = await API.getGuestTrip(guestSession.token);
        if (error || !data) return;
        colState._guestTrip = data;
        seedIdentities(data.members);
        renderGuestItinerary(data);
        await renderGuestWishlist();
        if (colState.group && colState.group.id) {
          const mem = await API.getMembers(colState.group.id);
          if (mem && !mem.error && Array.isArray(mem.data) && mem.data.length) {
            colState.members = mem.data;
            seedIdentities(mem.data);
          }
          await loadIdentities(colState.group.id);
        }
        renderCrewStatusList();
        if (colState.journey && colState.journey.status === 'active') await loadCrewMap();
      } while (colState._guestReconcileAgain);
    } catch (e) {
      console.warn('[sync] reconcileGuestTrip(' + reason + ') failed:', e && e.message);
    } finally {
      colState._guestReconciling = false;
    }
  }

  /**
   * Initialize guest realtime subscription.
   */
  async function initGuestRealtime() {
    const sb = API._getSb && API._getSb();
    if (!sb || !colState.group || !colState.group.id) return;
    const gid = colState.group.id;
    const topic = 'guest:' + gid;
    if (colState.guestChannel) {
      try { await sb.removeChannel(colState.guestChannel); } catch (e) { console.warn('[guest rt] removeChannel failed:', e && e.message); }
      colState.guestChannel = null;
    }
    const stale = sb.getChannels().filter(function (x) {
      return x.topic === topic || x.topic === 'realtime:' + topic;
    });
    for (let i = 0; i < stale.length; i++) {
      try { await sb.removeChannel(stale[i]); } catch (e) { console.warn('[guest rt] stale removeChannel failed:', e && e.message); }
    }
    const invalidate = (why) => () => reconcileGuestTrip('realtime:' + why);
    const ch = sb.channel(topic);
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'shared_items', filter: 'group_id=eq.' + gid }, invalidate('shared_items'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_expenses', filter: 'group_id=eq.' + gid }, invalidate('group_expenses'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wishlist_items', filter: 'group_id=eq.' + gid }, invalidate('wishlist_items'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: 'group_id=eq.' + gid }, invalidate('group_members'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations', filter: 'group_id=eq.' + gid }, () => {
        if (colState.journey && colState.journey.status === 'active') loadCrewMap();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journey_sessions', filter: 'group_id=eq.' + gid }, () => {
        if (colState._guestTrip) renderGuestLocationActions(colState._guestTrip);
      });
    ch.subscribe(function (status) {
      console.log('[MarkiCab] realtime guest:' + gid + ' status:', status);
      if (status === 'SUBSCRIBED') {
        if (colState._guestSubscribedOnce) reconcileGuestTrip('resubscribe');
        colState._guestSubscribedOnce = true;
      }
    });
    colState.guestChannel = ch;
    if (colState.guestPoll) clearInterval(colState.guestPoll);
    colState.guestPoll = setInterval(function () {
      if (guestSession && colState.group && colState.group.id === gid) reconcileGuestTrip('poll');
    }, 5000);
    installSyncRecovery();
  }

  /**
   * Tear down guest session.
   */
  async function teardownGuestSession() {
    const sb = API._getSb && API._getSb();
    if (colState.guestChannel && sb) {
      try { await sb.removeChannel(colState.guestChannel); } catch (e) { console.warn('[guest rt] teardown failed:', e && e.message); }
    }
    colState.guestChannel = null;
    if (colState.guestPoll) { clearInterval(colState.guestPoll); colState.guestPoll = null; }
  }

  return {
    syncTrip,
    syncActiveTrip,
    backfillAndSync,
    verifySync,
    loadServerGroups,
    loadPersonalTrips,
    onSessionReady,
    loadShared,
    loadMembers,
    loadGroupExpenses,
    reconcileTrip,
    installSyncRecovery,
    routeReconcile,
    teardownGroupSession,
    reconcileGuestTrip,
    initGuestRealtime,
    teardownGuestSession
  };
});
