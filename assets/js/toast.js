/**
 * MarkiCab Toast — Sonner-inspired, dependency-free.
 * window.mcToast(msg, type) → non-blocking ink pill, bottom-center, auto-dismiss.
 * Loaded via inline head script in trip-planner.html. If it ever fails to load,
 * the shim detects window.mcToast missing and the page keeps native alert().
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.mcToast = mod;
  if (typeof globalThis !== 'undefined') globalThis.mcToast = mod;
})(this, function () {
  'use strict';
  var HOST_ID = 'mcToastHost';
  var CSS_ID = 'mcToastCss';
  var MAX_VISIBLE = 3;
  var TTL_OK = 2600, TTL_ERR = 4200;

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return true;
    var el = document.createElement('style');
    el.id = CSS_ID;
    el.textContent =
      '#mcToastHost{position:fixed;left:0;right:0;bottom:24px;z-index:9998;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}'
      + '.mc-toast{display:inline-flex;align-items:center;gap:9px;background:#1A1A1A;color:#fff;font-family:Outfit,system-ui,sans-serif;font-size:13.5px;font-weight:500;line-height:1.4;padding:11px 16px;border-radius:12px;box-shadow:0 10px 26px rgba(26,26,26,.28);max-width:min(92vw,420px);pointer-events:auto;animation:mc-toast-in .22s ease}'
      + '.mc-toast.out{animation:mc-toast-out .18s ease forwards}'
      + '.mc-toast::before{content:"";width:7px;height:7px;border-radius:50%;background:#2E7D32;flex:0 0 auto}'
      + '.mc-toast.err::before{background:#C62828}'
      + '.mc-toast.info::before{background:#FBC02D}'
      + '@keyframes mc-toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}'
      + '@keyframes mc-toast-out{to{opacity:0;transform:translateY(6px)}}'
      + '@media (prefers-reduced-motion:reduce){.mc-toast,.mc-toast.out{animation:none}}';
    (document.head || document.documentElement).appendChild(el);
    return true;
  }
  ensureCss();

  function host() {
    var h = document.getElementById(HOST_ID);
    if (!h) {
      h = document.createElement('div');
      h.id = HOST_ID;
      document.body.appendChild(h);
    }
    return h;
  }

  function show(msg, type) {
    type = type === 'err' ? 'err' : type === 'info' ? 'info' : 'ok';
    var h = host();
    while (h.children.length >= MAX_VISIBLE) h.removeChild(h.firstChild);
    var el = document.createElement('div');
    el.className = 'mc-toast ' + (type === 'err' ? 'err' : type === 'info' ? 'info' : '');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', type === 'err' ? 'assertive' : 'polite');
    el.textContent = String(msg == null ? '' : msg);
    h.appendChild(el);
    var t = setTimeout(remove, type === 'err' ? TTL_ERR : TTL_OK);
    el.addEventListener('click', function () { clearTimeout(t); remove(); });
    function remove() {
      if (!el.isConnected) return;
      el.classList.add('out');
      setTimeout(function () { if (el.isConnected) el.remove(); }, 200);
    }
    return el;
  }

  return show;
});
