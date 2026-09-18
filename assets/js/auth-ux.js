/**
 * auth-ux.js — Auth UX feature (login/signup modal + profile/avatar).
 *
 * Extracted from trip-planner.html Script 2 (lines 4302–4556).
 *
 * Public interface:
 *   window.Auth.init()           — one-time setup (CSS injection + DOM wiring)
 *   window.Auth.openAuth(mode)   — show auth modal (login | signup)
 *   window.Auth.closeAuth()      — hide auth modal (returns to index.html if no session)
 *   window.Auth.openProfile()    — show profile modal
 *   window.Auth.closeProfile()   — hide profile modal
 *
 * Dependencies (all via window — NO direct feature-internal imports):
 *   window.MarkiAPI        — backend API
 *   window.colState        — Core collaborative state
 *   window.utils.humanErr  — error translation
 *   window.utils.saveName  — name persistence
 *   window.saveName        — named export from Core
 *   window.loadIdentities  — identity refresh (typeof-guarded)
 *   window.renderCrewStatusList — crew list refresh (typeof-guarded)
 *   window.renderGroupPlanner  — planner refresh (typeof-guarded)
 *   window.mcToast         — toast notification
 *   window.mcConfirm       — confirmation dialog
 *   window.isGuest         — guest check
 *   window.pendingGuestToken — guest token state
 *   window.AvatarCrop      — avatar crop library (external)
 *   window.__initialAuthMode — landing CTA handoff
 */
