// MarkiCab service worker — hardened cache
// P1 fix: versioned cache + stale-cache cleanup on activate +
//        network-first for API JS so backend/trippi-api.js is never permanently cached.
const CACHE_VERSION = 'markicab-personal-v3';
const CORE_FILES = [
  './index.html',
  './trip-planner.html',
  './markicab.webmanifest',
  './markicab-icon.svg',
  './lzstring.js'
  // NOTE: backend/supabase-client.js and backend/trippi-api.js are intentionally
  // excluded from pre-cache AND served network-first (see fetch handler) so JS
  // updates deploy without a manual SW cache clear.
];

// Files that must always reflect the latest deployed version (never stale-cached).
// HTML shells are network-first so deploys propagate immediately (offline falls back to cache).
const NETWORK_FIRST = [
  // Bare directory paths ('/', '/sub/') resolve to an HTML shell but matched no
  // pattern below, so they were served cache-first — that is the real cause of
  // "I have to press F5 before I see the new version". Treat any navigation
  // request as network-first.
  /(^|\/)$/,
  /trip-planner\.html(\?|$)/,
  /index\.html(\?|$)/,
  /\/backend\/trippi-api\.js(\?|$)/,
  /\/backend\/supabase-client\.js(\?|$)/,
  /\/markicab-sw\.js(\?|$)/,
  /\/markicab\.webmanifest(\?|$)/,
  /\/markicab-icon\.svg(\?|$)/
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(CORE_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  // Delete any caches from older versions so stale JS/assets can't survive.
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Let an open page promote a waiting worker instead of forcing the user to close
// every tab. The page posts this after it sees 'updatefound'.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // Only handle same-origin GETs; let cross-origin (Supabase CDN, API) pass through.
  if (url.origin !== self.location.origin) return;

  // A navigation (address bar, link, PWA launch) must always try the network,
  // whatever its path shape.
  const isNetworkFirst = event.request.mode === 'navigate'
    || NETWORK_FIRST.some(re => re.test(url.pathname));

  if (isNetworkFirst) {
    // Network-first: always try the server; fall back to cache only if offline.
    event.respondWith(
      fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./trip-planner.html')))
    );
    return;
  }

  // Stale-while-revalidate for offline assets. Audit finding: plain cache-first
  // returned the OLD file to an already-open tab forever (measured: BUILD_ONE served
  // while the server had BUILD_TWO). Now the cached copy is still returned instantly,
  // but a background refresh updates the cache so the next read is current.
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached || caches.match('./trip-planner.html'));
      return cached || network;
    })
  );
});
