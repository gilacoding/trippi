// ─────────────────────────────────────────────────────────────────────
// Markicab Canonical-to-Pipeline Adapter
// ─────────────────────────────────────────────────────────────────────
// Consumes a canonical Trip object (per canonical-import-model.md) and
// feeds it into the EXISTING Markicab pipeline — without the pipeline
// ever knowing or caring about the original import format.
//
// Two ingestion paths, selected by trip.groupId:
//
//   Personal (groupId === null)
//     → state.trips[] (localStorage) + syncTrip() → Supabase dual-write
//     → wishlist[] + null-date items → state.toGo[]
//
//   Collaborative (groupId !== null)
//     → API.createGroup() + API.joinGroup()
//     → API.addItemsBatch() / addExpensesBatch() / addWishlistItem()
//     → openGroup() to render
//
// Adding a new import format later = add a new parser that produces a
// canonical Trip. This adapter and the pipeline stay untouched.
//
// Usage (browser):
//   MarkicabCanonicalAdapter.ingestCanonicalTrip(canonicalTrip)
//     .then(trip => console.log('Ingested:', trip.id))
//
// Usage (Node test — inject mock pipeline):
//   var Adapter = MarkicabCanonicalAdapter;
//   Adapter.setContext(mockCtx);
//   Adapter.ingestCanonicalTrip(canonicalTrip).then(...)
// ─────────────────────────────────────────────────────────────────────
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkicabCanonicalAdapter = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Injectable pipeline context ─────────────────────────────────
  // In the browser, defaults to the globals in trip-planner.html.
  // In tests, call setContext() with mocks before ingest.
  var _ctx = null;

  function setContext(ctx) { _ctx = ctx; }

  function C() {
    if (_ctx) return _ctx;
    return {
      state: window.state,
      colState: window.colState,
      API: window.MarkiAPI,
      save: window.save,
      syncTrip: window.syncTrip,
      ensureAuth: window.ensureAuth,
      openTrip: window.openTrip,
      openGroup: window.openGroup,
      renderHome: window.renderHome,
      genId: function () {
        return (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      },
      normalizeLink: window.normalizeLink || function (v) {
        var s = (v || '').trim();
        if (!s) return '';
        return /^https?:\/\//i.test(s) ? s : 'https://' + s;
      },
      log: function (msg) { console.log('[CanonicalAdapter] ' + msg); },
      warn: function (msg) { console.warn('[CanonicalAdapter] ' + msg); }
    };
  }

  // ── Validation ───────────────────────────────────────────────────
  function validateCanonicalTrip(t) {
    if (!t || typeof t !== 'object') {
      throw new Error('Invalid canonical trip: expected object');
    }
    if (!t.id) throw new Error('Missing required field: id');
    if (!t.name || !t.name.trim()) throw new Error('Missing required field: name');
    // start/end may be undefined if the parser only has partial data —
    // the pipeline will prompt the user to fill them in (same as a blank form).
    return true;
  }

  // ── Coerce helpers ───────────────────────────────────────────────
  function toInternalDate(d) { return (d || '').trim(); }

  function coerceMonetary(v) {
    if (v === undefined || v === null || v === '') return '0';
    var s = String(v).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return '0';
    return s;
  }

  // ── Canonical Trip → internal personal trip object ──────────────
  function toInternalTrip(canonical) {
    // Separate scheduled items (have date) from wishlist items (null date)
    var scheduledItems = [];
    var wishlistFromItems = [];

    (canonical.items || []).forEach(function (item) {
      if (!item) return;
      var internal = {
        id: item.id,
        date: toInternalDate(item.date),
        title: item.title || '',
        time: (item.time || '').trim(),
        budget: coerceMonetary(item.budget),
        link: String(item.link || '').trim(),
        note: String(item.note || '').trim()
      };
      if (internal.date) {
        scheduledItems.push(internal);
      } else {
        // Null-date itinerary item → wishlist (spec: "Wishlist = empty date")
        wishlistFromItems.push({
          id: item.id,
          name: item.title || '',
          link: String(item.link || '').trim(),
          note: String(item.note || '').trim()
        });
      }
    });

    return {
      id: canonical.id,
      name: canonical.name,
      destination: (canonical.destination || '').trim(),
      start: toInternalDate(canonical.start),
      end: toInternalDate(canonical.end),
      note: (canonical.note || '').trim(),
      groupId: canonical.groupId || null,
      items: scheduledItems,
      expenses: (canonical.expenses || []).map(function (exp) {
        if (!exp) return null;
        return {
          id: exp.id,
          date: toInternalDate(exp.date),
          name: exp.name || '',
          amount: coerceMonetary(exp.amount),
          category: exp.category || 'Lainnya',
          note: (exp.note || '').trim()
        };
      }).filter(function (e) { return e !== null; }),
      _wishlistFromItems: wishlistFromItems
    };
  }

  // ── Personal mode ingestion ──────────────────────────────────────
  function ingestPersonal(canonical, ctx) {
    var trip = toInternalTrip(canonical);

    // Merge explicit canonical wishlist[] + null-date items[] into state.toGo
    var toGoAdditions = trip._wishlistFromItems.slice();
    (canonical.wishlist || []).forEach(function (wl) {
      if (!wl) return;
      toGoAdditions.push({
        id: wl.id,
        name: wl.title || '',
        link: (wl.link || '').trim(),
        note: (wl.note || '').trim()
      });
    });
    delete trip._wishlistFromItems;

    // Upsert into state.trips (by id)
    var idx = ctx.state.trips.findIndex(function (t) { return t.id === trip.id; });
    if (idx >= 0) {
      // Preserve runtime-only fields (supabase_trip_id, synced_at, serverId, isGroup)
      var existing = ctx.state.trips[idx];
      trip.supabase_trip_id = trip.supabase_trip_id || existing.supabase_trip_id;
      trip.synced_at = existing.synced_at;
      trip.serverId = existing.serverId;
      ctx.state.trips[idx] = trip;
      ctx.log('Updated existing personal trip: ' + trip.id);
    } else {
      ctx.state.trips.push(trip);
      ctx.log('Created new personal trip: ' + trip.id);
    }

    // Persist to localStorage + schedule Supabase sync
    ctx.save();

    // Add wishlist items to toGo (dedup by id)
    if (toGoAdditions.length) {
      var existingIds = new Set((ctx.state.toGo || []).map(function (g) { return g.id; }));
      toGoAdditions.forEach(function (w) {
        if (!existingIds.has(w.id)) {
          ctx.state.toGo.push(w);
          existingIds.add(w.id);
        }
      });
      ctx.save();
    }

    // Trigger immediate Supabase sync if authenticated (non-blocking)
    var syncPromise = ctx.colState.uid
      ? ctx.syncTrip(trip).catch(function (e) { ctx.warn('Sync failed (non-fatal): ' + e.message); })
      : Promise.resolve();

    return syncPromise.then(function () { return trip; });
  }

  // ── Collaborative mode ingestion ────────────────────────────────
  function ingestCollaborative(canonical, ctx) {
    return ctx.ensureAuth().then(function (uid) {
      if (!uid) {
        return Promise.reject(new Error('Authentication required for collaborative import'));
      }

      return ctx.API.createGroup({
        name: canonical.name,
        destination: canonical.destination || '',
        start_date: canonical.start || null,
        end_date: canonical.end || null
      }).then(function (result) {
        if (result.error) {
          return Promise.reject(result.error);
        }
        var group = result.data;
        ctx.log('Created group: ' + group.id);

        // Join as member
        var displayName = (ctx.colState.name || '').trim().slice(0, 40) || 'Importer';
        return ctx.API.joinGroup({
          group_id: group.id,
          display_name: displayName
        }).then(function (joinResult) {
          if (joinResult.error) {
            ctx.warn('Join failed (non-fatal): ' + joinResult.error.message);
          }

          var batchPromises = [];

          // Batch insert items (scheduled only — null-date items go to wishlist)
          var scheduledItems = (canonical.items || []).filter(function (i) { return i && i.date; });
          if (scheduledItems.length) {
            var itemRows = scheduledItems.map(function (item) {
              return {
                group_id: group.id,
                title: item.title || '',
                note: (item.note || '').trim(),
                link: (item.link || '').trim(),
                date: item.date || null,
                time: (item.time || '').trim(),
                budget: parseFloat(coerceMonetary(item.budget)) || 0,
                done: !!item.done
              };
            });
            batchPromises.push(
              ctx.API.addItemsBatch(itemRows).then(function (r) {
                if (r.error) ctx.warn('Items batch partial failure: ' + r.error.message);
                return r;
              })
            );
          }

          // Batch insert expenses
          if (canonical.expenses && canonical.expenses.length) {
            var expRows = canonical.expenses.filter(Boolean).map(function (exp) {
              return {
                group_id: group.id,
                name: exp.name || '',
                amount: parseFloat(coerceMonetary(exp.amount)) || 0,
                category: exp.category || 'Lainnya',
                note: (exp.note || '').trim(),
                date: (exp.date || '').trim() || null
              };
            });
            batchPromises.push(
              ctx.API.addExpensesBatch(expRows).then(function (r) {
                if (r.error) ctx.warn('Expenses batch partial failure: ' + r.error.message);
                return r;
              })
            );
          }

          // Insert wishlist items (explicit wishlist[] + null-date items[])
          var wishlistItems = (canonical.items || []).filter(function (i) { return i && !i.date; })
            .concat(canonical.wishlist || []);
          if (wishlistItems.length) {
            var wishPromises = wishlistItems.filter(Boolean).map(function (wl) {
              return ctx.API.addWishlistItem(
                group.id,
                wl.title || '',
                (wl.link || '').trim() || null,
                (wl.note || '').trim() || null
              );
            });
            batchPromises.push(Promise.all(wishPromises));
          }

          // Routes: createRoute + addWaypoint per route
          if (canonical.routes && canonical.routes.length) {
            canonical.routes.forEach(function (route) {
              if (!route) return;
              batchPromises.push(
                ctx.API.createRoute(group.id, route.name || 'Route').then(function (rr) {
                  if (rr.error) { ctx.warn('Route create failed: ' + rr.error.message); return; }
                  var routeId = rr.data && rr.data[0] ? rr.data[0].id : rr.data;
                  if (!routeId) return;
                  var wpPromises = (route.waypoints || []).filter(Boolean).map(function (wp) {
                    return ctx.API.addWaypoint(routeId, {
                      name: wp.name,
                      sequence: wp.sequence,
                      latitude: wp.lat,
                      longitude: wp.lng,
                      day_number: wp.dayNumber,
                      category: wp.category,
                      arrival_time: wp.arrivalTime,
                      departure_time: wp.departureTime,
                      notes: wp.notes
                    });
                  });
                  return Promise.all(wpPromises);
                })
              );
            });
          }

          // Gallery, members, journey: logged as not-yet-supported (require
          // interactive file upload / manual consent). The trip is still usable.
          if (canonical.gallery && canonical.gallery.length) {
            ctx.warn('Gallery import skipped (requires file upload): ' + canonical.gallery.length + ' items');
          }
          if (canonical.members && canonical.members.length) {
            ctx.warn('Members import skipped (must be invited): ' + canonical.members.length + ' items');
          }
          if (canonical.journey) {
            ctx.warn('Journey state import skipped (requires manual start)');
          }

          return Promise.all(batchPromises).then(function () {
            ctx.log('Group ingestion complete: ' + group.id);
            return group;
          });
        });
      });
    });
  }

  // ── Public API ──────────────────────────────────────────────────
  function ingestCanonicalTrip(canonicalTrip, options) {
    options = options || {};
    var ctx = C();

    try {
      validateCanonicalTrip(canonicalTrip);
    } catch (e) {
      return Promise.reject(e);
    }

    if (canonicalTrip.groupId) {
      return ingestCollaborative(canonicalTrip, ctx);
    } else {
      return ingestPersonal(canonicalTrip, ctx);
    }
  }

  // Convenience: ingest and then open the trip in the UI
  function ingestAndOpen(canonicalTrip, options) {
    options = options || {};
    var ctx = C();
    return ingestCanonicalTrip(canonicalTrip, options).then(function (result) {
      if (canonicalTrip.groupId) {
        // Collaborative — open the group
        ctx.openGroup(result.id, true).then(function () {
          if (options.replaceHistory !== false) {
            history.replaceState({}, '', '?group=' + result.id);
          }
        });
      } else {
        // Personal — open the trip
        ctx.openTrip(result.id);
        ctx.renderHome();
      }
      return result;
    });
  }

  return {
    ingestCanonicalTrip: ingestCanonicalTrip,
    ingestAndOpen: ingestAndOpen,
    setContext: setContext,
    toInternalTrip: toInternalTrip,       // exposed for unit testing
    validateCanonicalTrip: validateCanonicalTrip
  };
});
