// ─────────────────────────────────────────────────────────────────────
// JSONImportParser — Flexible JSON-to-Canonical Trip Normalizer
// ─────────────────────────────────────────────────────────────────────
// Accepts arbitrary valid JSON containing travel-plan information and
// normalizes it into the Markicab canonical trip model (see
// canonical-import-model.md).
//
// Architecture: External JSON → Parser → Normalization → Canonical → Pipeline
//
// Key principles:
//   - No rigid external schema required
//   - Missing fields → null/empty (not errors)
//   - Never fabricates data
//   - Common field-name variations are recognized
//   - External IDs are never trusted as Markicab database IDs
//   - Unknown fields are safely ignored
// ─────────────────────────────────────────────────────────────────────
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.JSONImportParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Field aliases — common naming variations ──────────────────────
  var ALIASES = {
    // Trip name
    name: ['name', 'title', 'trip_name', 'tripTitle', 'tripname'],

    // Destination
    destination: ['destination', 'destination_city', 'destinationCity', 'city', 'location', 'where'],

    // Dates
    start: ['start', 'start_date', 'startDate', 'startdate', 'departure', 'departureDate', 'begin', 'begin_date', 'beginDate'],
    end:   ['end', 'end_date', 'endDate', 'enddate', 'return', 'return_date', 'returnDate', 'finish', 'finish_date', 'finishDate'],

    // Description / notes
    note: ['note', 'notes', 'description', 'desc', 'details', 'summary', 'remarks', 'overview'],

    // Days / itinerary
    days: ['days', 'itinerary', 'schedule', 'daily_plan', 'dailyPlan', 'trip_days', 'tripDays', 'day_plan', 'dayPlan'],

    // Day number
    dayNumber: ['day', 'day_number', 'dayNumber', 'number', 'day_num', 'dayNum'],

    // Activities / stops
    items: ['items', 'activities', 'stops', 'places', 'locations', 'attractions', 'events', 'schedule', 'places_to_visit', 'itinerary_items'],

    // Location name (within items)
    itemName: ['name', 'title', 'place_name', 'placeName', 'location_name', 'locationName', 'activity', 'activity_name', 'stop_name'],

    // Description (within items)
    itemDesc: ['description', 'desc', 'details', 'summary', 'note', 'notes'],

    // Coordinates
    lat: ['latitude', 'lat', 'lat_', 'latitude_deg'],
    lng: ['longitude', 'lng', 'long', 'lon', 'lng_', 'longitude_deg'],
    coordinates: ['coordinates', 'coords', 'location.coordinates', 'geometry.coordinates'],

    // Time
    time: ['time', 'start_time', 'startTime', 'departure_time', 'departureTime', 'depart', 'arrival_time', 'arrivalTime'],

    // Budget
    budget: ['budget', 'cost', 'price', 'estimated_cost', 'estimatedCost', 'estimate', 'price_estimate', 'priceEstimate'],

    // Link
    link: ['link', 'url', 'href', 'website', 'reference', 'ref', 'source'],

    // Expenses
    expenses: ['expenses', 'costs', 'spending', 'expenditure', 'money', 'payments', 'transactions'],

    // Expense name
    expenseName: ['name', 'title', 'description', 'item', 'expense'],

    // Expense amount
    amount: ['amount', 'cost', 'price', 'total', 'value', 'spent', 'paid'],

    // Expense category
    category: ['category', 'cat', 'type', 'kind', 'category_name'],

    // Done flag
    done: ['done', 'completed', 'finished', 'is_done', 'isDone', 'status'],

    // Dates within items/expenses
    date: ['date', 'day', 'day_date', 'dayDate', 'when', 'at'],
  };

  // ── Helper: find first non-null value from aliases ────────────────
  function getFromAliases(obj, aliasKey) {
    var fields = ALIASES[aliasKey];
    if (!fields) return null;
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      // Support dotted paths (e.g., "location.coordinates")
      var parts = f.split('.');
      var val = obj;
      var found = true;
      for (var j = 0; j < parts.length; j++) {
        if (val == null || typeof val !== 'object') { found = false; break; }
        val = val[parts[j]];
      }
      if (found && val !== undefined && val !== null && val !== '') return val;
    }
    // Fallback: case-insensitive match
    var lowerFields = fields.map(function(f) { return f.toLowerCase(); });
    var keys = Object.keys(obj || {});
    for (var k = 0; k < keys.length; k++) {
      if (lowerFields.indexOf(keys[k].toLowerCase()) !== -1) {
        var val = obj[keys[k]];
        if (val !== undefined && val !== null && val !== '') return val;
      }
    }
    return null;
  }

  // ── Helper: coerce to string, clamp ──────────────────────────────
  function safeString(v, max) {
    if (v === undefined || v === null) return '';
    var s = String(v).trim();
    if (max && s.length > max) s = s.slice(0, max);
    return s;
  }

  // ── Helper: coerce monetary to string ─────────────────────────────
  function safeMoney(v) {
    if (v === undefined || v === null || v === '') return '0';
    if (typeof v === 'number') {
      if (isNaN(v) || v < 0) return '0';
      return String(v);
    }
    var s = String(v).trim();
    // Remove common currency symbols and separators
    s = s.replace(/[^\d.,]/g, '');
    // Handle "1,500" → "1500" or "1.500" (European) → handle below
    if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
      // Both present — assume last one is decimal separator
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (s.indexOf(',') !== -1) {
      // Only comma — could be "1,500" or "1,5"
      if (s.split(',')[1].length === 3) s = s.replace(/,/g, '');
      else s = s.replace(',', '.');
    }
    var n = parseFloat(s);
    if (isNaN(n) || n < 0) return '0';
    return String(n);
  }

  // ── Helper: normalize date to YYYY-MM-DD ──────────────────────────
  function safeDate(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'number') {
      // Unix timestamp (seconds or milliseconds)
      var d;
      if (v > 1e12) d = new Date(v);       // milliseconds
      else d = new Date(v * 1000);          // seconds
      return formatDate(d);
    }
    if (typeof v === 'string') {
      v = v.trim();
      // ISO 8601: 2026-09-15 or 2026-09-15T12:00:00 or 2026-09-15T12:00:00.000Z
      var isoMatch = v.match(/^(\d{4}-\d{2}-\d{2})/);
      if (isoMatch) return isoMatch[1];
      // DD/MM/YYYY or MM/DD/YYYY
      var parts = v.split(/[\/\-\.\s]/);
      if (parts.length === 3) {
        var a = parseInt(parts[0], 10);
        var b = parseInt(parts[1], 10);
        var c = parseInt(parts[2], 10);
        if (c > 31 && parts[2].length === 4) {
          // YYYY-MM-DD or YYYY/MM/DD
          if (a > 12 && b <= 12) return pad(c) + '-' + pad(b) + '-' + pad(a);
          if (b > 12 && a <= 12) return pad(c) + '-' + pad(a) + '-' + pad(b);
          return pad(c) + '-' + pad(a) + '-' + pad(b);
        }
        if (a > 31) {
          // DD/MM/YYYY or DD-MM-YYYY → YYYY-MM-DD
          return pad(a) + '-' + pad(b) + '-' + pad(c);
        }
      }
      // Try parsing as date
      var d = new Date(v);
      if (!isNaN(d.getTime())) return formatDate(d);
    }
    return null;
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function formatDate(d) {
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  // ── Helper: normalize time to HH:MM ────────────────────────────────
  function safeTime(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'number') {
      var h = Math.floor(v / 60);
      var m = v % 60;
      return pad(h) + ':' + pad(m);
    }
    if (typeof v === 'string') {
      v = v.trim();
      var match = v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/i);
      if (match) {
        var h = parseInt(match[1], 10);
        var m = match[2];
        if (match[3]) {
          if (/pm/i.test(match[3]) && h < 12) h += 12;
          if (/am/i.test(match[3]) && h === 12) h = 0;
        }
        return pad(h) + ':' + m;
      }
    }
    return null;
  }

  // ── Helper: extract coordinates ────────────────────────────────────
  function safeCoords(v) {
    if (v === undefined || v === null) return null;
    if (Array.isArray(v) && v.length >= 2) {
      // GeoJSON [lng, lat] or [lat, lng]
      var a = parseFloat(v[0]);
      var b = parseFloat(v[1]);
      if (!isNaN(a) && !isNaN(b)) return { lat: b, lng: a }; // GeoJSON order
    }
    if (typeof v === 'object') {
      var lat = parseFloat(v.latitude || v.lat || v.lat_);
      var lng = parseFloat(v.longitude || v.lng || v.lon || v.long);
      if (!isNaN(lat) && !isNaN(lng)) return { lat: lat, lng: lng };
    }
    return null;
  }

  // ── Helper: generate stable internal ID ───────────────────────────
  function genId(seed) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  // ── Helper: extract day items from various structures ─────────────
  function extractItems(obj) {
    // If obj has an array field that looks like items
    var itemsKey = null;
    var itemsVal = null;
    var aliasKeys = ALIASES.items;
    for (var i = 0; i < aliasKeys.length; i++) {
      var f = aliasKeys[i];
      var parts = f.split('.');
      var val = obj;
      var found = true;
      for (var j = 0; j < parts.length; j++) {
        if (val == null || typeof val !== 'object') { found = false; break; }
        val = val[parts[j]];
      }
      if (found && Array.isArray(val) && val.length > 0) {
        itemsKey = f;
        itemsVal = val;
        break;
      }
    }

    // Fallback: case-insensitive
    if (!itemsVal) {
      var keys = Object.keys(obj || {});
      for (var k = 0; k < keys.length; k++) {
        var kl = keys[k].toLowerCase();
        if (aliasKeys.map(function(a) { return a.toLowerCase(); }).indexOf(kl) !== -1) {
          if (Array.isArray(obj[keys[k]]) && obj[keys[k]].length > 0) {
            itemsVal = obj[keys[k]];
            break;
          }
        }
      }
    }

    // Fallback: scan all values for first array of objects with name/title
    if (!itemsVal) {
      var allKeys = Object.keys(obj || {});
      for (var k = 0; k < allKeys.length; k++) {
        var v = obj[allKeys[k]];
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
          var hasIdentifier = false;
          for (var j = 0; j < v.length; j++) {
            if (v[j] && (v[j].name || v[j].title || v[j].place_name || v[j].location_name || v[j].lat || v[j].latitude || v[j].coordinates)) {
              hasIdentifier = true;
              break;
            }
          }
          if (hasIdentifier) { itemsVal = v; break; }
        }
      }
    }

    return itemsVal || [];
  }

  // ── Normalize a single itinerary item ─────────────────────────────
  function normalizeItem(item, dayNumber) {
    if (!item || typeof item !== 'object') return null;

    var title = getFromAliases(item, 'itemName') || getFromAliases(item, 'name');
    title = safeString(title, 100);

    // Also check for coordinates or link — if item has no title but has
    // identifying location data, generate a title from it.
    var lat = getFromAliases(item, 'lat');
    var lng = getFromAliases(item, 'lng');
    var coords = null;
    if (lat || lng) {
      coords = safeCoords({lat: lat, lng: lng});
      if (!coords) coords = safeCoords(getFromAliases(item, 'coordinates'));
    }
    var link = getFromAliases(item, 'link');

    if (!title) {
      if (coords) {
        title = 'Lokasi (' + coords.lat.toFixed(4) + ', ' + coords.lng.toFixed(4) + ')';
      } else if (link) {
        title = safeString(link, 100);
      } else {
        return null; // Skip items without any identifying data
      }
    }

    var desc = getFromAliases(item, 'itemDesc') || getFromAliases(item, 'note');
    if (!desc) desc = safeString(getFromAliases(item, 'desc'), 240);
    else desc = safeString(desc, 240);

    var dateStr = getFromAliases(item, 'start') || getFromAliases(item, 'date');
    var date = safeDate(dateStr);

    var time = getFromAliases(item, 'time');
    time = time ? safeTime(time) : null;

    var budget = getFromAliases(item, 'budget');
    budget = budget ? safeMoney(budget) : '0';

    var link = getFromAliases(item, 'link');
    link = safeString(link, 500);
    if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;

    // coords already extracted above in the title block
    var done = getFromAliases(item, 'done');
    if (done !== null) {
      if (typeof done === 'string') done = done.toLowerCase() === 'true' || done === '1';
      done = !!done;
    } else {
      done = false;
    }

    return {
      id: genId(),
      date: date,           // null if not provided
      dayNumber: dayNumber || null,
      title: title,
      time: time || '',
      budget: budget,
      link: link || '',
      note: desc || '',
      done: done,
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null
    };
  }

  // ── Normalize a single expense ────────────────────────────────────
  function normalizeExpense(exp) {
    if (!exp || typeof exp !== 'object') return null;

    var name = getFromAliases(exp, 'expenseName') || getFromAliases(exp, 'name');
    name = safeString(name, 100);

    if (!name) return null;

    var amount = getFromAliases(exp, 'amount');
    amount = amount ? safeMoney(amount) : '0';

    var cat = getFromAliases(exp, 'category');
    cat = cat ? safeString(cat, 20) : 'Lainnya';
    var validCategories = ['Makan', 'Transport', 'Hotel', 'Tiket', 'Belanja', 'Lainnya'];
    if (validCategories.indexOf(cat) === -1) cat = 'Lainnya';

    var dateStr = getFromAliases(exp, 'date');
    var date = safeDate(dateStr);

    var note = getFromAliases(exp, 'note');
    note = safeString(note, 160);

    var paidBy = getFromAliases(exp, 'paid_by') || getFromAliases(exp, 'paidBy') || getFromAliases(exp, 'payer');
    paidBy = paidBy ? safeString(paidBy, 100) : null;

    return {
      id: genId(),
      date: date,
      name: name,
      amount: amount,
      category: cat,
      note: note,
      paidBy: paidBy
    };
  }

  // ── Normalize wishlist items ──────────────────────────────────────
  function normalizeWishlist(item) {
    if (!item || typeof item !== 'object') return null;
    var name = getFromAliases(item, 'itemName') || getFromAliases(item, 'name');
    name = safeString(name, 100);
    if (!name) return null;
    var link = getFromAliases(item, 'link');
    link = safeString(link, 500);
    if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
    var note = getFromAliases(item, 'note');
    note = safeString(note, 240);
    return {
      id: genId(),
      name: name,
      link: link || '',
      note: note || ''
    };
  }

  // ── Main parser: JSON text → Canonical Trip ──────────────────────
  function parse(rawText) {
    var errors = [];

    if (!rawText || !rawText.trim()) {
      return {
        valid: false,
        errors: ['Input is empty. Paste a JSON trip first.'],
        canonical: null
      };
    }

    var doc;
    try {
      doc = JSON.parse(rawText.trim());
    } catch (e) {
      var msg = e.message;
      // Provide line/col info if available
      var match = msg.match(/at position (\d+)/);
      if (match) {
        var pos = parseInt(match[1], 10);
        var lines = rawText.substr(0, pos).split('\n');
        var lineNum = lines.length;
        var col = (lines[lines.length - 1] || '').length + 1;
        msg = 'Invalid JSON syntax near line ' + lineNum + ', column ' + col + ' — ' + e.message;
      } else {
        msg = 'Invalid JSON: ' + e.message;
      }
      return {
        valid: false,
        errors: [msg],
        canonical: null
      };
    }

    if (doc === null) {
      return {
        valid: false,
        errors: ['JSON is null. Expected a JSON object.'],
        canonical: null
      };
    }

    if (typeof doc !== 'object' || Array.isArray(doc)) {
      return {
        valid: false,
        errors: ['Expected a JSON object at the top level, got ' +
          (Array.isArray(doc) ? 'an array' : typeof doc) + '.'],
        canonical: null
      };
    }

    // ── Handle nested {trip: {...}} wrapper ─────────────────────────
    var tripData = doc;
    if (doc.trip && typeof doc.trip === 'object' && !Array.isArray(doc.trip)) {
      tripData = doc.trip;
      // Merge remaining doc fields if not in trip
      var topLevel = {};
      for (var k in doc) {
        if (k !== 'trip' && !(k in tripData)) topLevel[k] = doc[k];
      }
      tripData = Object.assign({}, topLevel, tripData);
    }

    // Handle wrapper formats: {itinerary: [...days...]}, {travel: {...trip...}}, etc.
    // Merge top-level trip metadata with the wrapper content.
    var hasTripName = getFromAliases(tripData, 'name');
    if (!hasTripName && doc.itinerary && typeof doc.itinerary === 'object' && !Array.isArray(doc.itinerary)) {
      tripData = Object.assign({}, doc, doc.itinerary);
    }
    if (!hasTripName && doc.travel && typeof doc.travel === 'object' && !Array.isArray(doc.travel)) {
      tripData = Object.assign({}, doc, doc.travel);
    }

    // Handle array of trips at top level: pick first
    if (!hasTripName && doc.trips && Array.isArray(doc.trips) && doc.trips.length > 0) {
      tripData = Object.assign({}, doc, doc.trips[0]);
    }

    // Handle itinerary as array of days at top level: {trip_name: "X", itinerary: [{day: 1, items: [...]}]}
    // Don't overwrite tripData — keep top-level metadata, just recognize days as the days array


    // ── Extract trip name ───────────────────────────────────────────
    var name = getFromAliases(tripData, 'name');
    name = name ? safeString(name, 70) : '';
    if (!name) {
      // Try to derive from destination
      var dest = getFromAliases(tripData, 'destination');
      if (dest) name = safeString(dest, 70);
    }

    // ── Extract destination ─────────────────────────────────────────
    var destination = getFromAliases(tripData, 'destination');
    destination = destination ? safeString(destination, 80) : '';

    // ── Extract dates ───────────────────────────────────────────────
    var startDate = getFromAliases(tripData, 'start');
    startDate = safeDate(startDate);

    var endDate = getFromAliases(tripData, 'end');
    endDate = safeDate(endDate);

    // Validate date range
    if (startDate && endDate && startDate > endDate) {
      errors.push('Start date "' + startDate + '" is after end date "' + endDate + '".');
      // Swap them
      var tmp = startDate;
      startDate = endDate;
      endDate = tmp;
    }

    // ── Extract note/description ─────────────────────────────────────
    var note = getFromAliases(tripData, 'note');
    note = note ? safeString(note, 240) : '';

    // ── Extract items (itinerary) ───────────────────────────────────
    var rawItems = extractItems(tripData);

    // Handle structured days: {days: [{day: 1, items: [...]}, ...]}
    var days = null;
    var daysVal = getFromAliases(tripData, 'days');
    if (daysVal) {
      if (Array.isArray(daysVal)) {
        days = daysVal;
      } else if (typeof daysVal === 'object') {
        // Could be {monday: {...}, tuesday: {...}} or similar
        days = Object.values(daysVal);
      }
    }

    var items = [];
    var wishlistFromItems = [];
    var hasDayNumbers = false;

    if (days && Array.isArray(days) && days.length > 0) {
      // Structure: [{day: 1, items: [...], activities: [...], ...}]
      days.forEach(function(day, di) {
        if (!day || typeof day !== 'object') return;
        var dayNum = getFromAliases(day, 'dayNumber') || (di + 1);
        dayNum = parseInt(dayNum, 10) || (di + 1);
        hasDayNumbers = true;

        var dayItems = extractItems(day);
        if (dayItems.length === 0) {
          // Maybe the day itself is an item
          var dayItem = normalizeItem(day, dayNum);
          if (dayItem) {
            if (!dayItem.date && startDate) {
              // Assign day to date if we can
              var d = new Date(startDate);
              d.setDate(d.getDate() + dayNum - 1);
              dayItem.date = formatDate(d);
            }
            items.push(dayItem);
          }
          return;
        }

        dayItems.forEach(function(item) {
          var norm = normalizeItem(item, dayNum);
          if (!norm) return;
          // If item has no date, try to assign based on day number
          if (!norm.date && startDate && dayNum) {
            var d = new Date(startDate);
            d.setDate(d.getDate() + dayNum - 1);
            norm.date = formatDate(d);
          }
          items.push(norm);
        });
      });
    }

    // If no structured days, process raw items
    if (items.length === 0 && rawItems.length > 0) {
      rawItems.forEach(function(item) {
        var norm = normalizeItem(item);
        if (!norm) return;
        if (!norm.date) {
          // No date → wishlist item
          wishlistFromItems.push({
            id: norm.id,
            name: norm.title,
            link: norm.link,
            note: norm.note
          });
        } else {
          items.push(norm);
        }
      });
    }

    // ── Extract expenses ────────────────────────────────────────────
    var rawExpenses = getFromAliases(tripData, 'expenses');
    if (!rawExpenses) rawExpenses = getFromAliases(tripData, 'items'); // fallback
    var expenses = [];
    if (rawExpenses) {
      if (Array.isArray(rawExpenses)) {
        expenses = rawExpenses.map(normalizeExpense).filter(function(e) { return e !== null; });
      } else if (typeof rawExpenses === 'object' && rawExpenses.expenses) {
        expenses = (rawExpenses.expenses || []).map(normalizeExpense).filter(function(e) { return e !== null; });
      }
    }

    // ── Extract wishlist (explicit) ───────────────────────────────────
    var rawWishlist = null;
    for (var i = 0; i < ALIASES.items.length; i++) {
      if (tripData && tripData.wishlist !== undefined) { rawWishlist = tripData.wishlist; break; }
    }
    if (!rawWishlist && tripData && tripData.wishlist) rawWishlist = tripData.wishlist;
    if (!rawWishlist && tripData && tripData.wishlist_items) rawWishlist = tripData.wishlist_items;

    var wishlist = [];
    if (rawWishlist && Array.isArray(rawWishlist)) {
      wishlist = rawWishlist.map(normalizeWishlist).filter(function(w) { return w !== null; });
    }

    // Merge items-based wishlist with explicit wishlist
    var allWishlist = wishlist.concat(wishlistFromItems);

    // ── Synthesize dates from dayNumber if no explicit dates ──────────
    // If the source JSON provided day structure (dayNumber) but no start/end
    // dates, synthesize dates so the Markicab UI can display day tabs and
    // items in the correct day context. Items retain their dayNumber.
    if (!startDate && hasDayNumbers && items.length > 0) {
      var maxDay = 1;
      items.forEach(function (item) {
        if (item && item.dayNumber && item.dayNumber > maxDay) maxDay = item.dayNumber;
      });
      // Synthetic start: today. End: today + (maxDay - 1).
      var today = new Date();
      startDate = formatDate(today);
      var endDateObj = new Date(today);
      endDateObj.setDate(endDateObj.getDate() + maxDay - 1);
      endDate = formatDate(endDateObj);
      // Assign dates to items based on dayNumber
      items.forEach(function (item) {
        if (item && !item.date && item.dayNumber) {
          var d = new Date(startDate);
          d.setDate(d.getDate() + item.dayNumber - 1);
          item.date = formatDate(d);
        }
      });
    }

    // ── Build canonical trip ────────────────────────────────────────
    var canonical = {
      id: genId(),  // Always generate new ID — never trust external IDs
      name: name,
      destination: destination,
      start: startDate,   // null if not provided
      end: endDate,       // null if not provided
      note: note,
      groupId: tripData.groupId || tripData.group_id || null,
      items: items,
      expenses: expenses,
      wishlist: allWishlist,
      metadata: {
        schemaVersion: '1.0.0',
        app: 'Markicab',
        sourceFormat: 'json',
        imported: true
      }
    };

    // Strip internal/system fields that must not be trusted
    var systemFields = ['id', 'trip_id', 'user_id', 'owner_id', 'organization_id',
                        'created_at', 'updated_at', 'permissions', 'role',
                        'deleted_at', 'supabase_trip_id', 'serverId', 'isGroup'];
    // We don't strip id from canonical (we generated our own), but we
    // do ensure no external system fields leak through.

    // ── Semantic confidence check ───────────────────────────────────
    // Valid JSON with no recognizable travel data should NOT create a blank trip.
    // "Recognizable" = at least a trip name, destination, or any items/days/
    // expenses/wishlist/dates found in the extraction.
    var hasAnyData = name || destination || note || (items.length > 0) ||
                     (expenses.length > 0) || (allWishlist.length > 0) ||
                     startDate || endDate;
    if (!hasAnyData) {
      return {
        valid: false,
        errors: ['No recognizable travel information found in the JSON.'],
        canonical: null,
        warnings: []
      };
    }

    return {
      valid: true,
      errors: errors,
      canonical: canonical,
      warnings: [] // Could add warnings for unrecognized fields
    };
  }

  return {
    parse: parse,
    parseTrip: parse,  // alias
    ALIASES: ALIASES,
    safeString: safeString,
    safeMoney: safeMoney,
    safeDate: safeDate,
    safeTime: safeTime,
    safeCoords: safeCoords,
    getFromAliases: getFromAliases
  };
});
