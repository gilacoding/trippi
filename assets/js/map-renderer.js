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

  // ── DIAGNOSTIC: Trace map lifecycle ────────────────────────────────
  var _mapLog = [];
  var _allRenderers = []; // Track ALL MapRenderer instances ever created
  function _trace(msg, data) {
    var entry = { t: Date.now(), msg: msg, data: data };
    _mapLog.push(entry);
    console.log('[MAP-TRACE]', msg, data || '');
  }

  // ── MapRenderer ─────────────────────────────────────────────────────
  function MapRenderer(elementId) {
    this.elementId = elementId;
    this.map = null;
    this.markers = null;
    this.tileLayer = null;
    this._initGeneration = 0;
    this._completedGeneration = 0;
    this._capturedEl = null;
    this._destroyed = false;
    this._rendererId = _allRenderers.length;
    _allRenderers.push(this);
    _trace('RENDERER_CREATED', { rendererId: this._rendererId, elementId: this.elementId });
  }

  MapRenderer.prototype.init = function () {
    var self = this;
    
    // Reset destroyed state on re-initialization
    this._destroyed = false;
    
    // POINT 1: Prevent multiple concurrent init() for same container
    if (_activeMaps[this.elementId] && _activeMaps[this.elementId] !== this) {
      _trace('INIT_DESTROY_OLD', { rendererId: this._rendererId, oldRendererId: _activeMaps[this.elementId]._rendererId });
      _activeMaps[this.elementId].destroy();
    }
    _activeMaps[this.elementId] = this;
    
    var myGeneration = ++this._initGeneration;
    _trace('INIT_START', { rendererId: this._rendererId, generation: myGeneration });
    
    return loadLeaflet().then(function (L) {
      // Instrument Draggable AFTER Leaflet is loaded
      _instrumentDraggable(L);
      
      // ABORT: A newer init() has started since this one
      if (myGeneration !== self._initGeneration) {
        _trace('INIT_ABORT_STALE_GENERATION', { rendererId: self._rendererId, myGeneration: myGeneration, current: self._initGeneration });
        return null;
      }
      
      var el = document.getElementById(self.elementId);
      if (!el) {
        _trace('INIT_ABORT_NO_ELEMENT', { rendererId: self._rendererId, elementId: self.elementId });
        return null;
      }
      
      // ABORT: Element is detached from DOM
      if (!document.contains(el)) {
        _trace('INIT_ABORT_DETACHED', { rendererId: self._rendererId, elementId: self.elementId });
        return null;
      }

      // POINT 3: Capture element reference for later verification
      self._capturedEl = el;
      _trace('INIT_CAPTURE_ELEMENT', { rendererId: self._rendererId, elId: el.id });

      var attempts = 0;
      function tryInit() {
        // ABORT: A newer init() has started while we were waiting
        if (myGeneration !== self._initGeneration) {
          _trace('TRY_INIT_ABORT_STALE_GENERATION', { rendererId: self._rendererId, myGeneration: myGeneration, current: self._initGeneration });
          return;
        }
        
        // POINT 3: Re-verify element is still current and attached
        var currentEl = document.getElementById(self.elementId);
        if (!currentEl || currentEl !== self._capturedEl) {
          _trace('TRY_INIT_ABORT_ELEMENT_REPLACED', { 
            rendererId: self._rendererId, 
            capturedId: self._capturedEl ? self._capturedEl.id : null,
            currentId: currentEl ? currentEl.id : null
          });
          return;
        }
        
        attempts++;
        
        // Force reflow BEFORE checking dimensions.
        // Without this, elements recently made visible via display:block
        // or innerHTML replacement will report zero dimensions because
        // the browser hasn't recalculated layout yet.
        document.body.offsetHeight;
        
        // Use getBoundingClientRect() for more reliable dimension detection
        var rect = el.getBoundingClientRect();
        var hasLayout = rect.width > 0 && rect.height > 0;
        
        // Verify the entire parent chain also has layout
        if (hasLayout) {
          var parent = el.parentNode;
          while (parent && parent !== document.body) {
            var parentRect = parent.getBoundingClientRect();
            if (parentRect.width === 0 || parentRect.height === 0) {
              hasLayout = false;
              break;
            }
            parent = parent.parentNode;
          }
        }
        
        if (hasLayout) {
          // POINT 5: Ensure only one Leaflet instance owns this container
          if (_activeMaps[self.elementId] !== self) {
            _trace('TRY_INIT_ABORT_NOT_OWNER', { rendererId: self._rendererId, ownerId: _activeMaps[self.elementId] ? _activeMaps[self.elementId]._rendererId : null });
            return;
          }
          
          // POINT 3 (final): Verify still attached
          if (!document.contains(el)) {
            _trace('TRY_INIT_ABORT_NOW_DETACHED', { rendererId: self._rendererId });
            return;
          }
          
          _trace('CREATE_MAP_ABOUT_TO', { rendererId: self._rendererId, elId: el.id, parentId: el.parentNode ? el.parentNode.id : null, width: rect.width, height: rect.height });
          self._createMap(L, el, myGeneration);
          self._completedGeneration = myGeneration;
          _trace('CREATE_MAP_DONE', { rendererId: self._rendererId, mapExists: !!self.map });
        } else if (attempts < 30) {
          // Wait for layout to settle (tab transition, innerHTML replacement, etc.)
          requestAnimationFrame(tryInit);
        } else {
          // Fallback: force minimum dimensions and try once more
          el.style.width = el.style.width || '100%';
          el.style.height = el.style.height || '280px';
          document.body.offsetHeight;
          if (document.contains(el) && _activeMaps[self.elementId] === self) {
            var fallbackRect = el.getBoundingClientRect();
            if (fallbackRect.width > 0 && fallbackRect.height > 0) {
              self._createMap(L, el, myGeneration);
              self._completedGeneration = myGeneration;
            }
          }
        }
      }
      tryInit();

      return self;
    }).catch(function(e) {
      _trace('INIT_ERROR', { rendererId: self._rendererId, error: e.message });
      throw e;
    });
  };

  MapRenderer.prototype._createMap = function (L, el, myGeneration) {
    var self = this;

    // Final safety check
    var currentEl = document.getElementById(this.elementId);
    if (!currentEl || currentEl !== el || !document.contains(el)) {
      _trace('CREATE_MAP_ABORT_DETACHED', { rendererId: this._rendererId });
      return;
    }
    
    if (_activeMaps[this.elementId] !== this) {
      _trace('CREATE_MAP_ABORT_NOT_OWNER', { rendererId: this._rendererId });
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

    // Force recalc after container becomes visible
    setTimeout(function () { 
      if (!self._destroyed && self.map && self._completedGeneration === myGeneration) {
        self.map.invalidateSize(); 
      }
    }, 100);
    _trace('LEAFLET_MAP_CREATED', { rendererId: this._rendererId });
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
    // Mark as destroyed FIRST to prevent any async callbacks from operating
    this._destroyed = true;
    
    // POINT 4: Invalidate pending initialization
    this._initGeneration++;
    
    _trace('DESTROY', { 
      rendererId: this._rendererId, 
      hadMap: !!this.map,
      capturedElId: this._capturedEl ? this._capturedEl.id : null,
      capturedAttached: this._capturedEl ? document.contains(this._capturedEl) : null
    });
    
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

  // ── Crash diagnostics ──────────────────────────────────────────────
  window._diagnoseMapCrash = function() {
    var crewMapEl = document.getElementById('crewMap');
    var allLeafletContainers = document.querySelectorAll('.leaflet-container');
    var allCrewMapEls = document.querySelectorAll('#crewMap');
    
    return {
      renderers: _allRenderers.map(function(r) {
        return {
          rendererId: r._rendererId,
          elementId: r.elementId,
          hasMap: !!r.map,
          capturedElId: r._capturedEl ? r._capturedEl.id : null,
          capturedAttached: r._capturedEl ? document.contains(r._capturedEl) : null,
          capturedIsCurrent: r._capturedEl === crewMapEl,
          initGeneration: r._initGeneration,
          completedGeneration: r._completedGeneration
        };
      }),
      activeMaps: Object.keys(_activeMaps).map(function(k) {
        return { elementId: k, rendererId: _activeMaps[k]._rendererId };
      }),
      crewMapElement: crewMapEl ? {
        id: crewMapEl.id,
        attached: document.contains(crewMapEl),
        parent: crewMapEl.parentNode ? crewMapEl.parentNode.id : null,
        visible: crewMapEl.offsetWidth > 0 && crewMapEl.offsetHeight > 0
      } : null,
      leafletContainers: allLeafletContainers.length,
      allCrewMapEls: allCrewMapEls.length,
      crewMapCount: document.querySelectorAll('[id=crewMap]').length,
      log: _mapLog.slice(-30)
    };
  };

  // Auto-diagnose on error
  window.addEventListener('error', function(e) {
    if (e.message && e.message.includes('offsetWidth')) {
      console.error('[MAP-CRASH] Diagnosing...', window._diagnoseMapCrash());
    }
  });

  // ── Instrument Leaflet Draggable._onDown ────────────────────────────
  // NOTE: This must run AFTER Leaflet is loaded, not at script load time
  function _instrumentDraggable(L) {
    if (!L || !L.Draggable) return;
    
    // GUARD: Prevent repeated instrumentation wrapping
    if (L.Draggable.prototype._mapicabInstrumented) {
      return;
    }
    L.Draggable.prototype._mapicabInstrumented = true;
    
    var _origDraggableInit = L.Draggable.prototype.initialize;
    L.Draggable.prototype.initialize = function(element, dragStartTarget, preventOutline) {
      this._mapicabElement = element;
      this._mapicabElementId = element ? element.id : null;
      this._mapicabAttached = element ? document.contains(element) : null;
      return _origDraggableInit.apply(this, arguments);
    };

    var _origOnDown = L.Draggable.prototype._onDown;
    L.Draggable.prototype._onDown = function(e) {
      var el = this._mapicabElement || this._element;
      
      // DEFENSE: Skip if element is detached from DOM
      if (!el || !document.contains(el)) {
        return;
      }
      
      return _origOnDown.apply(this, arguments);
    };
  }

  // ── Export ──────────────────────────────────────────────────────────
  window.MapRenderer = MapRenderer;
  window._getMapLog = function() { return _mapLog; };
  window._getAllRenderers = function() { return _allRenderers; };
})();
