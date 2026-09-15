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
   * Map expense category to an inline SVG icon (Lucide, ISC license).
   * Returns markup with stroke="currentColor" so CSS controls the color.
   * @param {string} category
   * @returns {string}
   */
  var ELLIPSIS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1" /> <circle cx="19" cy="12" r="1" /> <circle cx="5" cy="12" r="1" /></svg>';
  function categoryIcon(category) {
    return ({
      'Makan': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /> <path d="M7 2v20" /> <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" /></svg>',
      'Transport': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /> <circle cx="7" cy="17" r="2" /> <path d="M9 17h6" /> <circle cx="17" cy="17" r="2" /></svg>',
      'Hotel': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" /> <path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" /> <path d="M12 4v6" /> <path d="M2 18h20" /></svg>',
      'Tiket': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /> <path d="M13 5v2" /> <path d="M13 17v2" /> <path d="M13 11v2" /></svg>',
      'Belanja': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 10a4 4 0 0 1-8 0" /> <path d="M3.103 6.034h17.794" /> <path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z" /></svg>',
      'Lainnya': ELLIPSIS
    })[category] || ELLIPSIS;
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
