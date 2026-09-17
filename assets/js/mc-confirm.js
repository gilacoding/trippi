/**
 * MarkiCab Confirm Dialog — dependency-free, Sonner-inspired visual language.
 * window.mcConfirm(msg) → Promise<boolean>. Esc/backdrop = cancel.
 * Self-contained CSS; if this module fails to load, callers fall back to native
 * confirm() via the guarded helper in trip-planner.html.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') { window.mcConfirm = mod; window.mcConfirmImpl = mod; }
  if (typeof globalThis !== 'undefined') globalThis.mcConfirm = mod;
})(this, function () {
  'use strict';
  var HOST_ID = 'mcConfirmHost';
  var CSS_ID = 'mcConfirmCss';
  var CSS =
    '#mcConfirmHost{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(8,10,15,.55);animation:mcCf-fade .16s ease}' +
    '.mc-confirm{background:#FFFFFF;border:1px solid var(--line,#E0DBD5);border-radius:18px;box-shadow:0 18px 44px rgba(26,26,26,.22);max-width:360px;width:100%;padding:22px;font-family:Outfit,system-ui,sans-serif;animation:mcCf-in .18s ease}' +
    '.mc-confirm .mc-cf-title{font-family:Poppins,system-ui,sans-serif;font-weight:700;font-size:16px;color:#1A1A1A;margin:0 0 10px;line-height:1.35}' +
    '.mc-confirm .mc-cf-body{font-size:14px;color:#5C5856;line-height:1.55;margin:0 0 20px;white-space:pre-line}' +
    '.mc-confirm .mc-cf-actions{display:flex;gap:10px;justify-content:flex-end}' +
    '.mc-confirm .mc-cf-btn{font-family:Outfit,system-ui,sans-serif;font-weight:600;font-size:14px;padding:10px 18px;border-radius:11px;cursor:pointer;min-height:44px;min-width:88px;transition:filter .15s,background .15s}' +
    '.mc-confirm .mc-cf-cancel{background:#F5F5DC;color:#1A1A1A;border:1px solid var(--line,#E0DBD5)}' +
    '.mc-confirm .mc-cf-cancel:hover{background:#E0E4CC}' +
    '.mc-confirm .mc-cf-ok{background:#C62828;color:#fff;border:0}' +
    '.mc-confirm .mc-cf-ok:hover{filter:brightness(1.08)}' +
    '.mc-confirm .mc-cf-ok.mc-cf-neutral{background:#FA6900}' +
    '@media (prefers-reduced-motion:reduce){#mcConfirmHost{animation:none}.mc-confirm{animation:none}}' +
    '@keyframes mcCf-fade{from{opacity:0}to{opacity:1}}' +
    '@keyframes mcCf-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}';

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var el = document.createElement('style');
    el.id = CSS_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  function host() {
    var h = document.getElementById(HOST_ID);
    if (!h) {
      h = document.createElement('div');
      h.id = HOST_ID;
      document.body.appendChild(h);
    }
    return h;
  }

  /**
   * Show confirm dialog. Returns Promise<boolean> (true = user confirmed).
   * opts: { title, okLabel, cancelLabel, okTone: 'danger' | 'neutral' }
   */
  function confirmDialog(msg, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      ensureCss();
      var h = host();

      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;';
      var card = document.createElement('div');
      card.className = 'mc-confirm';
      card.setAttribute('role', 'alertdialog');
      card.setAttribute('aria-modal', 'true');

      if (opts.title) {
        var t = document.createElement('h3');
        t.className = 'mc-cf-title';
        t.textContent = opts.title;
        card.appendChild(t);
      }
      var body = document.createElement('p');
      body.className = 'mc-cf-body';
      body.textContent = msg;
      card.appendChild(body);

      var actions = document.createElement('div');
      actions.className = 'mc-cf-actions';

      var cancelBtn = document.createElement('button');
      cancelBtn.className = 'mc-cf-btn mc-cf-cancel';
      cancelBtn.textContent = opts.cancelLabel || 'Batal';
      cancelBtn.onclick = function (ev) { ev.stopPropagation(); finish(false); };

      var okBtn = document.createElement('button');
      okBtn.className = 'mc-cf-btn mc-cf-ok' + (opts.okTone === 'neutral' ? ' mc-cf-neutral' : '');
      okBtn.textContent = opts.okLabel || 'Konfirmasi';
      okBtn.onclick = function (ev) { ev.stopPropagation(); finish(true); };

      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      card.appendChild(actions);
      overlay.appendChild(card);
      h.appendChild(overlay);

      // Backdrop click = cancel (not when clicking inside card)
      overlay.onclick = function (ev) {
        if (ev.target === overlay) finish(false);
      };

      // Keyboard: Esc cancels, Enter confirms
      document.addEventListener('keydown', onKey, true);
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); }
      }

      var done = false;
      function finish(val) {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey, true);
        h.removeChild(overlay);
        // Remove host if empty — prevents stale overlay blocking UI
        if (!h.children.length) h.remove();
        resolve(val);
      }

      okBtn.focus();
    });
  }

  return confirmDialog;
});
