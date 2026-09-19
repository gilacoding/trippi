/**
 * navigation.js — Bottom-nav routing, show() integration patch, and
 * global back-button handler.
 *
 * Extracted from trip-planner.html "Script 2" (lines 4554–4585).
 *
 * Public interface (window.Navigation):
 *   init()              — install show() patch + click handlers + initial nav state
 *   setActiveNav(name)  — toggle .active on .nav-tab; toggle .at-saved on #savedEntryBtn
 *   goNav(name)         — bottom-nav router (trip|plan|journey|saved|explore|gallery)
 *   back()              — global back-button handler (#globalBack.onclick)
 *
 * Compatibility aliases (published on window for existing consumers):
 *   window.setActiveNav  -> Navigation.setActiveNav  (explore.js:32,43; gallery-agg.js:130;
 *                       Script 1 openSavedTrips L3820, openSavedTripDetail L3921)
 *   window.goNav         -> Navigation.goNav         (gallery-agg.js:116,119; Script 2 click wiring)
 *   window.showView      -> patched window.show      (iframe embed / deep-link consumers —
 *                       captures the PATCHED show, not the base)
 *
 * Dependencies — all via explicit window.* (NO lexical-scope access to Script 1):
 *   Core:     window.show, window.navigateHome, window.colState, window.state,
 *             window.openGroup, window.openSavedTrips
 *   Features: window.Explore, window.Gallery, window.SavedTrips (typeof-guarded, runtime-only)
 *
 * Load position: after Script 1 / Core, before feature modules — same position as
 * the current Script 2. init() runs at PARSE TIME (not deferred to FeatureBootstrap)
 * because the show() patch must be installed before any feature code calls show().
 *
 * Module pattern: IIFE + UMD for headless testing (matching explore.js,
 * saved-trips.js, feature-bootstrap.js).
 */
