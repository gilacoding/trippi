/**
 * MarkiCab Pure Utilities
 * Extracted from trip-planner.html — no behavior change.
 * UMD-style: works as <script> (window.utils), CommonJS (module.exports), or ES module.
 */
(function (root, factory) {
  const utils = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = utils;
  }
  if (typeof window !== 'undefined') {
    window.utils = utils;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.utils = utils;
  }
})(this, function () {
  'use strict';

  /**
   * HTML-escape a value for safe insertion into innerHTML.
   * @param {*} value
   * @returns {string}
   */
  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[c]));
  }

  /**
   * Format a number as Indonesian Rupiah (IDR) currency.
   * @param {*} value
   * @returns {string}
   */
  function money(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  /**
   * Format an ISO date string as "1 Jan 2026" (id-ID).
   * @param {string} value - ISO date (YYYY-MM-DD)
   * @returns {string}
   */
  function dateText(value) {
    if (!value || value === '') return '';
    try {
      return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric'
      }).format(new Date(value + 'T12:00:00'));
    } catch (e) {
      return '';
    }
  }

  /**
   * Normalize a URL: prepend https:// if no scheme present.
   * @param {string} value
   * @returns {string}
   */
  function normalizeLink(value) {
    const link = value.trim();
    if (!link) return '';
    return /^https?:\/\//i.test(link) ? link : 'https://' + link;
  }

  /**
   * Generate an array of ISO dates between start and end (inclusive).
   * @param {string} start - ISO date (YYYY-MM-DD)
   * @param {string} end - ISO date (YYYY-MM-DD)
   * @returns {string[]}
   */
  function daysBetween(start, end) {
    const days = [];
    if (!start || !end) return days;
    let d = new Date(start + 'T12:00:00');
    const last = new Date(end + 'T12:00:00');
    while (d <= last) {
      days.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }

  /**
   * Map expense category to emoji icon.
   * @param {string} category
   * @returns {string}
   */
  function categoryIcon(category) {
    return ({
      'Makan': '🍜', 'Transport': '🚗', 'Hotel': '🛏️',
      'Tiket': '🎟️', 'Belanja': '🛍️', 'Lainnya': '•'
    })[category] || '•';
  }

  /**
   * Check if a name is a placeholder (e.g., "guest", "user", "anonymous").
   * Mirrors public.is_placeholder_name in the database.
   * @param {*} n
   * @returns {boolean}
   */
  function isPlaceholderName(n) {
    if (n === null || n === undefined) return true;
    const PLACEHOLDER_NAMES = [
      'creator', 'owner', 'guest', 'testowner', 'member', 'anggota',
      'kamu', 'user', 'anonymous', 'tanpa nama', 'o', 'm', 'x'
    ];
    const s = String(n).trim();
    if (!s) return true;
    return PLACEHOLDER_NAMES.indexOf(s.toLowerCase()) !== -1;
  }

  /**
   * Humanize a Supabase/auth error message into Indonesian.
   * @param {Error|{message?: string}} e
   * @returns {string}
   */
  function humanErr(e) {
    const m = (e && e.message) || '';
    if (/invalid login/i.test(m) || /email or password/i.test(m)) return 'Email atau password salah.';
    if (/user already registered/i.test(m)) return 'Email sudah terdaftar. Coba masuk.';
    if (/password should be/i.test(m)) return 'Password minimal 6 karakter.';
    if (/unable to validate email/i.test(m)) return 'Format email tidak valid.';
    return m || 'Terjadi kesalahan. Coba lagi.';
  }

  return {
    esc,
    money,
    dateText,
    normalizeLink,
    daysBetween,
    categoryIcon,
    isPlaceholderName,
    humanErr
  };
});
