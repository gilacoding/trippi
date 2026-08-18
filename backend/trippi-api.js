// ─────────────────────────────────────────────────────────────────────
// Trippi API Boundary Layer (Phase 4 — RPC Migration)
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

  function signOut() {
    cachedUid = null; authReady = false;
    return getClient().then(function (client) {
      if (!client) return { error: null };
      return client.auth.signOut();
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
    signInWithEmail: signInWithEmail,
    signOut: signOut,
    onAuthChange: onAuthChange,
    getSession: getSession,

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
      return cachedClient
        .from('groups')
        .select('*')
        .eq('id', id)
        .maybeSingle();
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
      // payload = { group_id, name, amount, category, note, date }
      // created_by is NOT sent — RPC uses auth.uid()
      return cachedClient.rpc('create_expense', {
        p_group_id:  payload.group_id,
        p_name:      payload.name,
        p_amount:    payload.amount || null,
        p_category:  payload.category || '',
        p_note:      payload.note || '',
        p_date:      payload.date || null
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

    // ── Realtime ────────────────────────────────────────────────────
    // The frontend creates a Supabase Realtime channel and manages its
    // lifecycle. We expose the underlying client so the channel API
    // can be used without the frontend touching `colState.sb` directly.
    _getSb: function () { return cachedClient; },

  };

  // Expose on window so trip-planner.html can call TrippiAPI.createGroup() etc.
  window.TrippiAPI = API;

})();
