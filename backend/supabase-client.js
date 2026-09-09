// MarkiCab backend scaffold (M0). Inert until configured.
// Configure by setting window.__MARKICAB_SUPABASE__ = { url, anonKey } before this
// script loads, OR via meta tags in <head>:
//   <meta name="markicab-supabase-url" content="...">
//   <meta name="markicab-supabase-anon" content="...">
// When unconfigured, MarkiCab stays in personal-only mode (no errors, no network).
(function () {
  var w = window;
  function meta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? el.getAttribute('content') : null;
  }
  var cfg = w.__MARKICAB_SUPABASE__ || {
    url: meta('markicab-supabase-url'),
    anonKey: meta('markicab-supabase-anon'),
  };
  var ready = !!(cfg && cfg.url && cfg.anonKey);

  w.MarkiBackend = {
    ready: ready,
    config: cfg,
    client: null,
    // Lazily create client on first real use.
    // Note: supabase-js@2 is loaded via static <script> tag in <head>.
    init: function () {
      var self = this;
      if (!ready) {
        console.info('[MarkiCab] backend not configured — running in personal mode only.');
        return Promise.resolve(false);
      }
      if (self.client) return Promise.resolve(true);
      if (w.supabase && w.supabase.createClient) {
        try {
          self.client = w.supabase.createClient(cfg.url, cfg.anonKey);
          return Promise.resolve(true);
        } catch (e) { return Promise.reject(e); }
      }
      // Fallback: load dynamically if static tag failed
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        s.onload = function () {
          try {
            if (!w.supabase) throw new Error('supabase-js not available');
            self.client = w.supabase.createClient(cfg.url, cfg.anonKey);
            resolve(true);
          } catch (e) { reject(e); }
        };
        s.onerror = function () { reject(new Error('failed to load supabase-js')); };
        document.head.appendChild(s);
      });
    },
  };
})();
