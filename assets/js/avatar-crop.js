/**
 * MarkiCab Avatar Crop Controller — proven profile-photo flow:
 *   pick file → circular crop (drag to pan, slider/scroll to zoom, rotate 90°)
 *   → exports a square JPEG sized to the circle's bounding box.
 *
 * The export size equals the visible circle diameter (S) — i.e. exactly what
 * the user framed is what gets uploaded, then shown with CSS object-fit:cover
 * in every circle (avatar, header, stacks) at any display size.
 *
 * Pure logic (clampOffset / computeFit / exportBlob) is DOM-free and unit
 * testable (node-canvas). Rendering/wiring only runs with a real canvas.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.AvatarCrop = mod;
  if (typeof globalThis !== 'undefined') globalThis.AvatarCrop = mod;
})(this, function () {
  'use strict';

  var SIZE = 280;      // on-screen stage (square canvas = circle diameter)
  var EXPORT = 512;    // px of the uploaded square (>= any display size)

  // Cover-fit the (rotated) image so it always fills the circle.
  function computeFit(w, h, rot, zoom) {
    var rw = (rot % 180) ? h : w;   // rotated bounding box
    var rh = (rot % 180) ? w : h;
    var base = Math.max(SIZE / rw, SIZE / rh); // scale so short side covers
    var s = base * zoom;
    return { rw: rw, rh: rh, scale: s, drawW: rw * s, drawH: rh * s };
  }

  // Clamp pan so the circle is never left empty.
  function clampOffset(off, drawW, drawH) {
    var min = (SIZE - drawW) / 2, min2 = (SIZE - drawH) / 2;
    return {
      x: Math.min(Math.max(off.x, min), -min),
      y: Math.min(Math.max(off.y, min2), -min2)
    };
  }

  function renderTo(canvas, img, st) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#F5F5DC';
    ctx.fillRect(0, 0, SIZE, SIZE);
    var f = computeFit(img.naturalWidth || img.width, img.naturalHeight || img.height, st.rot, st.zoom);
    ctx.translate(SIZE / 2 + st.off.x, SIZE / 2 + st.off.y);
    ctx.rotate(st.rot * Math.PI / 180);
    ctx.drawImage(img, -f.drawW / 2, -f.drawH / 2, f.drawW, f.drawH);
    ctx.restore();
  }

  // Export = exactly the framed circle, upscaled to EXPORT px.
  function exportBlob(canvas, img, st) {
    var out = document.createElement('canvas');
    out.width = EXPORT; out.height = EXPORT;
    var ctx = out.getContext('2d');
    ctx.fillStyle = '#F5F5DC';
    ctx.fillRect(0, 0, EXPORT, EXPORT);
    var k = EXPORT / SIZE;
    var f = computeFit(img.naturalWidth || img.width, img.naturalHeight || img.height, st.rot, st.zoom);
    ctx.save();
    ctx.translate((SIZE / 2 + st.off.x) * k, (SIZE / 2 + st.off.y) * k);
    ctx.rotate(st.rot * Math.PI / 180);
    ctx.drawImage(img, -f.drawW / 2 * k, -f.drawH / 2 * k, f.drawW * k, f.drawH * k);
    ctx.restore();
    return new Promise(function (resolve, reject) {
      out.toBlob(function (b) {
        if (b) resolve(b); else reject(new Error('Ekspor foto gagal'));
      }, 'image/jpeg', 0.9);
    });
  }

  function mount(opts) {
    var canvas = opts.canvas, stage = opts.stage,
        zoomEl = opts.zoomEl, rotateBtn = opts.rotateBtn,
        onPick = opts.onPick; // (blob) => Promise
    var st = { zoom: 1, rot: 0, off: { x: 0, y: 0 } };
    var img = null;

    function fit() {
      if (!img) return;
      var f = computeFit(img.naturalWidth, img.naturalHeight, st.rot, st.zoom);
      st.off = clampOffset(st.off, f.drawW, f.drawH);
    }
    function redraw() { if (img) renderTo(canvas, img, st); }
    function setImg(src) {
      return new Promise(function (resolve) {
        img = new Image();
        img.onload = function () { st.off = { x: 0, y: 0 }; fit(); redraw(); resolve(); };
        img.src = src;
      });
    }
    function reset() { st = { zoom: 1, rot: 0, off: { x: 0, y: 0 } }; if (zoomEl) zoomEl.value = 100; }

    // pointer drag (mouse+touch via pointer events)
    var drag = null;
    canvas.addEventListener('pointerdown', function (e) {
      if (!img) return;
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      st.off.x += e.clientX - drag.x; st.off.y += e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
      fit(); redraw();
    });
    ['pointerup', 'pointercancel'].forEach(function (t) {
      canvas.addEventListener(t, function () { drag = null; });
    });
    // wheel zoom around center
    canvas.addEventListener('wheel', function (e) {
      if (!img) return;
      e.preventDefault();
      var z = Math.min(3, Math.max(1, st.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
      st.zoom = z; if (zoomEl) zoomEl.value = Math.round(z * 100);
      fit(); redraw();
    }, { passive: false });
    // keyboard accessibility on the focused stage
    canvas.addEventListener('keydown', function (e) {
      if (!img) return;
      var d = e.shiftKey ? 24 : 8;
      var used = true;
      if (e.key === 'ArrowLeft') st.off.x += d;
      else if (e.key === 'ArrowRight') st.off.x -= d;
      else if (e.key === 'ArrowUp') st.off.y += d;
      else if (e.key === 'ArrowDown') st.off.y -= d;
      else if (e.key === '+' || e.key === '=') { st.zoom = Math.min(3, st.zoom * 1.1); if (zoomEl) zoomEl.value = Math.round(st.zoom * 100); }
      else if (e.key === '-' || e.key === '_') { st.zoom = Math.max(1, st.zoom / 1.1); if (zoomEl) zoomEl.value = Math.round(st.zoom * 100); }
      else used = false;
      if (used) { e.preventDefault(); fit(); redraw(); }
    });
    if (zoomEl) zoomEl.addEventListener('input', function () {
      st.zoom = Math.min(3, Math.max(1, (+zoomEl.value || 100) / 100)); fit(); redraw();
    });
    if (rotateBtn) rotateBtn.addEventListener('click', function () {
      if (!img) return;
      st.rot = (st.rot + 90) % 360; fit(); redraw();
    });

    return {
      openWith: function (src) { reset(); return setImg(src); },
      exportNow: function () {
        if (!img) return Promise.reject(new Error('Belum ada foto dipilih'));
        return exportBlob(canvas, img, st);
      },
      getState: function () { return { zoom: st.zoom, rot: st.rot, off: st.off }; },
      _img: function () { return img; }
    };
  }

  return { mount: mount, computeFit: computeFit, clampOffset: clampOffset, SIZE: SIZE, EXPORT: EXPORT };
});
