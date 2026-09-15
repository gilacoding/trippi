/**
 * MarkiCab Gallery Lightbox
 * Pure lightbox controller — open/close/navigate/update.
 * Extracted from trip-planner.html — no behavior change.
 */
(function (root, factory) {
  const gallery = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = gallery;
  }
  if (typeof window !== 'undefined') {
    window.galleryLightbox = gallery;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.galleryLightbox = gallery;
  }
})(this, function () {
  'use strict';

  const LB_ID = 'galleryLightbox';
  const LB_HTML = '<button class="close-btn" id="galleryLbClose" aria-label="Tutup galeri">×</button>' +
    '<button class="nav-btn prev-btn" id="galleryLbPrev" aria-label="Sebelumnya">‹</button>' +
    '<div id="galleryLbMedia"><img id="galleryLbImg" src="" alt=""></div>' +
    '<button class="nav-btn next-btn" id="galleryLbNext" aria-label="Berikutnya">›</button>' +
    '<div class="lb-meta"><div class="caption" id="galleryLbCaption"></div><div class="lb-by" id="galleryLbBy"></div></div>';

  let _onNavigate = null; // callback for external state sync (optional)

  /**
   * Set a callback fired when lightbox navigates (for external state sync).
   * @param {function(number): void} cb - receives new index
   */
  function setOnNavigate(cb) {
    _onNavigate = cb;
  }

  /**
   * Get the lightbox element, creating it if needed.
   * @returns {HTMLElement}
   */
  function getOrCreateLightbox() {
    let lb = document.getElementById(LB_ID);
    if (!lb) {
      lb = document.createElement('div');
      lb.id = LB_ID;
      lb.className = 'gallery-lightbox';
      lb.setAttribute('role', 'dialog');
      lb.setAttribute('aria-modal', 'true');
      lb.setAttribute('aria-label', 'Foto & video trip');
      lb.innerHTML = LB_HTML;
      document.body.appendChild(lb);

      lb.querySelector('#galleryLbClose').onclick = close;
      lb.querySelector('#galleryLbPrev').onclick = () => navigate(-1);
      lb.querySelector('#galleryLbNext').onclick = () => navigate(1);
      lb.onclick = (e) => { if (e.target === lb) close(); };
      // a11y: Escape closes, Tab cycles inside the dialog while open
      lb.onkeydown = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key !== 'Tab') return;
        const f = Array.prototype.filter.call(
          lb.querySelectorAll('button, [href], video[controls], [tabindex]:not([tabindex="-1"])'),
          function (el) { return !el.disabled && el.offsetParent !== null; });
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      };
    }
    return lb;
  }

  let _restoreFocus = null; // element focused before the lightbox opened

  /**
   * Open the lightbox at a given index.
   * @param {number} idx - Index into gallery items array
   * @param {Array} items - Gallery items (from colState.gallery)
   */
  function open(idx, items) {
    if (!items || !items.length) return;
    const lb = getOrCreateLightbox();
    _restoreFocus = document.activeElement;
    lb.dataset.idx = idx;
    lb.classList.add('active');
    updateContent(items);
    const c = lb.querySelector('#galleryLbClose');
    if (c) c.focus();
  }

  /**
   * Close the lightbox.
   */
  function close() {
    const lb = document.getElementById(LB_ID);
    if (lb) {
      lb.classList.remove('active');
      const vid = lb.querySelector('video');
      if (vid) { vid.pause(); vid.src = ''; }
    }
    if (_restoreFocus && typeof _restoreFocus.focus === 'function') { _restoreFocus.focus(); }
    _restoreFocus = null;
  }

  /**
   * Navigate the lightbox.
   * @param {number} dir - -1 for prev, +1 for next
   * @param {Array} items - Gallery items array
   */
  function navigate(dir, items) {
    const lb = document.getElementById(LB_ID);
    if (!lb) return;
    if (!items || !items.length) return;
    let idx = parseInt(lb.dataset.idx) + dir;
    if (idx < 0) idx = items.length - 1;
    if (idx >= items.length) idx = 0;
    lb.dataset.idx = idx;
    updateContent(items);
    if (_onNavigate) _onNavigate(idx);
  }

  /**
   * Update lightbox content for current index.
   * @param {Array} items - Gallery items array
   */
  function updateContent(items) {
    const lb = document.getElementById(LB_ID);
    if (!lb) return;
    if (!items || !items.length) return;
    const idx = parseInt(lb.dataset.idx);
    const it = items[idx];
    if (!it) return;

    const mediaContainer = lb.querySelector('#galleryLbMedia');
    const img = lb.querySelector('#galleryLbImg');
    if (!mediaContainer || !img) return;

    const isVideo = it.mime_type && it.mime_type.indexOf('video/') === 0;
    if (isVideo) {
      mediaContainer.innerHTML = '<video id="galleryLbVideo" src="' + it.signed_url + '" controls autoplay style="max-width:90vw;max-height:80vh;border-radius:8px"></video>';
      img.style.display = 'none';
    } else {
      mediaContainer.innerHTML = '';
      img.src = it.signed_url;
      img.style.display = 'block';
      mediaContainer.appendChild(img);
    }
    lb.querySelector('#galleryLbCaption').textContent = it.caption || '';
    var byEl = lb.querySelector('#galleryLbBy');
    if (byEl){
      var nm = null;
      try { if (typeof window.uploaderName === 'function') nm = window.uploaderName(it.uploader_id); } catch(e){}
      if (!nm){ try { var ms=(window.colState&&colState.members)||[]; var mm=ms.find(function(x){return x.user_id===it.uploader_id}); if(mm&&!/^(guest|user|anon)/i.test(mm.display_name||'')) nm=mm.display_name; } catch(e){} }
      byEl.textContent = nm ? 'oleh ' + nm : '';
      byEl.style.display = nm ? '' : 'none';
    }
  }

  return {
    open,
    close,
    navigate,
    updateContent,
    setOnNavigate
  };
});