(function () {
  var initialized = false;

  // ── setActiveNav ──────────────────────────────────────────────────
  // Toggles .active on .nav-tab elements (matched by data-nav === name).
  // Toggles .at-saved on #savedEntryBtn when name === 'saved'.
  function setActiveNav(name) {
    document.querySelectorAll('.nav-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.nav === name);
    });
    var se = document.getElementById('savedEntryBtn');
    if (se) se.classList.toggle('at-saved', name === 'saved');
  }

  // ── goNav ─────────────────────────────────────────────────────────
  // Bottom-nav router. Branches: trip | plan | journey | saved | explore | gallery.
  // All Core dependencies referenced via window.* — no flat-scope access.
  function goNav(name) {
    if (name === 'trip') {
      setActiveNav('trip');
      window.navigateHome('home');
      var t = document.getElementById('globalTitle');
      if (t) t.textContent = 'Trip Kamu';
      var b = document.getElementById('globalBack');
      if (b) b.style.display = 'none';
    } else if (name === 'plan') {
      setActiveNav('plan');
      if (window.colState && window.colState.group && window.colState.group.id) {
        window.openGroup(window.colState.group.id, false);
      } else if (window.state && (window.state.activeTripId || window.state.readOnlyTrip)) {
        window.show('plannerView');
        var t = document.getElementById('globalTitle');
        if (t) t.textContent = 'Rencana';
        var b = document.getElementById('globalBack');
        if (b) b.style.display = 'none';
      } else {
        setActiveNav('trip');
        window.navigateHome('home');
      }
    } else if (name === 'journey') {
      if (window.colState && window.colState.group && window.colState.group.id) {
        window.openGroup(window.colState.group.id, false);
        var jt = document.querySelector('[data-gview="journey"]');
        if (jt) jt.click();
      } else {
        setActiveNav('journey');
        window.show('journeyView');
        var t = document.getElementById('globalTitle');
        if (t) t.textContent = 'Journey';
        var b = document.getElementById('globalBack');
        if (b) b.style.display = 'none';
      }
    } else if (name === 'saved') {
      if (window.SavedTrips && window.SavedTrips.show) {
        window.SavedTrips.show();
      } else {
        window.openSavedTrips();
      }
    } else if (name === 'explore') {
      if (window.Explore && window.Explore.show) {
        window.Explore.show();
      }
    } else if (name === 'gallery') {
      if (window.Gallery && window.Gallery.show) {
        window.Gallery.show();
      }
    }
  }

  // ── back ──────────────────────────────────────────────────────────
  // Global back-button handler. Wired to #globalBack.onclick inside init().
  // Equivalent to goNav('trip') but kept as a distinct named method so the
  // handler logic lives in one place (matches spec §2.4 design decision).
  function back() {
    setActiveNav('trip');
    window.navigateHome('home');
    var t = document.getElementById('globalTitle');
    if (t) t.textContent = 'Trip Kamu';
    var gb = document.getElementById('globalBack');
    if (gb) gb.style.display = 'none';
  }

  // ── init ──────────────────────────────────────────────────────────
  // Install parse-time wiring: show() patch, click handlers, global back
  // handler, initial nav state. Idempotent — safe to call multiple times.
  //
  // Runs at PARSE TIME because the show() patch must be installed before any
  // feature code calls show(). Do NOT defer to FeatureBootstrap.
  function init() {
    if (initialized) return;
    initialized = true;

    // Patch show(): wrapper calls base show, then syncs nav-tab .active,
    // #globalTitle text, and #globalBack visibility per view.
    //
    // In the browser (classic <script>), function-declaration `show` and
    // window.show share the same global binding — reassigning window.show
    // also updates the Script 1 `show` variable, so ALL callers (including
    // navigateHome's show('homeView')) hit the patch. This matches the
    // original L4583-4584 behavior exactly.
    if (typeof window !== 'undefined' && typeof window.show === 'function') {
      var _show = window.show;
      window.show = function (v) {
        _show(v);
        if (v === 'homeView') {
          setActiveNav('trip');
          var t = document.getElementById('globalTitle');
          if (t) t.textContent = 'Trip Kamu';
          var b = document.getElementById('globalBack');
          if (b) b.style.display = 'none';
        } else if (v === 'plannerView') {
          setActiveNav('plan');
          var t = document.getElementById('globalTitle');
          if (t) t.textContent = 'Rencana';
          var b = document.getElementById('globalBack');
          if (b) b.style.display = 'none';
        } else if (v === 'groupView') {
          setActiveNav('plan');
          var t = document.getElementById('globalTitle');
          if (t) t.textContent = (window.colState && window.colState.group) ? window.colState.group.name : 'Grup';
          var b = document.getElementById('globalBack');
          if (b) b.style.display = 'none';
        } else if (v === 'savedTripsView' || v === 'savedTripDetailView') {
          setActiveNav('saved');
          var b = document.getElementById('globalBack');
          if (b) b.style.display = 'none';
        } else if (v === 'historyView') {
          setActiveNav('trip');
          var b = document.getElementById('globalBack');
          if (b) b.style.display = 'none';
        } else if (v === 'guestView') {
          var b = document.getElementById('globalBack');
          if (b) b.style.display = '';
        }
      };
      // Compatibility alias: showView captures the PATCHED show (not the base)
      if (typeof window !== 'undefined') window.showView = window.show;
    }

    // ── Bottom-nav + back-button click wiring ──
    // Script loads at end of <body>, so nav DOM elements exist.

    // Nav-tab + saved entry button — route through goNav
    document.querySelectorAll('.nav-tab, #savedEntryBtn').forEach(function (t) {
      t.onclick = function () { goNav(t.dataset.nav); };
    });

    // Back buttons in feature views (existing DOM) — route through goNav
    document.querySelectorAll('button.back[data-nav]').forEach(function (t) {
      t.onclick = function (e) { e.preventDefault(); goNav(t.dataset.nav); };
    });

    // Delegated listener for dynamically-injected back buttons (e.g. exploreDetail)
    document.addEventListener('click', function (e) {
      var b = e.target.closest('button.back[data-nav]');
      if (b) { e.preventDefault(); goNav(b.dataset.nav); }
    });

    // Explore entry links
    document.querySelectorAll('.explore-entry-link[data-nav]').forEach(function (t) {
      t.onclick = function (e) { e.preventDefault(); goNav(t.dataset.nav); };
    });

    // Global back button (#globalBack) -> Navigation.back()
    var gb = document.getElementById('globalBack');
    if (gb) gb.onclick = back;

    // Initial nav state
    setActiveNav('trip');
    var t = document.getElementById('globalTitle');
    if (t) t.textContent = 'Trip Kamu';
  }

  // ── Public interface (published BEFORE init — safe even if init throws) ──
  var iface = {
    Navigation: {
      init: init,
      setActiveNav: setActiveNav,
      goNav: goNav,
      back: back
    }
  };
  window.Navigation = iface.Navigation;
  // Compatibility aliases — single code path via Navigation methods
  window.setActiveNav = setActiveNav;
  window.goNav = goNav;

  // UMD export for headless testing
  if (typeof module !== 'undefined' && module.exports) module.exports = iface;

  // ── Parse-time initialization ──
  // Navigation init MUST run at parse time (NOT deferred to FeatureBootstrap)
  // because the show() patch must be installed before any feature code calls show().
  // Loads after Script 1 / Core (window.show, window.colState, window.state available).
  // Loads before feature modules (window.Explore/Gallery/SavedTrips — guarded, runtime-only).
  if (typeof window !== 'undefined') {
    init();
  }
})();
