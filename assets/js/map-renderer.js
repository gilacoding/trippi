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

  // ── Module-level registry: one MapRenderer per container ─────────
  var _activeMaps = {};

  // ── MapRenderer ─────────────────────────────────────────────────────
  function MapRenderer(elementId) {
    this.elementId = elementId;
    this.map = null;
    this.markers = null;
    this.tileLayer = null;
    this._initGeneration = 0;
    this._completedGeneration = 0;
    this._capturedEl = null; // Element reference captured at init time
  }

  MapRenderer.prototype.init = function () {
    var self = this;
    
    // POINT 1: Prevent multiple concurrent init() for same container
    // If another MapRenderer already owns this container, destroy it first
    if (_activeMaps[this.elementId] && _activeMaps[this.elementId] !== this) {
      _activeMaps[this.elementId].destroy();
    }
    _activeMaps[this.elementId] = this;
    
    var myGeneration = ++this._initGeneration;
    
    return loadLeaflet().then(function (L) {
      // ABORT: A newer init() has started since this one
      if (myGeneration !== self._initGeneration) {
        return null;
      }
      
      // POINT 3: Verify element is still the current attached #crewMap
      var el = document.getElementById(self.elementId);
      if (!el) return null;
      
      // ABORT: Element is detached from DOM
      if (!document.contains(el)) {
        return null;
      }
      
      // Capture element reference for later verification
      self._capturedEl = el;

      // Ensure container has dimensions before Leaflet init
      var attempts = 0;
      function tryInit() {
        // ABORT: A newer init() has started while we were waiting
        if (myGeneration !== self._initGeneration) {
          return;
        }
        
        // POINT 3: Re-verify element is still current and attached
        var currentEl = document.getElementById(self.elementId);
        if (!currentEl || currentEl !== self._capturedEl) {
          // Container was replaced — abort
          return;
        }
        
        attempts++;
        if (el.offsetWidth > 0 && el.offsetHeight > 0) {
          // POINT 5: Ensure only one Leaflet instance owns this container
          if (_activeMaps[self.elementId] !== self) {
            return; // Another MapRenderer took over
          }
          self._createMap(L, el);
          self._completedGeneration = myGeneration;
        } else if (attempts < 20) {
          setTimeout(tryInit, 50);
        } else {
          // Fallback: force minimum dimensions
          el.style.width = el.style.width || '100%';
          el.style.height = el.style.height || '280px';
          if (document.contains(el) && _activeMaps[self.elementId] === self) {
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

    // POINT 3 (final check): Verify element is still current and attached
    var currentEl = document.getElementById(this.elementId);
    if (!currentEl || currentEl !== el || !document.contains(el)) {
      return;
    }
    
    // POINT 5: Ensure only one Leaflet instance owns this container
    if (_activeMaps[this.elementId] !== this) {
      return;
    }

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

    this.map.setView([-2.5, 118], 4);

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
    // POINT 4: Invalidate pending initialization
    // Increment generation so any pending init() aborts
    this._initGeneration++;
    
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.markers = null;
      this.tileLayer = null;
    }
    
    // POINT 5: Remove from registry
    if (_activeMaps[this.elementId] === this) {
      delete _activeMaps[this.elementId];
    }
    
    this._capturedEl = null;
  };

  MapRenderer.prototype.invalidateSize = function () {
    if (this.map) this.map.invalidateSize();
  };

  MapRenderer.prototype._isFresh = function (p) {
    if (!p.updated_at) return false;
    var updated = new Date(p.updated_at);
    var now = new Date();
    return (now - updated) < 300000;
  };

  
  // ── DIAGNOSTIC: Trace map lifecycle ────────────────────────────────
  var _mapLog = [];
  function _trace(msg, data) {
    var entry = { t: Date.now(), msg: msg, data: data };
    _mapLog.push(entry);
    if (window._mapDebug) console.log('[MAP-TRACE]', msg, data || '');
  }
  
  // Wrap _createMap to trace element state
  var _origCreateMap = MapRenderer.prototype._createMap;
  MapRenderer.prototype._createMap = function (L, el) {
    _trace('CREATE_MAP_START', {
      elementId: this.elementId,
      elId: el.id,
      elParent: el.parentNode ? el.parentNode.id : null,
      attached: document.contains(el),
      visible: el.offsetWidth > 0 && el.offsetHeight > 0,
      currentCrewMap: document.getElementById('crewMap') ? document.getElementById('crewMap').id : null,
      sameAsCurrent: document.getElementById('crewMap') === el,
      capturedEl: this._capturedEl ? this._capturedEl.id : null,
      capturedSame: this._capturedEl === el,
      activeMaps: Object.keys(_activeMaps)
    });
    _origCreateMap.call(this, L, el);
    _trace('CREATE_MAP_END', { mapCreated: !!this.map });
  };
  
  // Wrap destroy to trace
  var _origDestroy = MapRenderer.prototype.destroy;
  MapRenderer.prototype.destroy = function () {
    _trace('DESTROY', {
      elementId: this.elementId,
      hadMap: !!this.map,
      capturedEl: this._capturedEl ? this._capturedEl.id : null,
      capturedAttached: this._capturedEl ? document.contains(this._capturedEl) : null
    });
    _origDestroy.call(this);
  };
  
  // Expose for console debugging
  window._getMapLog = function() { return _mapLog; };
  window._mapDebug = true;

  // ── Export ──────────────────────────────────────────────────────────
  window.MapRenderer = MapRenderer;
})();
