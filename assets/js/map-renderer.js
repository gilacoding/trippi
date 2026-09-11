/**
 * MarkiCab MapRenderer — real map layer for Journey Mode.
 * 
 * Abstracts Leaflet/OSM tile rendering so Journey state logic
 * doesn't depend on a specific mapping provider.
 * 
 * Integration:
 *   Journey → locations → MapRenderer → Leaflet
 * 
 * Public API:
 *   MapRenderer.init(elementId) → MapRenderer instance
 *   map.setMarkers(points[])    → render crew markers
 *   map.fitToMarkers()          → auto-zoom to show all markers
 *   map.clearMarkers()          → remove all markers
 *   map.destroy()               → clean up
 */
(function () {
  'use strict';

  // ── Leaflet CDN ────────────────────────────────────────────────────
  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    
    return new Promise(function (resolve, reject) {
      // Load CSS
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
      
      // Load JS
      var script = document.createElement('script');
      script.src = LEAFLET_JS;
      script.onload = function () { resolve(window.L); };
      script.onerror = function () { reject(new Error('Failed to load Leaflet')); };
      document.head.appendChild(script);
    });
  }

  // ── MapRenderer ─────────────────────────────────────────────────────
  function MapRenderer(elementId) {
    this.elementId = elementId;
    this.map = null;
    this.markers = null;
    this.tileLayer = null;
    this._initGeneration = 0; // Incremented on each init attempt
    this._completedGeneration = 0; // Last successful init
  }

  MapRenderer.prototype.init = function () {
    var self = this;
    var myGeneration = ++this._initGeneration;
    
    return loadLeaflet().then(function (L) {
      // ABORT: A newer init() has started since this one
      if (myGeneration !== self._initGeneration) {
        return null;
      }
      
      var el = document.getElementById(self.elementId);
      if (!el) return null;

      // Ensure container has dimensions before Leaflet init
      var attempts = 0;
      function tryInit() {
        // ABORT: A newer init() has started while we were waiting
        if (myGeneration !== self._initGeneration) {
          return;
        }
        
        attempts++;
        if (el.offsetWidth > 0 && el.offsetHeight > 0) {
          // ABORT: Element is detached from DOM
          if (!document.contains(el)) {
            return;
          }
          self._createMap(L, el);
          self._completedGeneration = myGeneration;
        } else if (attempts < 20) {
          setTimeout(tryInit, 50);
        } else {
          // Fallback: force minimum dimensions
          el.style.width = el.style.width || '100%';
          el.style.height = el.style.height || '280px';
          if (document.contains(el)) {
            self._createMap(L, el);
            self._completedGeneration = myGeneration;
          }
        }
      }
      tryInit();

      return self;
    });
  };

  MapRenderer.prototype._createMap = function (L, el) {
    var self = this;

    this.map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 18
    });

    this.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(this.map);

    this.markers = L.layerGroup().addTo(this.map);

    // Initial view (will be overridden by fitToMarkers)
    this.map.setView([-2.5, 118], 4); // Indonesia center

    // Force recalc after container becomes visible
    setTimeout(function () { self.map.invalidateSize(); }, 100);
  };

  MapRenderer.prototype.setMarkers = function (points) {
    if (!this.map || !this.markers) return;

    this.markers.clearLayers();

    if (!points || !points.length) return;

    var self = this;

    points.forEach(function (p) {
      var isFresh = self._isFresh(p);
      var color = isFresh ? 'var(--accent)' : 'var(--muted)';
      var name = p.name || p.user_id.slice(0, 8);

      var icon = L.divIcon({
        className: 'crew-marker',
        html: '<div style="display:flex;align-items:center;gap:4px">' +
          '<span style="width:12px;height:12px;border-radius:50%;background:' + color + ';display:inline-block;box-shadow:0 0 0 3px rgba(0,0,0,.35)"></span>' +
          '<b style="font-size:11px;background:rgba(0,0,0,.6);color:#fff;padding:2px 6px;border-radius:4px;white-space:nowrap">' + name + '</b>' +
          '</div>',
        iconSize: [0, 0]
      });

      L.marker([p.latitude, p.longitude], { icon: icon }).addTo(self.markers);
    });
  };

  MapRenderer.prototype.fitToMarkers = function () {
    if (!this.map || !this.markers) return;

    var bounds = null;
    var self = this;
    this.markers.eachLayer(function (layer) {
      if (layer.getLatLng) {
        var latlng = layer.getLatLng();
        if (bounds) {
          bounds.extend(latlng);
        } else {
          bounds = L.latLngBounds([latlng]);
        }
      }
    });

    if (bounds && bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 });
    }
  };

  MapRenderer.prototype.clearMarkers = function () {
    if (this.markers) this.markers.clearLayers();
  };

  MapRenderer.prototype.destroy = function () {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.markers = null;
      this.tileLayer = null;
    }
  };

  MapRenderer.prototype.invalidateSize = function () {
    if (this.map) this.map.invalidateSize();
  };

  MapRenderer.prototype._isFresh = function (p) {
    if (!p.updated_at) return false;
    var updated = new Date(p.updated_at);
    var now = new Date();
    return (now - updated) < 300000; // 5 minutes
  };

  // ── Export ──────────────────────────────────────────────────────────
  window.MapRenderer = MapRenderer;
})();
