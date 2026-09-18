/**
 * saved-trips.js — Saved Trips feature (library of previously saved trips).
 *
 * Wraps the inline openSavedTrips() / loadSavedTrips() from Script 1 behind a
 * standard feature interface so it participates in the FeatureBootstrap
 * failure-isolation story:
 *
 *   • If Saved Trips init FAILS, Auth (and every other feature) keep working.
 *   • If the inline openSavedTrips() is missing, show() degrades to a friendly
 *     empty state instead of throwing.
 *
 * Public interface:
 *   window.SavedTrips.init()   — graceful dependency contract check
 *   window.SavedTrips.show()   — open the saved-trips view
 *   window.SavedTrips.hide()   — hide saved-trips DOM
 *   window.SavedTrips.destroy()— not used (no persistent state)
 *
 * Dependencies (window exports — typeof-guarded, no hard coupling):
 *   window.openSavedTrips — inline Script 1 function (always present after core load)
 *   window.colState, window.show, window.setActiveNav — core infra (for the empty fallback)
 *
 * UMD: works as <script> (window.SavedTrips) or CommonJS (module.exports).
 */
(function () {
  var initialized = false;

  /**
   * Graceful dependency contract check.
   * Throws ONLY when a hard contract the feature relies on is missing —
   * the error is caught by FeatureBootstrap.run/bootstrap, never by the feature.
   * Never throws on a missing DOM node.
   */
  function init() {
    if (initialized) return;
    // Saved Trips rendering lives in inline Script 1; it must be present.
    if (typeof window.openSavedTrips !== 'function') {
      throw new Error('SavedTrips: window.openSavedTrips is not available — core bootstrap did not run');
    }
    initialized = true;
  }

  /** Open the saved-trips collection view (delegates to inline openSavedTrips). */
  function show() {
    if (typeof window.openSavedTrips === 'function') {
      window.openSavedTrips();
      return;
    }
    // Graceful degradation: feature unavailable, surface an empty state.
    if (typeof document !== 'undefined') {
      var list = document.getElementById('savedTripsList');
      if (list) {
        list.innerHTML = '<div class="empty"><strong>Saved Trips belum siap.</strong><br>Coba muat ulang halaman.</div>';
      }
    }
  }

  /** Hide saved-trips DOM elements (used when navigating away). */
  function hide() {
    if (typeof document === 'undefined') return;
    ['savedTripsView', 'savedTripDetailView'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  /** No persistent state, intervals, or channels to tear down. */
  function destroy() { /* no-op */ }

  // ── Public interface (always published before init, even without bootstrap) ──
  var iface = {
    SavedTrips: { init: init, show: show, hide: hide, destroy: destroy }
  };
  window.SavedTrips = iface.SavedTrips;

  // UMD export for testing
  if (typeof module !== 'undefined' && module.exports) module.exports = iface;

  // Init with failure isolation: defer to FeatureBootstrap when available,
  // fall back to bare init() (original behaviour) when it is not.
  if (typeof window !== 'undefined' && window.FeatureBootstrap) {
    window.FeatureBootstrap.register('savedTrips', init);
  } else {
    init();
  }
})();
