(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./parser-abstraction.js'));
  } else {
    root.MarkicabJsonParser = factory(root.MarkicabParser);
  }
})(typeof self !== 'undefined' ? self : this, function(MarkicabParser) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────
  // JSON Parser — concrete implementation of BaseParser.
  // Accepts raw JSON string (Markicab import schema v1) and
  // produces a canonical Trip object.
  // ─────────────────────────────────────────────────────────────────

  var ParserError = MarkicabParser.ParserError;
  var BaseParser = MarkicabParser.BaseParser;

  class JsonParser extends BaseParser {
    getFormat() {
      return 'json';
    }

    canParse(rawInput) {
      if (typeof rawInput !== 'string') return false;
      var trimmed = rawInput.trim();
      if (!trimmed) return false;
      // Quick heuristic: must start with { or [
      var firstChar = trimmed[0];
      if (firstChar !== '{' && firstChar !== '[') return false;
      // Must contain trip-like markers:
      // - Document format: { schemaVersion, ... "trip": ... }
      // - Bare trip: { "id": ..., "name": ... "start": ... }
      return /schemaVersion|"trip"\s*:|"id"\s*:.*"name"\s*:|"name"\s*:.*"start"\s*:|"id"\s*:.*"start"\s*:/.test(trimmed);
    }

    parse(rawInput) {
      if (typeof rawInput !== 'string') {
        throw new ParserError('JSON input must be a string', null, 'string', typeof rawInput);
      }

      var data;
      try {
        data = JSON.parse(rawInput);
      } catch (e) {
        throw new ParserError('Invalid JSON: ' + e.message, null, 'valid JSON', rawInput.substring(0, 200));
      }

      var trip;
      if (data && data.trip) {
        // Full document format: { schemaVersion, app, trip: {...} }
        trip = this._convertDocument(data);
      } else if (data && (data.id || data.name || data.start)) {
        // Bare trip format: { id, name, start, end, ... }
        trip = this._convertBareTrip(data);
      } else {
        throw new ParserError(
          'JSON does not contain a valid trip object',
          null,
          'object with trip field or trip-level fields (id, name, start, end)',
          Object.keys(data || {}).join(', ')
        );
      }

      // Apply shared semantic validation
      this.validate(trip);
      return trip;
    }

    _convertDocument(doc) {
      var trip = doc.trip;
      if (!trip || typeof trip !== 'object') {
        throw new ParserError('Document.trip must be an object', 'trip', 'object', trip);
      }
      return this._convertBareTrip(trip, doc);
    }

    _convertBareTrip(raw, doc) {
      if (!raw || typeof raw !== 'object') {
        throw new ParserError('Trip must be an object', 'trip', 'object', raw);
      }

      var trip = {
        id: raw.id,
        name: raw.name,
        destination: raw.destination || '',
        start: this._normalizeDate(raw.start),
        end: this._normalizeDate(raw.end),
        note: raw.note || '',
        groupId: raw.groupId || null,
        items: this._convertItems(raw.items),
        expenses: this._convertExpenses(raw.expenses),
        wishlist: this._convertWishlist(raw.wishlist),
        routes: this._convertRoutes(raw.routes),
        gallery: this._convertGallery(raw.gallery),
        members: this._convertMembers(raw.members),
        journey: this._convertJourney(raw.journey),
        metadata: this._convertMetadata(raw.metadata, doc)
      };

      return trip;
    }

    _convertItems(rawItems) {
      if (!Array.isArray(rawItems)) return [];
      return rawItems.map(function(item) {
        if (!item || typeof item !== 'object') return null;
        return {
          id: item.id,
          date: this._normalizeDate(item.date),
          title: item.title,
          time: this._normalizeTime(item.time),
          budget: this._coerceMonetary(item.budget),
          link: this._normalizeLink(item.link),
          note: item.note || '',
          done: item.done === true,
          category: item.category || null,
          lat: item.lat != null ? Number(item.lat) : null,
          lng: item.lng != null ? Number(item.lng) : null,
          arrivalTime: this._normalizeTime(item.arrivalTime),
          departureTime: this._normalizeTime(item.departureTime)
        };
      }.bind(this)).filter(function(item) { return item !== null; });
    }

    _convertExpenses(rawExpenses) {
      if (!Array.isArray(rawExpenses)) return [];
      return rawExpenses.map(function(expense) {
        if (!expense || typeof expense !== 'object') return null;
        return {
          id: expense.id,
          date: this._normalizeDate(expense.date),
          name: expense.name,
          amount: this._coerceMonetary(expense.amount),
          category: expense.category || 'Lainnya',
          note: expense.note || '',
          paidBy: expense.paidBy || null
        };
      }.bind(this)).filter(function(expense) { return expense !== null; });
    }

    _convertWishlist(rawWishlist) {
      if (!Array.isArray(rawWishlist)) return [];
      return rawWishlist.map(function(item) {
        if (!item || typeof item !== 'object') return null;
        return {
          id: item.id,
          title: item.title,
          link: this._normalizeLink(item.link),
          note: item.note || '',
          lat: item.lat != null ? Number(item.lat) : null,
          lng: item.lng != null ? Number(item.lng) : null,
          suggestedBy: item.suggestedBy || null,
          status: item.status || 'suggested'
        };
      }.bind(this)).filter(function(item) { return item !== null; });
    }

    _convertRoutes(rawRoutes) {
      if (!Array.isArray(rawRoutes)) return [];
      return rawRoutes.map(function(route) {
        if (!route || typeof route !== 'object') return null;
        return {
          id: route.id,
          name: route.name,
          waypoints: this._convertWaypoints(route.waypoints)
        };
      }.bind(this)).filter(function(route) { return route !== null; });
    }

    _convertWaypoints(rawWaypoints) {
      if (!Array.isArray(rawWaypoints)) return [];
      return rawWaypoints.map(function(wp) {
        if (!wp || typeof wp !== 'object') return null;
        return {
          id: wp.id,
          name: wp.name,
          sequence: wp.sequence,
          lat: wp.lat != null ? Number(wp.lat) : null,
          lng: wp.lng != null ? Number(wp.lng) : null,
          dayNumber: wp.dayNumber != null ? Number(wp.dayNumber) : null,
          category: wp.category || null,
          arrivalTime: this._normalizeTime(wp.arrivalTime),
          departureTime: this._normalizeTime(wp.departureTime),
          notes: wp.notes || ''
        };
      }.bind(this)).filter(function(wp) { return wp !== null; });
    }

    _convertGallery(rawGallery) {
      if (!Array.isArray(rawGallery)) return [];
      return rawGallery.map(function(item) {
        if (!item || typeof item !== 'object') return null;
        return {
          id: item.id,
          storagePath: item.storagePath || item.storage_path,
          mimeType: item.mimeType || item.mime_type,
          fileSize: item.fileSize || item.file_size,
          width: item.width != null ? Number(item.width) : null,
          height: item.height != null ? Number(item.height) : null,
          caption: item.caption || '',
          uploaderId: item.uploaderId || item.uploader_id || null
        };
      }.bind(this)).filter(function(item) { return item !== null; });
    }

    _convertMembers(rawMembers) {
      if (!Array.isArray(rawMembers)) return [];
      return rawMembers.map(function(member) {
        if (!member || typeof member !== 'object') return null;
        return {
          userId: member.userId || member.user_id,
          displayName: member.displayName || member.display_name,
          role: member.role || 'member',
          isAnonymous: member.isAnonymous === true || member.is_anonymous === true,
          joinedAt: member.joinedAt || member.joined_at || null
        };
      }.bind(this)).filter(function(member) { return member !== null; });
    }

    _convertJourney(rawJourney) {
      if (!rawJourney || typeof rawJourney !== 'object') return null;
      return {
        status: rawJourney.status,
        enabledBy: rawJourney.enabledBy || rawJourney.enabled_by || null,
        startedAt: rawJourney.startedAt || rawJourney.started_at || null,
        endedAt: rawJourney.endedAt || rawJourney.ended_at || null
      };
    }

    _convertMetadata(rawMetadata, doc) {
      var meta = rawMetadata || {};
      return {
        schemaVersion: meta.schemaVersion || (doc && doc.schemaVersion) || '1.0.0',
        app: meta.app || (doc && doc.app) || 'Markicab',
        exportedAt: meta.exportedAt || (doc && doc.exportedAt) || null,
        sourceFormat: meta.sourceFormat || 'json',
        sourceVersion: meta.sourceVersion || null
      };
    }

    _normalizeDate(value) {
      if (!value) return null;
      var str = String(value).trim();
      // Already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
      // Try to parse other formats (DD/MM/YYYY, MM-DD-YYYY, etc.)
      var match = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
      if (match) {
        // Assume DD/MM/YYYY (Indonesian locale)
        var day = match[1].padStart(2, '0');
        var month = match[2].padStart(2, '0');
        var year = match[3];
        return year + '-' + month + '-' + day;
      }
      // ISO datetime — extract date portion
      if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
        return str.substring(0, 10);
      }
      return str;
    }

    _normalizeTime(value) {
      if (!value) return null;
      var str = String(value).trim();
      // Already HH:MM
      if (/^\d{2}:\d{2}$/.test(str)) return str;
      // HH:MM:SS — truncate
      if (/^\d{2}:\d{2}:\d{2}/.test(str)) {
        return str.substring(0, 5);
      }
      // H:MM — pad
      var match = str.match(/^(\d{1,2}):(\d{2})/);
      if (match) {
        return match[1].padStart(2, '0') + ':' + match[2];
      }
      return str;
    }

    _coerceMonetary(value) {
      if (value === undefined || value === null || value === '') return '0';
      var str = String(value);
      if (!/^\d+(\.\d{1,2})?$/.test(str)) return '0';
      return str;
    }

    _normalizeLink(value) {
      var link = (value || '').trim();
      if (!link) return '';
      return /^https?:\/\//i.test(link) ? link : 'https://' + link;
    }
  }

  return JsonParser;
});
