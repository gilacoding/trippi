/**
 * feature-bootstrap.js — Central feature initialization with failure isolation.
 *
 * WHY: Each feature module (auth-ux, gallery-agg, explore, saved-trips) publishes
 * a public interface on window then calls init(). If init throws uncaught, a
 * downstream `<script>` block or the shared bootstrap aborts, taking the whole
 * app down. This module wraps every init in try/catch so that:
 *
 *   1. Feature interfaces are published BEFORE init runs (already the case in
 *      each module), so consumers can reference them even if init throws.
 *   2. An init error is CAUGHT + REPORTED (console.error, #debugEl, mcToast)
 *      — never re-thrown, never aborting sibling features or core bootstrap.
 *   3. Health + errors are collected for clean-session verification.
 *
 * Each feature keeps its own auto-init path (register → deferred bootstrap, or
 * bare init() when FeatureBootstrap is absent). No feature depends on this
 * module existing to function — it is purely a safety net.
 *
 * UMD: works as <script> (window.FeatureBootstrap) or CommonJS (module.exports).
 */
(function () {
  var registry = [];   // [{ name: String, initFn: Function|null }]
  var errors = [];     // [{ name, error, message }]
  var health = {};     // name -> 'registered' | 'ok' | 'error'

  function report(name, err) {
    var msg = (err && err.message) ? err.message : String(err == null ? '' : err);
    var label = '[FeatureBootstrap] ' + name + ' initialization failed: ' + msg;
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error(label, err);
    }
    // Mirror into the on-page debug element (non-blocking, best-effort)
    if (typeof document !== 'undefined') {
      var el = document.getElementById && document.getElementById('debugEl');
      if (el) {
        el.style.display = 'block';
        el.textContent += (el.textContent ? '\n' : '') + '✗ ' + name + ': ' + msg;
      }
    }
    // Toast if the app's toast layer has loaded
    if (typeof window !== 'undefined' && typeof window.mcToast === 'function') {
      try { window.mcToast(name + ' initialization failed — see console', 'err', 5000); } catch (e) {}
    }
  }

  var FeatureBootstrap = {
    /**
     * Register a feature for deferred, contained init.
     * The feature MUST have already published its interface on window before
     * calling this (register only stores the init function).
     */
    register: function (name, initFn) {
      if (typeof window !== 'undefined' && !window.FeatureBootstrap) {
        // first-load guard — should not happen (we set window below), but be safe
      }
      registry.push({ name: name, initFn: typeof initFn === 'function' ? initFn : null });
      health[name] = 'registered';
    },

    /**
     * Run a single init with immediate failure isolation.
     * Used by bootstrap() for each registered feature, and available for
     * features that init eagerly (legacy auto-init path).
     */
    run: function (name, fn) {
      if (typeof fn !== 'function') return;
      try {
        fn();
        health[name] = 'ok';
      } catch (e) {
        health[name] = 'error';
        errors.push({ name: name, error: e, message: (e && e.message) ? e.message : String(e) });
        report(name, e);
      }
    },

    /**
     * Run every registered feature init with containment.
     * One feature throwing never prevents a sibling from initializing.
     */
    bootstrap: function () {
      for (var i = 0; i < registry.length; i++) {
        var r = registry[i];
        this.run(r.name, r.initFn);
      }
    },

    /** Collected init errors: [{ name, error, message }] */
    errors: errors,
    /** Feature health map: name -> 'registered' | 'ok' | 'error' */
    health: health,
    /** Registered features: [{ name, initFn }] */
    registry: registry,

    /** Clear state (for tests / clean re-bootstrap) */
    _reset: function () {
      registry.length = 0;
      errors.length = 0;
      for (var k in health) { delete health[k]; }
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = FeatureBootstrap;
  if (typeof window !== 'undefined') window.FeatureBootstrap = FeatureBootstrap;
})();