(function () {

  // ── Dependencies (all via window — explicit, no shared lexical environment) ──
  var API = window.MarkiAPI;
  var colState = window.colState;
  var humanErr = window.utils ? window.utils.humanErr : function (e) { return String(e || 'Unknown error'); };
  var saveName = window.saveName || (window.utils && window.utils.saveName);
  var mcToast = (typeof window.mcToast === 'function') ? window.mcToast : null;
  var mcConfirm = (typeof window.mcConfirm === 'function') ? window.mcConfirm : null;
  var isGuest = (typeof window.isGuest === 'function') ? window.isGuest : function () { return false; };
  var pendingGuestToken = window.pendingGuestToken;
  window.pendingAction = null;  // action to run after successful login (exposed for Core)

  // ── Auth modal CSS (injected once; mirrors original Script 2 style block) ──
  var css = document.createElement('style');
  css.textContent =
    '.auth-modal{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(8,10,15,.72);padding:18px}' +
    '.auth-card{width:100%;max-width:380px;background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:22px}' +
    '.auth-card h2{margin:0 0 4px}' +
    '.auth-card .muted{font-size:13px;margin:0 0 16px}' +
    '.auth-social{margin-bottom:14px}' +
    '.btn.google{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;color:#1A1A1A;font-weight:700;border:1px solid #E0DBD5}' +
    '.btn.google:hover{background:#E0E4CC}' +
    '.auth-divider{display:flex;align-items:center;text-align:center;color:var(--muted);font-size:12px;margin:14px 0 4px}' +
    '.auth-divider:before,.auth-divider:after{content:"";flex:1;height:1px;background:var(--line)}' +
    '.auth-divider span{padding:0 12px}' +
    '.auth-error{color:var(--danger);font-size:13px;min-height:18px;margin:2px 0 4px;font-weight:650}' +
    '.auth-switch{font-size:13px;margin:14px 0 0}' +
    '.auth-switch a{color:var(--accent2-text);font-weight:750}' +
    '.auth-note{font-size:12px;line-height:1.5;margin:12px 0 0;padding:10px 12px;background:rgba(255,179,92,.08);border:1px solid rgba(255,179,92,.18);border-radius:11px}' +
    '.show-pw{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:500;color:var(--muted);margin-top:8px;cursor:pointer;user-select:none}' +
    '.show-pw input{width:auto;margin:0,accent-color:var(--accent2-text);cursor:pointer}' +
    '.topbar-actions{display:flex;gap:8px}' +
    '.hint{display:block;font-size:12px;color:var(--muted);margin-top:6px;line-height:1.4}' +
    '.role-badge{display:inline-block;font-size:11px;font-weight:700;color:var(--accent2-text);background:rgba(255,179,92,.12);border:1px solid rgba(255,179,92,.3);border-radius:8px;padding:1px 7px;margin-left:4px;vertical-align:middle}';
  document.head.appendChild(css);

  // ── Auth modal DOM refs ──
  var modal = document.getElementById('authModal');
  var form = document.getElementById('authForm');
  var errEl = document.getElementById('authError');
  var noteEl = document.getElementById('authNote');
  var titleEl = document.getElementById('authTitle');
  var leadEl = document.getElementById('authLead');
  var submitBtn = document.getElementById('authSubmit');
  var switchEl = document.getElementById('authSwitch');

  var pendingAction = null;
  var mode = 'login';

  // ── Auth modal functions ──
  function openAuth(m) {
    mode = m || 'login';
    renderMode();
    errEl.textContent = '';
    noteEl.style.display = 'none';
    var emailEl = document.getElementById('authEmail');
    if (emailEl) emailEl.value = '';
    var pwEl = document.getElementById('authPassword');
    if (pwEl) pwEl.value = '';
    var nameEl = document.getElementById('authName');
    if (nameEl) nameEl.value = '';
    if (modal) modal.style.display = 'flex';
    var focusEl = document.getElementById('authEmail');
    if (focusEl) focusEl.focus();
  }

  function closeAuth() {
    if (modal) modal.style.display = 'none';
    if (!colState.uid && !isGuest() && !pendingGuestToken) {
      location.replace('index.html');
    }
  }

  function renderMode() {
    var nameField = document.getElementById('authNameField');
    if (mode === 'login') {
      if (titleEl) titleEl.textContent = 'Masuk';
      if (leadEl) leadEl.textContent = 'Masuk untuk membuat dan bergabung dengan grup perjalanan.';
      if (submitBtn) submitBtn.textContent = 'Masuk';
      if (switchEl) switchEl.innerHTML = 'Belum punya akun? <a href="#" id="authToggle">Daftar</a>';
      if (nameField) nameField.style.display = 'none';
    } else {
      if (titleEl) titleEl.textContent = 'Daftar';
      if (leadEl) leadEl.textContent = 'Buat akun untuk mulai merencanakan trip bersama.';
      if (submitBtn) submitBtn.textContent = 'Daftar';
      if (switchEl) switchEl.innerHTML = 'Sudah punya akun? <a href="#" id="authToggle">Masuk</a>';
      if (nameField) nameField.style.display = '';
    }
    var t = document.getElementById('authToggle');
    if (t) t.onclick = function (e) {
      e.preventDefault();
      mode = mode === 'login' ? 'signup' : 'login';
      renderMode();
    };
  }

  function _handleLoginEmail(email, pw) {
    return API.signInWithEmail(email, pw).then(function (r) {
      if (r.error) {
        errEl.textContent = humanErr(r.error);
        submitBtn.disabled = false;
        return Promise.resolve('error');
      }
      return Promise.resolve('signed_in'); // SIGNED_IN handled by onAuthChange
    });
  }

  function _handleSignupFresh(email, pw, nm) {
    return API.signUpWithEmail(email, pw).then(function (s) {
      if (s.error) {
        errEl.textContent = humanErr(s.error);
        submitBtn.disabled = false;
        return Promise.resolve('error');
      }
      return API.signInWithEmail(email, pw).then(function (loginR) {
        if (loginR && !loginR.error) {
          noteEl.style.display = 'block';
          noteEl.textContent = 'Akun dibuat. Membuka trip...';
          submitBtn.disabled = false;
          return Promise.resolve('created');
        }
        return Promise.resolve('signin_failed');
      });
    });
  }

  function _handleAnonConvert(email, pw, nm) {
    return API.updateUserEmailAndPassword(email, pw).then(function (s) {
      if (s.error) {
        errEl.textContent = humanErr(s.error);
        submitBtn.disabled = false;
        return Promise.resolve('error');
      }
      if (nm && typeof saveName === 'function') {
        saveName(nm.slice(0, 40));
        if (colState) colState.name = nm.slice(0, 40);
      }
      return API.clearMemberAnonFlag().then(function () {
        noteEl.style.display = 'block';
        noteEl.textContent = 'Email diperbarui. Silakan cek email ' + email + ' untuk konfirmasi. (Konfirmasi email wajib di proyek ini.)';
        submitBtn.disabled = false;
        closeAuth();
        if (typeof window.loadIdentities === 'function' && colState.group) {
          window.loadIdentities(colState.group.id);
        }
        if (typeof window.renderCrewStatusList === 'function') {
          window.renderCrewStatusList();
        }
        return Promise.resolve('converted');
      });
    });
  }

  function _postSignupCleanup(nm) {
    if (nm && typeof saveName === 'function') {
      saveName(nm.slice(0, 40));
      if (colState) colState.name = nm.slice(0, 40);
    }
  }

  // ── Auth form submit handler ──
  function onAuthSubmit(e) {
    e.preventDefault();
    errEl.textContent = '';
    noteEl.style.display = 'none';
    window.__userAuthAttempt = true;
    var email = (document.getElementById('authEmail').value || '').trim();
    var pw = (document.getElementById('authPassword').value || '');
    if (!email || pw.length < 6) {
      errEl.textContent = 'Email valid dan password minimal 6 karakter.';
      return;
    }
    submitBtn.disabled = true;
    if (mode === 'login') {
      _handleLoginEmail(email, pw).then(function (result) {
        submitBtn.disabled = false;
      });
    } else {
      var oldUser = API.getUserObject && API.getUserObject();
      var wasAnon = !!(oldUser && oldUser.is_anonymous);
      var nm = (document.getElementById('authName').value || '').trim();
      if (wasAnon) {
        _handleAnonConvert(email, pw, nm).then(function () {
          submitBtn.disabled = false;
        });
      } else {
        _handleSignupFresh(email, pw, nm).then(function (result) {
          if (result === 'signin_failed' || result === 'error') {
            submitBtn.disabled = false;
            return;
          }
          _postSignupCleanup(nm);
          if (result !== 'created') {
            noteEl.style.display = 'block';
            noteEl.textContent = 'Pendaftaran berhasil. Silakan cek email ' + email + ' untuk konfirmasi, lalu masuk. (Konfirmasi email wajib di proyek ini.)';
            submitBtn.disabled = false;
            closeAuth();
          }
        });
      }
    }
  }

  // ── Profile modal DOM refs ──
  var profileModal = document.getElementById('profileModal');
  var profileNameInput = document.getElementById('profileName');
  var profileEmailInput = document.getElementById('profileEmail');
  var profileTypeInput = document.getElementById('profileAccountType');
  var profileError = document.getElementById('profileError');
  var profileNote = document.getElementById('profileNote');
  var profileAvatar = document.getElementById('profileAvatar');
  var profileAvatarInput = document.getElementById('avatarUpload');
  var profileNameDisplay = document.getElementById('profileNameDisplay');
  var profileEmailDisplay = document.getElementById('profileEmailDisplay');
  var headerAvatar = document.getElementById('headerAvatar');

  // ── Avatar flow ──
  var _cropModal = document.getElementById('avatarCropModal');
  var _cropCtrl = null;
  var _cropFileUrl = null;

  function _uploadAvatarFile(file) {
    profileError.textContent = 'Mengunggah foto...';
    return API.uploadAvatar(file).then(function (res) {
      if (res.error) {
        profileError.textContent = 'Gagal mengunggah: ' + res.error.message;
        throw new Error('upload');
      }
      if (res.data && res.data.signed_url) {
        if (profileAvatar) {
          profileAvatar.style.backgroundImage = 'url(' + res.data.signed_url + ')';
          profileAvatar.classList.add('has-photo');
          profileAvatar.textContent = '';
        }
        profileError.textContent = '';
        colState.userAvatarUrl = res.data.signed_url;
        if (headerAvatar) {
          headerAvatar.classList.add('has-photo');
          headerAvatar.style.backgroundImage = 'url(' + res.data.signed_url + ')';
          headerAvatar.style.backgroundSize = 'cover';
          headerAvatar.textContent = '';
        }
        if (typeof mcToast === 'function') mcToast('Foto profil diperbarui', 'ok');
      }
    });
  }

  function _openCrop(src) {
    if (_cropModal) _cropModal.style.display = 'flex';
    if (_cropCtrl) _cropCtrl.openWith(src);
    var el = document.getElementById('avatarCropSave');
    if (el) el.focus();
  }

  function _closeCrop() {
    if (_cropModal) _cropModal.style.display = 'none';
    if (_cropFileUrl) {
      URL.revokeObjectURL(_cropFileUrl);
      _cropFileUrl = null;
    }
  }

  function _startAvatarPick(file) {
    if (!file) return;
    if (typeof window.AvatarCrop === 'function' || (window.AvatarCrop && window.AvatarCrop.mount)) {
      if (!_cropCtrl) {
        _cropCtrl = window.AvatarCrop.mount({
          canvas: document.getElementById('avatarCropCanvas'),
          stage: document.querySelector('.crop-stage'),
          zoomEl: document.getElementById('avatarCropZoom'),
          rotateBtn: document.getElementById('avatarCropRotate')
        });
      }
      _cropFileUrl = URL.createObjectURL(file);
      _openCrop(_cropFileUrl);
    } else {
      _uploadAvatarFile(file).catch(function () {});
    }
  }

  // ── Profile functions ──
  function openProfile() {
    var session = API.getSession && API.getSession();
    var user = session && session.user;
    var displayName = colState.name || (user && user.user_metadata && user.user_metadata.name) || '';
    var displayEmail = (user && user.email) || '';
    if (profileNameInput) profileNameInput.value = displayName;
    if (profileEmailInput) profileEmailInput.value = displayEmail;
    var anon = user && user.is_anonymous;
    if (profileTypeInput) profileTypeInput.value = anon ? 'Anonymous Guest' : 'Email Account';
    if (profileError) profileError.textContent = '';
    if (profileNote) profileNote.style.display = 'none';
    if (profileAvatar) {
      if (!profileAvatar.classList.contains('has-photo')) {
        if (displayName) {
          profileAvatar.textContent = displayName.charAt(0).toUpperCase();
        } else {
          profileAvatar.textContent = '?';
        }
      }
    }
    if (profileNameDisplay) profileNameDisplay.textContent = displayName || 'Tamu';
    if (profileEmailDisplay) profileEmailDisplay.textContent = displayEmail || '';
    if (profileModal) profileModal.style.display = 'flex';
    if (profileAvatar) {
      if (!profileAvatar.classList.contains('has-photo') && !colState.userAvatarUrl) {
        profileAvatar.textContent = displayName ? displayName.charAt(0).toUpperCase() : '?';
      }
    }
  }

  function closeProfile() {
    if (profileModal) profileModal.style.display = 'none';
  }

  function onProfileSave(e) {
    e.preventDefault();
    var name = (profileNameInput.value || '').trim();
    if (profileError) profileError.textContent = '';
    if (profileNote) profileNote.style.display = 'none';
    var banned = ['guest', 'creator', 'owner', 'member', 'anggota', 'kamu', 'user', 'anonymous', 'tanpa nama'];
    if (name.length < 2) {
      if (profileError) profileError.textContent = 'Nama terlalu minimal (minimal 2 karakter).';
      return;
    }
    if (name.length > 40) {
      if (profileError) profileError.textContent = 'Nama terlalu panjang (maksimal 40 karakter).';
      return;
    }
    if (banned.indexOf(name.toLowerCase()) !== -1) {
      if (profileError) profileError.textContent = 'Nama ini tidak diperbolehkan. Pilih nama lain.';
      return;
    }
    try {
      var res = API.updateMyProfile(name);
      if (res && res.error) {
        if (profileError) profileError.textContent = 'Gagal menyimpan: ' + (res.error.message || 'Unknown error');
        return;
      }
      colState.name = name;
      if (typeof saveName === 'function') saveName(name);
      if (profileNote) {
        profileNote.style.display = 'block';
        profileNote.textContent = 'Nama berhasil diperbarui. Perubahan muncul di semua trip Anda.';
      }
      if (typeof window.renderCrewStatusList === 'function') window.renderCrewStatusList();
      if (typeof window.renderGroupPlanner === 'function') window.renderGroupPlanner();
      setTimeout(function () { closeProfile(); }, 800);
    } catch (err) {
      if (profileError) profileError.textContent = 'Gagal menyimpan: ' + (err && err.message || 'Unknown error');
    }
  }

  function onProfileLogout() {
    return API.signOut().then(function () { closeProfile(); });
  }

  // ── Public interface ──
  function init() {
    // Auth modal wiring
    if (form) form.onsubmit = onAuthSubmit;
    if (document.getElementById('authCancel')) {
      document.getElementById('authCancel').onclick = closeAuth;
    }
    // Landing CTA handoff: ?mode=signup|login was requested before this module loaded
    if (window.__initialAuthMode) {
      var _iam = window.__initialAuthMode;
      window.__initialAuthMode = null;
      openAuth(_iam);
    }
    // Profile modal wiring
    if (profileAvatarInput) {
      profileAvatarInput.onchange = function (e) {
        var file = e.target.files && e.target.files[0];
        e.target.value = '';
        _startAvatarPick(file);
      };
    }
    if (_cropModal) {
      var cropCancel = document.getElementById('avatarCropCancel');
      if (cropCancel) cropCancel.onclick = _closeCrop;
      _cropModal.onclick = function (e) {
        if (e.target === _cropModal) _closeCrop();
      };
      _cropModal.onkeydown = function (e) {
        if (e.key === 'Escape') _closeCrop();
      };
      var cropSave = document.getElementById('avatarCropSave');
      if (cropSave) cropSave.onclick = function () {
        var err = document.getElementById('avatarCropError');
        if (err) err.textContent = '';
        var btn = document.getElementById('avatarCropSave');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Menyimpan...';
        }
        _cropCtrl.exportNow().then(function (blob) {
          var file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
          return _uploadAvatarFile(file);
        }).catch(function (err2) {
          if (err2 && err2.message !== 'upload') {
            var errEl2 = document.getElementById('avatarCropError');
            if (errEl2) errEl2.textContent = err2.message || 'Gagal menyimpan foto';
          }
        }).finally(function () {
          var btn2 = document.getElementById('avatarCropSave');
          if (btn2) {
            btn2.disabled = false;
            btn2.textContent = 'Simpan Foto';
          }
          _closeCrop();
        });
      };
    }
    if (headerAvatar) headerAvatar.onclick = openProfile;
    if (document.getElementById('profileCancel')) {
      document.getElementById('profileCancel').onclick = closeProfile;
    }
    if (document.getElementById('profileSave')) {
      document.getElementById('profileSave').onclick = onProfileSave;
    }
    if (document.getElementById('profileLogout')) {
      document.getElementById('profileLogout').onclick = onProfileLogout;
    }
    // Override openAuth to reset showPw checkbox (mirrors original Script 2)
    var _origOpenAuth = openAuth;
    openAuth = function (m) {
      var el = document.getElementById('showPw');
      if (el) {
        el.checked = false;
        var p = document.getElementById('authPassword');
        if (p) p.type = 'password';
      }
      _origOpenAuth(m);
    };
    window.openAuth = openAuth;
    window.openProfile = openProfile;
    window.closeProfile = closeProfile;
  }

  // ── Public interface (published BEFORE init so consumers can reference
  //    it even when init throws — FeatureBootstrap guarantees containment) ──
  var iface = {
    Auth: { init: init, openAuth: openAuth, closeAuth: closeAuth, openProfile: openProfile, closeProfile: closeProfile },
    openAuth: openAuth,
    openProfile: openProfile,
    closeProfile: closeProfile
  };
  window.Auth = iface.Auth;
  window.openAuth = iface.openAuth;
  window.openProfile = iface.openProfile;
  window.closeProfile = iface.closeProfile;

  // UMD export for headless testing
  if (typeof module !== 'undefined' && module.exports) module.exports = iface;

  // Init with failure isolation: defer to FeatureBootstrap when available,
  // fall back to bare init() (original behaviour) when it is not.
  if (typeof window !== 'undefined' && window.FeatureBootstrap) {
    window.FeatureBootstrap.register('auth', init);
  } else {
    init();
  }
})();
