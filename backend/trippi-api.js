// ─────────────────────────────────────────────────────────────────────
// MarkiCab API Boundary Layer (Phase 4 — RPC Migration)
// ─────────────────────────────────────────────────────────────────────
// All Supabase access is funneled through this module. The frontend
// (trip-planner.html) never calls `sb.from(...)` directly — it calls
// the named functions below.
//
// Business mutations route through Supabase RPC functions:
//   create_group       join_group    create_group_from_trip
//   create_shared_item update_shared_item delete_shared_item
//   create_expense     delete_expense   leave_group
//
// Reads remain direct PostgREST queries:
//   getGroup  getMembers  getItems  getExpenses  isMember
//
// Realtime channel management:
//   _getSb() exposes the supabase client for channel operations
// ─────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // Grab the backend loader that supabase-client.js exposes on window.
  var SB = window.TrippiBackend;

  // ── Auth singleton ────────────────────────────────────────────────
  // Session-aware auth. No anonymous sign-in (production model: email/password).
  // ensureAuth() returns the current session user id, or null if unauthenticated.
  var authP = null;          // in-flight promise (prevents duplicate init)
  var cachedUid = null;      // resolved user id
  var cachedClient = null;   // supabase client once SB.client is ready
  var authReady = false;

  function getClient() {
    if (cachedClient) return Promise.resolve(cachedClient);
    return SB.init().then(function (ok) {
      if (!ok) return null;
      cachedClient = SB.client;
      return cachedClient;
    });
  }

  // Returns current session uid or null (NO anonymous fallback).
  function ensureAuth() {
    if (cachedUid) return Promise.resolve(cachedUid);
    if (authReady) return Promise.resolve(null);
    if (authP) return authP;
    authP = getClient().then(function (client) {
      if (!client) { authReady = true; return null; }
      return client.auth.getUser().then(function (res) {
        var user = res.data && res.data.user;
        if (user) { cachedUid = user.id; }
        else { authReady = true; }
        return cachedUid;
      }).catch(function () { authReady = true; return null; });
    }).then(function (uid) { authP = null; return uid; });
    return authP;
  }

  // Email + password sign up. Returns { data, error } (Supabase shape).
  // NOTE: project requires email confirmation (mailer_autoconfirm=false).
  // Caller must handle the "check your email" confirmation step.
  function signUpWithEmail(email, password) {
    return getClient().then(function (client) {
      if (!client) return { data: null, error: { message: 'Backend unavailable' } };
      return client.auth.signUp({ email: email, password: password });
    });
  }

  // P1: Convert anonymous user to registered in-place via updateUser.
  // Supabase natively supports this — same UID, session stays valid,
  // is_anonymous becomes false, email_confirmed_at is null until confirmed.
  // This is the recommended approach for anonymous → registered conversion
  // when mailer_autoconfirm is false (no session returned from signUp).
  function updateUserEmailAndPassword(email, password) {
    return getClient().then(function (client) {
      if (!client) return { data: null, error: { message: 'Backend unavailable' } };
      return client.auth.updateUser({ email: email, password: password });
    });
  }

  // P1: Clear denormalized is_anonymous flag in group_members after in-place conversion.
  // Called after updateUserEmailAndPassword for anonymous → registered conversion.
  function clearMemberAnonFlag() {
    return getClient().then(function (client) {
      if (!client) return { data: null, error: { message: 'Backend unavailable' } };
      return client.rpc('clear_member_anon_flag', {});
    });
  }

  // Email + password sign in. Returns { data, error }.
  function signInWithEmail(email, password) {
    return getClient().then(function (client) {
      if (!client) return { data: null, error: { message: 'Backend unavailable' } };
      return client.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
        if (res.data && res.data.user) cachedUid = res.data.user.id;
        return res;
      });
    });
  }

  // M3.5: Social login (Google first; Apple later). Adds an auth PATH,
  // does NOT replace email/password. auth.uid() stays the identity, so
  // ownership/RLS/permissions are untouched. No schema change.
  function signInWithOAuth(provider, redirectTo) {
    return getClient().then(function (client) {
      if (!client) return { data: null, error: { message: 'Backend unavailable' } };
      return client.auth.signInWithOAuth({
        provider: provider,
        options: {
          // Return to the same page so Supabase-js can pick up the session
          // from the URL hash and fire SIGNED_IN through onAuthChange.
          redirectTo: redirectTo || window.location.href
        }
      });
    });
  }

  function signOut() {
    cachedUid = null; authReady = false;
    return getClient().then(function (client) {
      if (!client) return { error: null };
      return client.auth.signOut();
    });
  }

  // P0.2: Anonymous sign-in for guest participants (no email/password).
  // Returns { data: { user, session }, error }.
  function signInAnonymously(displayName) {
    return getClient().then(function (client) {
      if (!client) return { data: null, error: { message: 'Backend unavailable' } };
      return client.auth.signInAnonymously({ data: { display_name: displayName || 'Guest' } }).then(function (res) {
        if (res.data && res.data.user) {
          cachedUid = res.data.user.id;
          authReady = true;
        }
        return res;
      });
    });
  }

  // Subscribe to auth state changes. cb receives (event, session).
  function onAuthChange(cb) {
    return getClient().then(function (client) {
      if (!client) return null;
      return client.auth.onAuthStateChange(function (event, session) {
        cachedUid = session && session.user ? session.user.id : null;
        if (!cachedUid) authReady = false;
        cb(event, session);
      });
    });
  }

  function getSession() {
    return getClient().then(function (client) {
      if (!client) return { data: { session: null }, error: null };
      return client.auth.getSession();
    });
  }

  // ── Named API functions ───────────────────────────────────────────
  // Mutations use rpc(). Returns { data, error } matching Supabase client format.
  // Return shapes are normalized to match what trip-planner.html expects
  // (i.e., the old .from().insert().select().single() shapes).

  var API = {

    // ── Auth ──────────────────────────────────────────────────────
    ensureAuth: ensureAuth,
    signUpWithEmail: signUpWithEmail,
    updateUserEmailAndPassword: updateUserEmailAndPassword,
    clearMemberAnonFlag: clearMemberAnonFlag,
    signInWithEmail: signInWithEmail,
    signInWithOAuth: signInWithOAuth,
    signOut: signOut,
    signInAnonymously: signInAnonymously,
    onAuthChange: onAuthChange,
    getSession: getSession,

    // Returns the full auth user object {id, email, is_anonymous, ...} or null
    getUserObject: function () {
      return getClient().then(function (client) {
        if (!client) return null;
        return client.auth.getUser().then(function (res) {
          return (res.data && res.data.user) || null;
        }).catch(function () { return null; });
      });
    },

    // Account linking: transfer anonymous identity to a new registered account.
    // Migrates all attribution, memberships, then deletes the anon identity.
    transferAnonymousIdentity: function (oldUserId, newUserId, displayName) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('transfer_anonymous_identity', {
          p_old_user_id: oldUserId,
          p_new_user_id: newUserId,
          p_display_name: displayName || null
        }).then(function (res) {
          if (res.error) return { data: null, error: res.error };
          return { data: res.data, error: null };
        });
      });
    },

    // ── Groups ────────────────────────────────────────────────────
    // OLD: .from('groups').insert(payload) → returns {id, name, ...}
    // NEW: rpc('create_group') → returns {group_id, group_name, ...}
    //      Normalizes group_id → id, group_name → name for frontend
    createGroup: function (payload) {
      // payload = { name, destination, start_date, end_date, display_name }
      // created_by is NOT sent — RPC uses auth.uid()
      return cachedClient.rpc('create_group', {
        p_name:         payload.name,
        p_destination:  payload.destination || null,
        p_start_date:   payload.start_date || null,
        p_end_date:     payload.end_date || null,
        p_display_name: payload.display_name || null
      }).then(function (result) {
        // Normalize RPC return shape to match old .from().insert().select().single()
        // NOTE: rpc() for a RETURNS TABLE function returns data as an ARRAY, even for one row.
        var row = (result && Array.isArray(result.data)) ? result.data[0] : (result ? result.data : null);
        if (row && row.group_id) {
          result.data = {
            id: row.group_id,
            name: row.group_name,
            created_by: row.created_by,
            created_at: row.created_at,
            destination: row.destination,
            start_date: row.start_date,
            end_date: row.end_date
          };
        }
        return result;
      });
    },

    // Converts a personal trip into a collaborative group atomically.
    // Replaces: createGroup + addItemsBatch + addExpensesBatch + joinGroup
    // NEW: rpc('create_group_from_trip') — single atomic transaction
    // Note: HTML currently calls individual methods (already RPC-backed),
    // but this method provides the atomic RPC for future optimization.
    makeGroupFromTrip: function (payload) {
      // payload = { name, destination, start_date, end_date, display_name, items, expenses }
      // items and expenses are arrays of objects matching the JSONB structure
      return cachedClient.rpc('create_group_from_trip', {
        p_trip_name:    payload.name,
        p_destination:  payload.destination || null,
        p_start_date:   payload.start_date || null,
        p_end_date:     payload.end_date || null,
        p_display_name: payload.display_name || null,
        p_items:        payload.items || null,
        p_expenses:     payload.expenses || null
      }).then(function (result) {
        // Normalize RPC return shape
        // NOTE: rpc() for a RETURNS TABLE function returns data as an ARRAY, even for one row.
        var row = (result && Array.isArray(result.data)) ? result.data[0] : (result ? result.data : null);
        if (row && row.group_id) {
          result.data = {
            id: row.group_id,
            name: row.group_name,
            created_by: row.created_by,
            created_at: row.created_at,
            destination: row.destination,
            start_date: row.start_date,
            end_date: row.end_date,
            member_count: row.member_count
          };
        }
        return result;
      });
    },

    getGroup: function (id) {
      // Use list_my_groups RPC then filter — avoids REST .from('groups') RLS 403
      return cachedClient.rpc('list_my_groups').then(function (r) {
        var arr = (r && Array.isArray(r.data)) ? r.data : [];
        var row = arr.find(function (g) { return g.id === id || g.group_id === id; }) || null;
        return { data: row, error: r && r.error ? r.error : null };
      });
    },

    // ── Group Members ───────────────────────────────────────────────
    // OLD: .from('group_members').insert(payload) → returns {group_id, user_id, ...}
    // NEW: rpc('join_group') → returns {group_id, user_id, display_name, joined_at, already_joined}
    //      Return shape matches old — just has extra already_joined field
    joinGroup: function (payload) {
      // payload = { group_id, display_name }
      // user_id is NOT sent — RPC uses auth.uid()
      return cachedClient.rpc('join_group', {
        p_group_id:     payload.group_id,
        p_display_name: payload.display_name || null
      });
    },

    isMember: function (groupId, uid) {
      return cachedClient
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', uid)
        .maybeSingle();
    },

    getMembers: function (groupId) {
      return cachedClient
        .from('group_members')
        .select('*')
        .eq('group_id', groupId)
        .order('joined_at');
    },

    // OLD: .from('group_members').delete().eq('group_id', groupId).eq('user_id', uid)
    // NEW: rpc('leave_group') — only needs p_group_id, user_id from auth.uid()
    leaveGroup: function (groupId, uid) {
      // uid param is accepted for backward compat but ignored —
      // RPC derives identity from auth.uid()
      return cachedClient.rpc('leave_group', {
        p_group_id: groupId
      }).then(function (result) {
        // Normalize: RPC returns {data: {removed: boolean}},
        // frontend expects to just fire-and-forget
        // (removeGroupItem-style: no return value used)
        return result;
      });
    },

    // ── Shared Items (agenda / wishlist) ──────────────────────────
    // OLD: .from('shared_items').insert(payload)
    // NEW: rpc('create_shared_item')
    addItem: function (payload) {
      // payload = { group_id, title, note, link, done, date, time, budget }
      // created_by is NOT sent — RPC uses auth.uid()
      return cachedClient.rpc('create_shared_item', {
        p_group_id: payload.group_id,
        p_title:    payload.title,
        p_note:     payload.note || '',
        p_link:     payload.link || '',
        p_done:     payload.done || false,
        p_date:     payload.date || null,
        p_time:     payload.time || null,
        p_budget:   payload.budget || null
      });
    },

    // Called by makeGroupFromTrip and openGroup(fresh) to batch-insert items
    // OLD: .from('shared_items').insert(rows)
    // NEW: Loops through rows, calling rpc('create_shared_item') for each.
    //      create_group_from_trip handles the initial group creation batch,
    //      so this is only used for subsequent batch inserts (e.g. openGroup fresh copy).
    addItemsBatch: function (rows) {
      // Insert each row via create_shared_item RPC
      var promises = rows.map(function (row) {
        return cachedClient.rpc('create_shared_item', {
          p_group_id: row.group_id,
          p_title:    row.title || '',
          p_note:     row.note || '',
          p_link:     row.link || '',
          p_done:     row.done || false,
          p_date:     row.date || null,
          p_time:     row.time || null,
          p_budget:   row.budget || null
        });
      });
      // Return a promise that resolves when all inserts complete
      // Resolves to array of { data, error } for consistency with Supabase batch
      return Promise.all(promises).then(function (results) {
        var errors = results.filter(function (r) { return r.error; });
        if (errors.length > 0) {
          return { error: errors[0].error, data: null };
        }
        return { data: results.map(function (r) { return r.data; }), error: null };
      });
    },

    // OLD: .from('shared_items').update(patch).eq('id', id)
    // NEW: rpc('update_shared_item') — all fields nullable, uses coalesce
    updateItem: function (id, patch) {
      // patch = { title, note, link, done, date, time, budget } (any subset)
      return cachedClient.rpc('update_shared_item', {
        p_item_id: id,
        p_title:   patch.title || null,
        p_note:    patch.note !== undefined ? patch.note : null,
        p_link:    patch.link !== undefined ? patch.link : null,
        p_done:    patch.done !== undefined ? patch.done : null,
        p_date:    patch.date !== undefined ? patch.date : null,
        p_time:    patch.time !== undefined ? patch.time : null,
        p_budget:  patch.budget !== undefined ? patch.budget : null
      });
    },

    deleteItem: function (id) {
      // OLD: .from('shared_items').delete().eq('id', id)
      // NEW: rpc('delete_shared_item')
      return cachedClient.rpc('delete_shared_item', {
        p_item_id: id
      });
    },

    getItems: function (groupId) {
      return cachedClient
        .from('shared_items')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at');
    },

    // ── Group Expenses ──────────────────────────────────────────────
    // OLD: .from('group_expenses').insert(payload)
    // NEW: rpc('create_expense')
    addExpense: function (payload) {
      // payload = { group_id, name, amount, category, note, date, paid_by? }
      // created_by is NOT sent — RPC uses auth.uid()
      // paid_by defaults to the logging user inside the RPC
      return cachedClient.rpc('create_expense', {
        p_group_id:  payload.group_id,
        p_name:      payload.name,
        p_amount:    payload.amount || null,
        p_category:  payload.category || '',
        p_note:      payload.note || '',
        p_date:      payload.date || null,
        p_paid_by:   payload.paid_by || null
      });
    },

    // Called by makeGroupFromTrip for batch expense insert
    // (create_group_from_trip handles the initial batch atomically)
    // NEW: Loops through rows, calling rpc('create_expense') for each.
    addExpensesBatch: function (rows) {
      var promises = rows.map(function (row) {
        return cachedClient.rpc('create_expense', {
          p_group_id:  row.group_id,
          p_name:      row.name || '',
          p_amount:    row.amount || null,
          p_category:  row.category || '',
          p_note:      row.note || '',
          p_date:      row.date || null
        });
      });
      return Promise.all(promises).then(function (results) {
        var errors = results.filter(function (r) { return r.error; });
        if (errors.length > 0) {
          return { error: errors[0].error, data: null };
        }
        return { data: results.map(function (r) { return r.data; }), error: null };
      });
    },

    deleteExpense: function (id) {
      // OLD: .from('group_expenses').delete().eq('id', id)
      // NEW: rpc('delete_expense')
      return cachedClient.rpc('delete_expense', {
        p_expense_id: id
      });
    },

    getExpenses: function (groupId) {
      return cachedClient
        .from('group_expenses')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at');
    },

    // ── Personal Trips (M2: Supabase = source of truth) ───────────
    // Direct table access; RLS (owner-only, authenticated) protects rows.
    // These are for the LOGGED-IN user's own trips. LocalStorage remains
    // cache/draft/offline; these methods back the dual-write sync layer.
    // Idempotent backfill keyed on local_id (unique(user_id, local_id)).
    upsertTrip: function (trip) {
      // trip = { local_id, name, destination, start_date, end_date, note }
      return cachedClient
        .from('trips')
        .upsert({
          local_id:    trip.local_id,
          name:        trip.name || '',
          destination: trip.destination || '',
          start_date:  trip.start || null,
          end_date:    trip.end || null,
          note:        trip.note || ''
        }, { onConflict: 'user_id,local_id' })
        .select('id, local_id').single();
    },

    // Insert agenda items for a trip, keyed by (trip_id, local_id) for idempotency.
    upsertAgenda: function (tripSbId, items) {
      if (!items || !items.length) return Promise.resolve({ data: [], error: null });
      var rows = items.map(function (i) {
        return {
          trip_id: tripSbId,
          local_id: i.id,
          date: i.date || null,
          title: i.title || '',
          time: i.time || '',
          budget: Number(i.budget) || 0,
          link: i.link || '',
          note: i.note || ''
        };
      });
      return cachedClient.from('agenda_items').upsert(rows, { onConflict: 'trip_id,local_id' }).select('id');
    },

    upsertExpenses: function (tripSbId, expenses) {
      if (!expenses || !expenses.length) return Promise.resolve({ data: [], error: null });
      var rows = expenses.map(function (x) {
        return {
          trip_id: tripSbId,
          local_id: x.id,
          date: x.date || null,
          name: x.name || '',
          amount: Number(x.amount) || 0,
          category: x.category || 'Lainnya',
          note: x.note || ''
        };
      });
      return cachedClient.from('expenses').upsert(rows, { onConflict: 'trip_id,local_id' }).select('id');
    },

    // Pull server trips (used only after verify, for the eventual read-switch).
    listTrips: function () {
      return cachedClient
        .from('trips')
        .select('id, local_id, name, destination, start_date, end_date, note, updated_at')
        .order('updated_at', { ascending: false });
    },

    countTrips: function () {
      return cachedClient.from('trips').select('*', { count: 'exact', head: true });
    },

    // Hard-delete a trip + children (used only in cleanup phase, never during dual-write).
    deleteTrip: function (sbId) {
      return cachedClient.from('trips').delete().eq('id', sbId);
    },

    // ── Guest Access + Creator-only Sharing (M2 security patch) ──
    // Guests use the anon *API key* (publishable) — NOT Supabase Anonymous Auth
    // (that provider stays disabled). All enforcement is server-side in the RPCs.
    // Guests cannot create/share trips; only the trip creator can share.
    // NOTE: must route through getClient() so cachedClient is initialized (anon client
    // is created lazily on first use; calling cachedClient directly throws if null).
    createInvitation: function (groupId, displayName) {
      // CREATOR ONLY (enforced server-side)
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('create_invitation', { p_group_id: groupId, p_display_name: displayName || null });
      });
    },
    redeemInvitation: function (token, displayName) {
      // guest (anon or authenticated) joins + gets trip payload
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('redeem_invitation', { p_token: token, p_display_name: displayName || null });
      });
    },
    getGuestTrip: function (token) {
      // anon-safe read by token only (trip-scoped)
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('get_guest_trip', { p_token: token }).then(function (result) {
          var row = (result && Array.isArray(result.data)) ? result.data[0] : (result ? result.data : null);
          return { data: row, error: result ? result.error : null };
        });
      });
    },
    revokeInvitation: function (token) {
      // CREATOR ONLY (enforced server-side)
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('revoke_invitation', { p_token: token });
      });
    },
    listMyInvitations: function (groupId) {
      // CREATOR ONLY (enforced server-side)
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('list_my_invitations', { p_group_id: groupId });
      });
    },
    // M3 Phase 2: list the logged-in user's groups (for home view persistence)
    listMyGroups: function () {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('list_my_groups');
      });
    },
    // M3 Phase 1: permission matrix (owner/member) — single source of truth
    getTripPermissions: function (groupId) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('trip_permissions', { p_group_id: groupId });
      });
    },
    // Creator-only group edit. No new RPC: the existing RLS policy already
    // restricts UPDATE on public.groups to the owner (verified live — a guest's
    // PATCH matches zero rows), so this uses the plain table endpoint.
    updateGroup: function (groupId, fields) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.from('groups').update(fields).eq('id', groupId).select().single();
      });
    },
    // P0.7 identity foundation: canonical per-user names.
    // profiles is the source of truth; group_members.display_name stays as a
    // per-trip legacy snapshot (and is the only name an anonymous guest has).
    ensureProfile: function (displayName) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('ensure_profile', { p_display_name: displayName || null });
      });
    },
    // One scoped round trip: uuid -> {name, role, is_anonymous, avatar_url}
    getGroupIdentities: function (groupId) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('get_group_identities', { p_group_id: groupId });
      });
    },
    updateMyProfile: function (displayName) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('ensure_profile', { p_display_name: displayName });
      });
    },
    // Fase C: Group Wishlist
    listWishlists: function (groupId) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('list_wishlist_items', { p_group_id: groupId });
      });
    },
    addWishlistItem: function (groupId, title, link, note) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('add_wishlist_item', {
          p_group_id: groupId,
          p_title: title,
          p_link: link || null,
          p_note: note || null
        });
      });
    },
    convertWishlistToItinerary: function (wishlistId, date, time) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('convert_wishlist_to_itinerary', {
          p_wishlist_id: wishlistId,
          p_date: date,
          p_time: time || null
        });
      });
    },
    // M3 Phase 1: owner-only member management
    removeMember: function (groupId, userId) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('remove_member', { p_group_id: groupId, p_user_id: userId });
      });
    },
    deleteGroup: function (groupId) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('delete_group', { p_group_id: groupId });
      });
    },

    // ── M4.2 Route (wrappers over M4.1 SECURITY DEFINER RPCs) ───────
    getRoute: function (groupId) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('get_route', { p_group_id: groupId }).then(function (result) {
          // get_route RPC returns jsonb; Supabase may pass it as a JSON string
          if (result && result.data && typeof result.data === 'string') {
            try { result.data = JSON.parse(result.data); } catch (e) { /* keep raw */ }
          }
          return result;
        });
      });
    },
    createRoute: function (groupId, name) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('create_route', {
          p_group_id: groupId,
          p_name: name
        });
      });
    },
    addWaypoint: function (routeId, wp) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        wp = wp || {};
        return client.rpc('add_waypoint', {
          p_route_id: routeId,
          p_name: wp.name,
          p_sequence: wp.sequence != null ? wp.sequence : null,
          p_latitude: wp.latitude != null ? wp.latitude : null,
          p_longitude: wp.longitude != null ? wp.longitude : null,
          p_day_number: wp.day_number ? wp.day_number : null,
          p_category: wp.category || null,
          p_arrival_time: wp.arrival_time || null,
          p_departure_time: wp.departure_time || null,
          p_estimated_arrival_time: wp.estimated_arrival_time || null,
          p_notes: wp.notes || null
        });
      });
    },
    reorderWaypoints: function (routeId, orderedIds) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('reorder_waypoints', {
          p_route_id: routeId,
          p_ordered_ids: orderedIds
        });
      });
    },
    deleteWaypoint: function (waypointId) {
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.from('route_waypoints').delete().eq('id', waypointId);
      });
    },

    // ── M4.3 / M4.4 / M4.5: Journey Permission & Location Sharing ─────
    // M4.5 is the FRONTEND layer built behind the M4.3/M4.4 backend gate.
    // These methods are a 1:1 thin wrapper around the SECURITY DEFINER RPCs.
    // No p_user_id param — identity is always auth.uid().

    startJourney: function () {
      var gid = colState.group && colState.group.id;
      if (!gid) return Promise.resolve({ data: null, error: { message: 'No group context' } });
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('start_journey_session', { p_group_id: gid });
      });
    },

    endJourney: function () {
      var gid = colState.group && colState.group.id;
      if (!gid) return Promise.resolve({ data: null, error: { message: 'No group context' } });
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('end_journey_session', { p_group_id: gid });
      });
    },

    grantLocationConsent: function () {
      var gid = colState.group && colState.group.id;
      if (!gid) return Promise.resolve({ data: null, error: { message: 'No group context' } });
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('grant_location_permission', { p_group_id: gid });
      });
    },

    revokeLocationConsent: function () {
      var gid = colState.group && colState.group.id;
      if (!gid) return Promise.resolve({ data: null, error: { message: 'No group context' } });
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('revoke_location_permission', { p_group_id: gid });
      });
    },

    upsertMemberLocation: function (lat, lng, accuracy, heading, speed) {
      var gid = colState.group && colState.group.id;
      if (!gid) return Promise.resolve({ data: null, error: { message: 'No group context' } });
      // Client-side input guard (defense in depth — DB validates too):
      // reject out-of-range / non-finite coordinates before the RPC round-trip.
      if (!isFinite(lat) || lat < -90 || lat > 90) {
        return Promise.resolve({ data: null, error: { message: 'latitude out of range [-90, 90]' } });
      }
      if (!isFinite(lng) || lng < -180 || lng > 180) {
        return Promise.resolve({ data: null, error: { message: 'longitude out of range [-180, 180]' } });
      }
      if (accuracy != null && (!isFinite(accuracy) || accuracy < 0)) {
        return Promise.resolve({ data: null, error: { message: 'accuracy must be non-negative' } });
      }
      if (heading != null && (!isFinite(heading) || heading < 0 || heading >= 360)) {
        return Promise.resolve({ data: null, error: { message: 'heading must be in [0, 360)' } });
      }
      if (speed != null && (!isFinite(speed) || speed < 0)) {
        return Promise.resolve({ data: null, error: { message: 'speed must be non-negative' } });
      }
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('upsert_member_location', {
          p_group_id: gid,
          p_lat: lat,
          p_lng: lng,
          p_accuracy_m: accuracy || 0,
          p_heading_deg: heading || null,
          p_speed_mps: speed || null
        });
      });
    },

    getCrewLocations: function () {
      var gid = colState.group && colState.group.id;
      if (!gid) return Promise.resolve({ data: null, error: { message: 'No group context' } });
      return getClient().then(function (client) {
        if (!client) return { data: null, error: { message: 'Backend unavailable' } };
        return client.rpc('get_crew_locations', { p_group_id: gid });
      });
    },

    // M4.5: getCrewLocations is the authoritative read path — it applies
    // the same 4-gate admission check (auth.uid, is_group_member,
    // active journey, consent=granted) and returns either positions
    // or [] / error. Journey state is probed from its return shape
    // (see renderJourneyView in trip-planner.html). No separate
    // status RPC needed — avoids redundant side-effecting calls.

    // ── Gallery v1 ─────────────────────────────────────────────────
        // Private bucket `gallery`, signed URLs only (1 hour expiry).
        // Path: gallery/{group_id}/{user_id}/{YYYYMMDD}_{random8}.{ext}

        _galleryAllowedMime: ['image/jpeg', 'image/png', 'image/webp'],
        _galleryMaxSize: 10 * 1024 * 1024, // 10 MB

        uploadMedia: function (payload) {
          // payload = { groupId, file, caption }
          // Returns { data: { id, storage_path, signed_url }, error }
          var self = this;
          var file = payload.file;
          // Client-side validation (defense in depth — storage policy also enforces)
          if (self._galleryAllowedMime.indexOf(file.type) === -1) {
            return Promise.resolve({ data: null, error: { message: 'Tipe file tidak diizinkan. Hanya JPEG, PNG, WebP.' } });
          }
          if (file.size > self._galleryMaxSize) {
            return Promise.resolve({ data: null, error: { message: 'Ukuran file melebihi 10 MB.' } });
          }
          return getClient().then(function (client) {
            if (!client) return { data: null, error: { message: 'Backend unavailable' } };
            return client.auth.getUser().then(function (ures) {
              var user = ures.data && ures.data.user;
              if (!user) return { data: null, error: { message: 'Not authenticated' } };
              // Build path: gallery/{group_id}/{user_id}/{YYYYMMDD}_{random8}.{ext}
              var ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
              var now = new Date();
              var ymd = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
              var rnd = Math.random().toString(36).slice(2, 10);
              var storagePath = payload.groupId + '/' + user.id + '/' + ymd + '_' + rnd + '.' + ext;
              return client.storage.from('gallery').upload(storagePath, file, {
                contentType: file.type,
                upsert: false
              }).then(function (upRes) {
                if (upRes.error) return { data: null, error: upRes.error };
                // Insert metadata row
                return client.from('gallery_media').insert({
                  group_id: payload.groupId,
                  uploader_id: user.id,
                  storage_path: upRes.data.path,
                  mime_type: file.type,
                  file_size: file.size,
                  caption: payload.caption || ''
                }).select('id, storage_path').single().then(function (insRes) {
                  if (insRes.error) {
                    // Rollback storage insert on metadata failure
                    client.storage.from('gallery').remove([upRes.data.path]);
                    return { data: null, error: insRes.error };
                  }
                  // Generate signed URL (1 hour expiry)
                  return client.storage.from('gallery').createSignedUrl(insRes.data.storage_path, 3600).then(function (urlRes) {
                    return {
                      data: {
                        id: insRes.data.id,
                        storage_path: insRes.data.storage_path,
                        signed_url: urlRes.data ? urlRes.data.signedUrl : null
                      },
                      error: urlRes.error
                    };
                  });
                });
              });
            });
          });
        },

        deleteMedia: function (mediaId) {
          // Returns { data: { deleted }, error }
          return getClient().then(function (client) {
            if (!client) return { data: null, error: { message: 'Backend unavailable' } };
            // Fetch the row first to get storage_path
            return client.from('gallery_media').select('storage_path').eq('id', mediaId).single().then(function (selRes) {
              if (selRes.error) return { data: null, error: selRes.error };
              var storagePath = selRes.data.storage_path;
              // Delete metadata row first
              return client.from('gallery_media').delete().eq('id', mediaId).then(function (delRes) {
                if (delRes.error) return { data: null, error: delRes.error };
                // Delete storage object (best-effort, ignore if already gone)
                return client.storage.from('gallery').remove([storagePath]).then(function () {
                  return { data: { deleted: true }, error: null };
                });
              });
            });
          });
        },

        listMedia: function (groupId) {
          // Returns { data: [{ id, storage_path, signed_url, uploader_id, caption, created_at }], error }
          return getClient().then(function (client) {
            if (!client) return { data: null, error: { message: 'Backend unavailable' } };
            return client.from('gallery_media')
              .select('id, storage_path, uploader_id, caption, created_at')
              .eq('group_id', groupId)
              .order('created_at', { ascending: false })
              .then(function (res) {
                if (res.error) return { data: null, error: res.error };
                var items = res.data || [];
                // Generate signed URLs for each (1 hour expiry)
                var signedPaths = items.map(function (it) { return it.storage_path; });
                return client.storage.from('gallery').createSignedUrls(signedPaths, 3600).then(function (urlRes) {
                  var signedMap = {};
                  (urlRes.data || []).forEach(function (s) {
                    if (s.signedUrl) signedMap[s.path] = s.signedUrl;
                  });
                  var enriched = items.map(function (it) {
                    return {
                      id: it.id,
                      storage_path: it.storage_path,
                      signed_url: signedMap[it.storage_path] || null,
                      uploader_id: it.uploader_id,
                      caption: it.caption,
                      created_at: it.created_at
                    };
                  });
                  return { data: enriched, error: null };
                });
              });
          });
        },

        getSignedUrl: function (storagePath) {
          // Returns { data: { signed_url }, error }
          return getClient().then(function (client) {
            if (!client) return { data: null, error: { message: 'Backend unavailable' } };
            return client.storage.from('gallery').createSignedUrl(storagePath, 3600).then(function (res) {
              if (res.error) return { data: null, error: res.error };
              return { data: { signed_url: res.data ? res.data.signedUrl : null }, error: null };
            });
          });
        },

        // ── Realtime ────────────────────────────────────────────────────
        // The frontend creates a Supabase Realtime channel and manages its
        // lifecycle. We expose the underlying client so the channel API
        // can be used without the frontend touching `colState.sb` directly.
        _getSb: function () { return cachedClient; },

  };

  // Expose on window so trip-planner.html can call TrippiAPI.createGroup() etc.
  window.TrippiAPI = API;

})();
