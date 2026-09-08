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
  const LB_HTML = '<button class="close-btn" id="galleryLbClose">×</button>' +
    '<button class="nav-btn prev-btn" id="galleryLbPrev">‹</button>' +
    '<div id="galleryLbMedia"><img id="galleryLbImg" src="" alt=""></div>' +
    '<button class="nav-btn next-btn" id="galleryLbNext">›</button>' +
    '<div class="caption" id="galleryLbCaption"></div>';

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
      lb.innerHTML = LB_HTML;
      document.body.appendChild(lb);

      lb.querySelector('#galleryLbClose').onclick = close;
      lb.querySelector('#galleryLbPrev').onclick = () => navigate(-1);
      lb.querySelector('#galleryLbNext').onclick = () => navigate(1);
      lb.onclick = (e) => { if (e.target === lb) close(); };
    }
    return lb;
  }

  /**
   * Open the lightbox at a given index.
   * @param {number} idx - Index into gallery items array
   * @param {Array} items - Gallery items (from colState.gallery)
   */
  function open(idx, items) {
    if (!items || !items.length) return;
    const lb = getOrCreateLightbox();
    lb.dataset.idx = idx;
    lb.classList.add('active');
    updateContent(items);
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
  }

  return {
    open,
    close,
    navigate,
    updateContent,
    setOnNavigate
  };
});
