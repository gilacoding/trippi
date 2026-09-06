(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkicabImport = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // ─────────────────────────────────────────────────────────────────
  // Markicab Import Converter
  // Converts a validated import JSON payload (import-schema-v1) into
  // Markicab's internal personal trip data model.
  //
  // The output is indistinguishable from a manually created trip —
  // no extra flags, no _imported markers, no done field on items.
  // ─────────────────────────────────────────────────────────────────

  function normalizeLink(value) {
    var link = (value || '').trim();
    if (!link) return '';
    return /^https?:\/\//i.test(link) ? link : 'https://' + link;
  }

  function coerceBudget(value) {
    if (value === undefined || value === null || value === '') return '0';
    var str = String(value);
    if (!/^\d+(\.\d{1,2})?$/.test(str)) return '0';
    return str;
  }

  function coerceAmount(value) {
    if (value === undefined || value === null || value === '') return '0';
    var str = String(value);
    if (!/^\d+(\.\d{1,2})?$/.test(str)) return '0';
    return str;
  }

  function convertImportItem(item) {
    if (!item || typeof item !== 'object') return null;
    return {
      id: item.id,
      date: item.date || '',
      title: item.title,
      time: item.time || '',
      budget: coerceBudget(item.budget),
      link: normalizeLink(item.link),
      note: item.note || ''
    };
  }

  function convertImportExpense(expense) {
    if (!expense || typeof expense !== 'object') return null;
    return {
      id: expense.id,
      date: expense.date || '',
      name: expense.name,
      amount: coerceAmount(expense.amount),
      category: expense.category || 'Lainnya',
      note: expense.note || ''
    };
  }

  function convertImportToTrip(importTrip) {
    if (!importTrip || typeof importTrip !== 'object') {
      throw new Error('Invalid import trip: expected object');
    }

    var items = Array.isArray(importTrip.items) ? importTrip.items : [];
    var expenses = Array.isArray(importTrip.expenses) ? importTrip.expenses : [];

    return {
      id: importTrip.id,
      name: importTrip.name,
      destination: importTrip.destination || '',
      start: importTrip.start,
      end: importTrip.end,
      note: importTrip.note || '',
      groupId: importTrip.groupId || null,
      items: items.map(convertImportItem).filter(function(item) { return item !== null; }),
      expenses: expenses.map(convertImportExpense).filter(function(exp) { return exp !== null; })
    };
  }

  function convertImportDocument(document) {
    if (!document || typeof document !== 'object') {
      throw new Error('Invalid import document: expected object');
    }
    return convertImportToTrip(document.trip);
  }

  return {
    normalizeLink: normalizeLink,
    coerceBudget: coerceBudget,
    coerceAmount: coerceAmount,
    convertImportItem: convertImportItem,
    convertImportExpense: convertImportExpense,
    convertImportToTrip: convertImportToTrip,
    convertImportDocument: convertImportDocument
  };
});
