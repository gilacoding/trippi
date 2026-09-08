/**
 * MarkiCab Import Parser
 * Pure parsing layer — wraps JSONImportParser + lineOfOffset helper.
 * Extracted from trip-planner.html — no behavior change.
 */
(function (root, factory) {
  const parser = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = parser;
  }
  if (typeof window !== 'undefined') {
    window.importParser = parser;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.importParser = parser;
  }
})(this, function () {
  'use strict';

  /**
   * Get the JSONImportParser (loaded via backend/json-import-parser.js).
   * @returns {{parse: function(string): {valid: boolean, errors: string[], canonical: object|null}}}
   */
  function getParser() {
    return (typeof window !== 'undefined' && window.JSONImportParser) ||
           (typeof globalThis !== 'undefined' && globalThis.JSONImportParser) ||
           (typeof require !== 'undefined' ? require('../backend/json-import-parser.js') : null);
  }

  /**
   * Parse arbitrary JSON text into a structured import result.
   * Pure function — no DOM access.
   * @param {string} text - Raw JSON text from import textarea
   * @returns {{valid: boolean, errors: string[], canonical: object|null, preview: {name: string, destination: string, start: string, end: string, itemCount: number, expenseCount: number, wishlistCount: number}|null}}
   */
  function parseImport(text) {
    const JSONImportParser = getParser();
    if (!JSONImportParser) {
      return { valid: false, errors: ['JSONImportParser not loaded'], canonical: null, preview: null };
    }

    let res;
    try {
      res = JSONImportParser.parse(text);
    } catch (e) {
      return { valid: false, errors: [(e && e.message) || String(e)], canonical: null, preview: null };
    }

    if (!res.valid || !res.canonical) {
      return { valid: false, errors: res.errors || ['Unknown parse error'], canonical: null, preview: null };
    }

    const c = res.canonical || {};
    return {
      valid: true,
      errors: [],
      canonical: c,
      preview: {
        name: c.name || '(tanpa nama)',
        destination: c.destination || '',
        start: c.start || '',
        end: c.end || '',
        itemCount: (c.items || []).length,
        expenseCount: (c.expenses || []).length,
        wishlistCount: (c.wishlist || []).length
      }
    };
  }

  /**
   * Calculate line/column from a string offset.
   * Pure helper for error reporting.
   * @param {string} s - Full text
   * @param {number} offset - Character offset into the text
   * @returns {{line: number, col: number}}
   */
  function lineOfOffset(s, offset) {
    const lines = s.substr(0, offset).split('\n');
    return {
      line: lines.length,
      col: (lines[lines.length - 1] || '').length + 1
    };
  }

  return {
    parseImport,
    lineOfOffset
  };
});
