// Trippi backend scaffold (M0). Inert until configured.
// Configure by setting window.__TRIPPI_SUPABASE__ = { url, anonKey } before this
// script loads, OR via meta tags in <head>:
//   <meta name="trippi-supabase-url" content="...">
//   <meta name="trippi-supabase-anon" content="...">
// When unconfigured, Trippi stays in personal-only mode (no errors, no network).
(function () {
  var w = window;
  function meta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? el.getAttribute('content') : null;
  }
  var cfg = w.__TRIPPI_SUPABASE__ || {
    url: meta('trippi-supabase-url'),
    anonKey: meta('trippi-supabase-anon'),
  };
  var ready = !!(cfg && cfg.url && cfg.anonKey);

  w.TrippiBackend = {
    ready: ready,
    config: cfg,
    client: null,
    // Lazily load supabase-js + create client on first real use (keeps app light).
    init: function () {
      var self = this;
      if (!ready) {
        console.info('[Trippi] backend not configured — running in personal mode only.');
        return Promise.resolve(false);
      }
      if (self.client) return Promise.resolve(true);
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        s.onload = function () {
          try {
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
