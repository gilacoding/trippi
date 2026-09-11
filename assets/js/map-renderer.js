/**
 * MarkiCab MapRenderer — real map layer for Journey Mode.
 *
 * One map instance per Journey lifetime. Data changes update markers only.
 * Never rebuild the map DOM. Never destroy the map on tab switch or state change.
 *
 * Public API:
 *   map.init()
 *   map.setMarkers(points[])
 *   map.fitToMarkers()
 *   map.clearMarkers()
 *   map.invalidateSize()
 *   map.destroy()   — call ONLY when Journey view is fully torn down
 */
(function () {
  'use strict';

  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    return new Promise(function (resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
      var script = document.createElement('script');
      script.src = LEAFLET_JS;
      script.onload = function () { resolve(window.L); };
      script.onerror = function () { reject(new Error('Failed to load Leaflet')); };
      document.head.appendChild(script);
    });
  }

  // ── MapRenderer ─────────────────────────────────────────────
  function MapRenderer(elementId) {
    this.elementId = elementId;
    this.map = null;
    this.markers = null;
    this.tileLayer = null;
    this._destroyed = false;
  }

  MapRenderer.prototype.init = function () {
    var self = this;
    return loadLeaflet().then(function (L) {
      var el = document.getElementById(self.elementId);
      if (!el || !document.contains(el)) return null;
      if (self.map) return self;  // already initialized
      self.map = L.map(el, {
        zoomControl: true,
        attributionControl: true,
        minZoom: 3,
        maxZoom: 18
      });
      self.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
      }).addTo(self.map);
      self.markers = L.layerGroup().addTo(self.map);
      self.map.setView([-2.5, 118], 4);
      // Defer invalidateSize to allow layout settle
      setTimeout(function () { self.map.invalidateSize(); }, 200);
      return self;
    }).catch(function (e) {
      throw e;
    });
  };

  MapRenderer.prototype.setMarkers = function (points) {
    if (!this.map || !this.markers) return;
    this.markers.clearLayers();
    if (!points || !points.length) return;
    var self = this;
    points.forEach(function (p) {
      var isFresh = self._isFresh(p);
      var color = isFresh ? '#FA6900' : '#8B8682';
      var name = p.name || (p.user_id ? p.user_id.slice(0, 8) : '');
      if (typeof p.dist_m === 'number') {
        name += ' · ' + (p.dist_m < 1000 ? p.dist_m + ' m' : (p.dist_m / 1000).toFixed(1) + ' km');
      }
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
    this.markers.eachLayer(function (layer) {
      if (layer.getLatLng) {
        var latlng = layer.getLatLng();
        bounds = bounds ? bounds.extend(latlng) : L.latLngBounds([latlng]);
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
    if (this._destroyed) return;
    this._destroyed = true;
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
    return (Date.now() - updated.getTime()) < 300000;
  };

  // ── Export ──────────────────────────────────────────────────
  window.MapRenderer = MapRenderer;
})();
