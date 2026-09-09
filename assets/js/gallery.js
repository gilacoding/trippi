/**
 * MarkiCab Gallery Module
 * Gallery loading, rendering, camera capture, and batch upload.
 * Extracted from trip-planner.html — no behavior change.
 *
 * Dependencies:
 *   - window.galleryLightbox (gallery-lightbox.js) for lightbox operations
 *   - window.MarkiAPI for API calls
 *   - colState.gallery for state
 */
(function (root, factory) {
  const gallery = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = gallery;
  }
  if (typeof window !== 'undefined') {
    window.gallery = gallery;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.gallery = gallery;
  }
})(this, function () {
  'use strict';

  // ── Camera state ──
  let _cameraStream = null;

  // ── Batch upload state ──
  let _batchItems = [];
  const _batchConcurrency = 3;
  let _batchActiveCount = 0;
  let _batchCompleted = 0;
  let _batchTotal = 0;

  /**
   * Load gallery media for a group.
   * @param {string} id - Group ID
   */
  async function loadGallery(id) {
    const grid = document.getElementById('galleryGrid');
    const upload = document.getElementById('galleryUpload');
    if (!grid) return;

    const uid = colState.uid;
    const userObj = await API.getUserObject();
    const isAnon = !uid || (userObj && userObj.is_anonymous);
    const isMember = !!(colState.group && colState.members.some(m => m.user_id === uid));

    if (upload) upload.style.display = (isMember && !isAnon) ? 'flex' : 'none';

    showLoading(grid, 'Memuat gallery...');

    const { data, error } = await API.listMedia(id);
    if (error) {
      grid.innerHTML = '<div class="gallery-empty">Gagal memuat gallery.</div>';
      return;
    }

    colState.gallery = data || [];
    renderGallery();
  }

  /**
   * Render gallery grid from colState.gallery.
   */
  function renderGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;

    const items = colState.gallery || [];
    if (!items.length) {
      grid.innerHTML = '<div class="gallery-empty">Belum ada foto. Upload foto pertama!</div>';
      return;
    }

    // Idempotent: full replace keyed by media id
    grid.innerHTML = items.map(function (it, idx) {
      const safeCaption = (it.caption || '').replace(/[<>&]/g, function (c) {
        return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c];
      });
      const isVideo = it.mime_type && it.mime_type.indexOf('video/') === 0;
      const mediaEl = isVideo
        ? '<video src="' + it.signed_url + '" muted loop playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;display:block"></video><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-size:28px;pointer-events:none;text-shadow:0 2px 8px rgba(0,0,0,.5)">▶</div>'
        : '<img src="' + it.signed_url + '" alt="' + safeCaption + '" loading="lazy" onerror="this.style.display=\'none\'">';
      return '<div class="gallery-card" data-idx="' + idx + '" data-id="' + it.id + '">' +
        mediaEl +
        (it.caption ? '<div class="caption">' + safeCaption + '</div>' : '') +
        '<button class="delete-btn" data-delgallery="' + it.id + '" title="Hapus">×</button>' +
        '</div>';
    }).join('');

    // Click to open lightbox
    grid.querySelectorAll('.gallery-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('.delete-btn')) return;
        openGalleryLightbox(parseInt(card.dataset.idx));
      });
    });

    // Delete buttons
    grid.querySelectorAll('[data-delgallery]').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.stopPropagation();
        const mediaId = btn.dataset.delgallery;
        if (!confirm('Hapus foto ini?')) return;
        const { error } = await API.deleteMedia(mediaId);
        if (error) { alert('Gagal menghapus: ' + error.message); return; }
        colState.gallery = colState.gallery.filter(g => g.id !== mediaId);
        renderGallery();
      });
    });
  }

  /**
   * Open lightbox at given index.
   * @param {number} idx
   */
  function openGalleryLightbox(idx) {
    window.galleryLightbox.open(idx, colState.gallery);
  }

  /**
   * Close lightbox.
   */
  function closeGalleryLightbox() {
    window.galleryLightbox.close();
  }

  /**
   * Navigate lightbox.
   * @param {number} dir - -1 prev, +1 next
   */
  function navigateLightbox(dir) {
    window.galleryLightbox.navigate(dir, colState.gallery);
  }

  /**
   * Update lightbox content.
   */
  function updateLightboxContent() {
    window.galleryLightbox.updateContent(colState.gallery);
  }

  // ── Camera capture (getUserMedia) ─────────────────────────────────

  /**
   * Show camera error message.
   * @param {string} msg
   */
  function showCameraError(msg) {
    const cameraVideo = document.getElementById('cameraVideo');
    const cameraError = document.getElementById('cameraError');
    if (cameraVideo) cameraVideo.style.display = 'none';
    if (cameraError) {
      cameraError.style.display = 'flex';
      cameraError.innerHTML = msg;
    }
  }

  /**
   * Clear camera error message.
   */
  function clearCameraError() {
    const cameraVideo = document.getElementById('cameraVideo');
    const cameraError = document.getElementById('cameraError');
    if (cameraVideo) cameraVideo.style.display = 'block';
    if (cameraError) { cameraError.style.display = 'none'; cameraError.textContent = ''; }
  }

  /**
   * Stop camera stream and hide overlay.
   */
  async function stopCamera() {
    if (_cameraStream) {
      _cameraStream.getTracks().forEach(t => t.stop());
      _cameraStream = null;
    }
    const cameraVideo = document.getElementById('cameraVideo');
    const cameraOverlay = document.getElementById('cameraOverlay');
    if (cameraVideo) cameraVideo.srcObject = null;
    if (cameraOverlay) cameraOverlay.classList.remove('active');
    clearCameraError();
  }

  /**
   * Start camera stream.
   */
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCameraError('Kamera tidak didukung di browser ini. Gunakan browser modern (Chrome, Safari, Firefox) atau upload foto langsung.');
      const cameraOverlay = document.getElementById('cameraOverlay');
      if (cameraOverlay) cameraOverlay.classList.add('active');
      return;
    }
    try {
      _cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // rear camera on mobile
        audio: false
      });
      const cameraVideo = document.getElementById('cameraVideo');
      const cameraError = document.getElementById('cameraError');
      const cameraOverlay = document.getElementById('cameraOverlay');
      if (cameraVideo) {
        cameraVideo.srcObject = _cameraStream;
        cameraVideo.style.display = 'block';
      }
      if (cameraError) cameraError.style.display = 'none';
      if (cameraOverlay) cameraOverlay.classList.add('active');
    } catch (err) {
      console.error('[camera] getUserMedia error', err);
      let msg = 'Tidak bisa mengakses kamera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser untuk mengambil foto langsung.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Kamera tidak ditemukan di perangkat ini.';
      } else if (err.name === 'NotReadableError') {
        msg = 'Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi lain dan coba lagi.';
      }
      showCameraError(msg);
      const cameraOverlay = document.getElementById('cameraOverlay');
      if (cameraOverlay) cameraOverlay.classList.add('active');
    }
  }

  /**
   * Capture photo from camera stream and upload.
   */
  function capturePhoto() {
    const cameraVideo = document.getElementById('cameraVideo');
    if (!_cameraStream || !cameraVideo) return;

    const canvas = document.createElement('canvas');
    canvas.width = cameraVideo.videoWidth || 1280;
    canvas.height = cameraVideo.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async function (blob) {
      if (!blob) { showCameraError('Gagal menangkap foto. Coba lagi.'); return; }
      await stopCamera();
      const status = document.getElementById('galleryUploadStatus');
      const caption = document.getElementById('galleryCaption');
      if (status) status.textContent = 'Mengupload...';
      const { data, error } = await API.uploadMedia({
        groupId: colState.group.id,
        file: blob,
        caption: caption ? caption.value : ''
      });
      if (error) { if (status) status.textContent = 'Gagal: ' + error.message; return; }
      if (status) status.textContent = 'Berhasil!';
      if (caption) caption.value = '';
      if (data) {
        colState.gallery.unshift({
          id: data.id,
          storage_path: data.storage_path,
          signed_url: data.signed_url,
          uploader_id: colState.uid,
          caption: caption ? caption.value : '',
          created_at: new Date().toISOString()
        });
      }
      renderGallery();
      setTimeout(function () { if (status) status.textContent = ''; }, 3000);
    }, 'image/jpeg', 0.85);
  }

  // ── Batch upload system ─────────────────────────────────────────

  /**
   * Format bytes as human-readable size.
   * @param {number} bytes
   * @returns {string}
   */
  function _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * Check if file is a video.
   * @param {File} file
   * @returns {boolean}
   */
  function _isVideo(file) { return file.type.indexOf('video/') === 0; }

  /**
   * Validate file type and size.
   * @param {File} file
   * @returns {{ok: boolean, msg?: string}}
   */
  function _validateFile(file) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
    if (allowed.indexOf(file.type) === -1) {
      return { ok: false, msg: 'Tipe file tidak diizinkan' };
    }
    const maxImg = 10 * 1024 * 1024;
    const maxVid = 50 * 1024 * 1024;
    const limit = _isVideo(file) ? maxVid : maxImg;
    if (file.size > limit) {
      return { ok: false, msg: 'Melebihi ' + (_isVideo(file) ? '50' : '10') + 'MB' };
    }
    return { ok: true };
  }

  /**
   * Render batch upload queue.
   */
  function _renderBatchQueue() {
    const queue = document.getElementById('batchQueue');
    const summary = document.getElementById('batchSummary');
    if (!queue) return;
    if (_batchItems.length === 0) {
      queue.style.display = 'none';
      summary.style.display = 'none';
      return;
    }
    queue.style.display = 'grid';
    summary.style.display = 'flex';
    queue.innerHTML = _batchItems.map(function (item, i) {
      let thumb;
      if (_isVideo(item.file)) {
        thumb = '<span>🎬</span>';
      } else if (item.preview) {
        thumb = '<img src="' + item.preview + '" alt="">';
      } else {
        thumb = '<span>📷</span>';
      }
      const barClass = item.status === 'done' ? 'done' : item.status === 'error' ? 'error' : '';
      const statusText = item.status === 'waiting' ? 'Menunggu' :
        item.status === 'uploading' ? 'Mengupload...' :
          item.status === 'done' ? 'Selesai' :
            item.status === 'error' ? 'Gagal' : '';
      const statusClass = item.status || 'waiting';
      const retryBtn = item.status === 'error' ?
        '<button class="retry-btn" data-batch-retry="' + i + '" title="Coba lagi">↺</button>' : '';
      const removeBtn = (item.status === 'waiting' || item.status === 'error') ?
        '<button class="remove-btn" data-batch-remove="' + i + '" title="Hapus">×</button>' : '';
      return '<div class="batch-item" data-batch-idx="' + i + '">' +
        '<div class="thumb">' + thumb + '</div>' +
        '<div class="info"><div class="fname">' + window.utils.esc(item.file.name) + '</div><div class="fsize">' + _formatSize(item.file.size) + '</div></div>' +
        '<div class="progress"><div class="bar ' + barClass + '" style="width:' + item.progress + '%"></div></div>' +
        '<span class="status ' + statusClass + '">' + statusText + '</span>' +
        retryBtn + removeBtn +
        '</div>';
    }).join('');
    // Wire events
    queue.querySelectorAll('[data-batch-retry]').forEach(function (btn) {
      btn.onclick = function () { _retryBatchItem(parseInt(btn.dataset.batchRetry)); };
    });
    queue.querySelectorAll('[data-batch-remove]').forEach(function (btn) {
      btn.onclick = function () { _removeBatchItem(parseInt(btn.dataset.batchRemove)); };
    });
    _updateBatchSummary();
  }

  /**
   * Update batch upload summary progress.
   */
  function _updateBatchSummary() {
    const bar = document.getElementById('batchOverallBar');
    const text = document.getElementById('batchSummaryText');
    if (!bar || !text) return;
    const pct = _batchTotal > 0 ? Math.round((_batchCompleted / _batchTotal) * 100) : 0;
    bar.style.width = pct + '%';
    text.textContent = _batchCompleted + '/' + _batchTotal + ' selesai';
  }

  /**
   * Remove item from batch queue.
   * @param {number} idx
   */
  function _removeBatchItem(idx) {
    if (_batchItems[idx] && _batchItems[idx].status === 'uploading') return;
    _batchItems.splice(idx, 1);
    _batchTotal = _batchItems.length;
    _renderBatchQueue();
    _processBatch();
  }

  /**
   * Retry failed batch item.
   * @param {number} idx
   */
  function _retryBatchItem(idx) {
    const item = _batchItems[idx];
    if (!item || item.status !== 'error') return;
    item.status = 'waiting';
    item.progress = 0;
    item.error = null;
    _renderBatchQueue();
    _processBatch();
  }

  /**
   * Upload a single batch item.
   * @param {object} item
   * @returns {Promise<void>}
   */
  function _uploadSingleItem(item) {
    return new Promise(function (resolve) {
      item.status = 'uploading';
      item.progress = 30;
      _renderBatchQueue();
      const caption = document.getElementById('galleryCaption');
      const payload = {
        groupId: colState.group.id,
        file: item.file,
        caption: caption ? caption.value : ''
      };
      // Simulate progress (Supabase SDK doesn't expose granular progress)
      const progressInterval = setInterval(function () {
        if (item.progress < 90) { item.progress += Math.random() * 15; if (item.progress > 90) item.progress = 90; }
        _renderBatchQueue();
      }, 400);
      API.uploadMedia(payload).then(function (result) {
        clearInterval(progressInterval);
        if (result.error) {
          item.status = 'error';
          item.error = result.error.message;
          item.progress = 100;
          _batchCompleted++;
        } else if (result.data) {
          item.status = 'done';
          item.progress = 100;
          item.result = result.data;
          _batchCompleted++;
          colState.gallery.unshift({
            id: result.data.id,
            storage_path: result.data.storage_path,
            signed_url: result.data.signed_url,
            uploader_id: colState.uid,
            caption: caption ? caption.value : '',
            created_at: new Date().toISOString()
          });
        } else {
          item.status = 'error';
          item.error = 'Unknown error';
          item.progress = 100;
          _batchCompleted++;
        }
        _batchActiveCount--;
        _renderBatchQueue();
        _processBatch();
        resolve();
      }).catch(function (err) {
        clearInterval(progressInterval);
        item.status = 'error';
        item.error = err.message || 'Upload failed';
        item.progress = 100;
        _batchActiveCount--;
        _batchCompleted++;
        _renderBatchQueue();
        _processBatch();
        resolve();
      });
    });
  }

  /**
   * Process batch upload queue.
   */
  async function _processBatch() {
    if (_batchActiveCount >= _batchConcurrency) return;
    const next = _batchItems.find(function (it) { return it.status === 'waiting'; });
    if (!next) {
      // All done
      if (_batchCompleted >= _batchTotal && _batchTotal > 0) {
        renderGallery();
        setTimeout(function () {
          _batchItems = [];
          _batchTotal = 0;
          _batchCompleted = 0;
          _batchActiveCount = 0;
          _renderBatchQueue();
        }, 2000);
      }
      return;
    }
    _batchActiveCount++;
    await _uploadSingleItem(next);
    _processBatch();
  }

  /**
   * Add files to batch upload queue.
   * @param {File[]} files
   */
  function _addBatchFiles(files) {
    const validFiles = [];
    let invalidCount = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const validation = _validateFile(f);
      if (!validation.ok) {
        invalidCount++;
        continue;
      }
      // Generate preview for images
      let preview = null;
      if (!_isVideo(f) && window.URL && URL.createObjectURL) {
        preview = URL.createObjectURL(f);
      }
      validFiles.push({
        file: f,
        status: 'waiting',
        progress: 0,
        error: null,
        preview: preview,
        result: null
      });
    }
    if (invalidCount > 0) {
      const statusEl = document.getElementById('galleryUploadStatus');
      if (statusEl) {
        statusEl.textContent = invalidCount + ' file ditolak (tipe/ukuran)';
        setTimeout(function () { statusEl.textContent = ''; }, 4000);
      }
    }
    if (validFiles.length === 0) return;
    _batchItems = _batchItems.concat(validFiles);
    _batchTotal = _batchItems.length;
    _renderBatchQueue();
    _processBatch();
  }

  /**
   * Wire camera and batch upload DOM events.
   */
  function wireGalleryDOM() {
    const cameraBtn = document.getElementById('cameraBtn');
    const cameraCaptureBtn = document.getElementById('cameraCaptureBtn');
    const cameraCancelBtn = document.getElementById('cameraCancelBtn');
    const batchSelectBtn = document.getElementById('batchSelectBtn');
    const batchFileInput = document.getElementById('batchFileInput');
    const batchDropzone = document.getElementById('batchDropzone');

    if (cameraBtn) cameraBtn.addEventListener('click', startCamera);
    if (cameraCaptureBtn) cameraCaptureBtn.addEventListener('click', capturePhoto);
    if (cameraCancelBtn) cameraCancelBtn.addEventListener('click', stopCamera);

    if (batchSelectBtn && batchFileInput) {
      batchSelectBtn.onclick = function () { batchFileInput.click(); };
      batchFileInput.onchange = function (e) {
        if (e.target.files.length > 0) {
          _addBatchFiles(Array.prototype.slice.call(e.target.files));
        }
        e.target.value = '';
      };
    }

    if (batchDropzone) {
      batchDropzone.addEventListener('dragover', function (e) {
        e.preventDefault();
        batchDropzone.classList.add('drag-over');
      });
      batchDropzone.addEventListener('dragleave', function (e) {
        e.preventDefault();
        batchDropzone.classList.remove('drag-over');
      });
      batchDropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        batchDropzone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
          _addBatchFiles(Array.prototype.slice.call(e.dataTransfer.files));
        }
      });
    }
  }

  return {
    loadGallery,
    renderGallery,
    openGalleryLightbox,
    closeGalleryLightbox,
    navigateLightbox,
    updateLightboxContent,
    showCameraError,
    clearCameraError,
    stopCamera,
    startCamera,
    capturePhoto,
    wireGalleryDOM,
    _formatSize,
    _isVideo,
    _validateFile,
    _renderBatchQueue,
    _updateBatchSummary,
    _removeBatchItem,
    _retryBatchItem,
    _uploadSingleItem,
    _processBatch,
    _addBatchFiles
  };
});
