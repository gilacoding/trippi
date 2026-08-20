
/* === Auth UX (email + password). Conforms to existing RLS — no auth/RLS change. === */
(function(){
  // modal CSS (injected once; avoids editing the main <style> block)
  var css=document.createElement('style');
  css.textContent='.auth-modal{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(8,10,15,.72);padding:18px}.auth-card{width:100%;max-width:380px;background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:22px}.auth-card h2{margin:0 0 4px}.auth-card .muted{font-size:13px;margin:0 0 16px}.auth-social{margin-bottom:14px}.btn.google{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;color:#1f2330;font-weight:700;border:1px solid #d6dae2}.btn.google:hover{background:#f3f4f6}.auth-divider{display:flex;align-items:center;text-align:center;color:var(--muted);font-size:12px;margin:14px 0 4px}.auth-divider:before,.auth-divider:after{content:"";flex:1;height:1px;background:var(--line)}.auth-divider span{padding:0 12px}.auth-error{color:var(--danger);font-size:13px;min-height:18px;margin:2px 0 4px;font-weight:650}.auth-switch{font-size:13px;margin:14px 0 0}.auth-switch a{color:var(--accent2);font-weight:750}.auth-note{font-size:12px;line-height:1.5;margin:12px 0 0;padding:10px 12px;background:rgba(255,179,92,.08);border:1px solid rgba(255,179,92,.18);border-radius:11px}.show-pw{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:500;color:var(--muted);margin-top:8px;cursor:pointer;user-select:none}.show-pw input{width:auto;margin:0;accent-color:var(--accent2);cursor:pointer}.role-badge{display:inline-block;font-size:11px;font-weight:700;color:var(--accent2);background:rgba(255,179,92,.12);border:1px solid rgba(255,179,92,.3);border-radius:8px;padding:1px 7px;margin-left:4px;vertical-align:middle}';
  document.head.appendChild(css);

  var pendingAction=null;          // action to run after successful login
  var mode='login';                // 'login' | 'signup'
  var modal=document.getElementById('authModal');
  var form=document.getElementById('authForm');
  var errEl=document.getElementById('authError');
  var noteEl=document.getElementById('authNote');
  var titleEl=document.getElementById('authTitle');
  var leadEl=document.getElementById('authLead');
  var submitBtn=document.getElementById('authSubmit');
  var switchEl=document.getElementById('authSwitch');

  function openAuth(m){ mode=m||'login'; renderMode(); errEl.textContent=''; noteEl.style.display='none';
    document.getElementById('authEmail').value=''; document.getElementById('authPassword').value='';
    var nameEl=document.getElementById('authName'); if(nameEl) nameEl.value='';
    modal.style.display='flex'; document.getElementById('authEmail').focus(); }
  function closeAuth(){ modal.style.display='none'; }
  function renderMode(){
    var nameField=document.getElementById('authNameField');
    if(mode==='login'){ titleEl.textContent='Masuk'; leadEl.textContent='Masuk untuk membuat dan bergabung dengan grup perjalanan.'; submitBtn.textContent='Masuk'; switchEl.innerHTML='Belum punya akun? <a href="#" id="authToggle">Daftar</a>'; if(nameField) nameField.style.display='none'; }
    else { titleEl.textContent='Daftar'; leadEl.textContent='Buat akun untuk mulai merencanakan trip bersama.'; submitBtn.textContent='Daftar'; switchEl.innerHTML='Sudah punya akun? <a href="#" id="authToggle">Masuk</a>'; if(nameField) nameField.style.display=''; }
    var t=document.getElementById('authToggle'); if(t) t.onclick=function(e){e.preventDefault();mode=mode==='login'?'signup':'login';renderMode();};
  }

  form.onsubmit=async function(e){
    e.preventDefault(); errEl.textContent=''; noteEl.style.display='none';
    var email=document.getElementById('authEmail').value.trim();
    var pw=document.getElementById('authPassword').value;
    if(!email||pw.length<6){ errEl.textContent='Email valid dan password minimal 6 karakter.'; return; }
    submitBtn.disabled=true;
    if(mode==='login'){
      var r=await API.signInWithEmail(email,pw);
      if(r.error){ errEl.textContent=humanErr(r.error); submitBtn.disabled=false; return; }
      // SIGNED_IN handled by onAuthChange
    } else {
      var s=await API.signUpWithEmail(email,pw);
      if(s.error){ errEl.textContent=humanErr(s.error); submitBtn.disabled=false; return; }
      // Capture display name at registration (so it's available when creating/joining trips)
      var nm=document.getElementById('authName').value.trim();
      if(nm && typeof saveName==='function'){ saveName(nm.slice(0,40)); if(colState) colState.name=nm.slice(0,40); }
      // If a session is returned, user is signed in (mailer_autoconfirm). Otherwise needs email confirmation.
      if(!s.data || !s.data.session){
        noteEl.style.display='block';
        noteEl.textContent='Pendaftaran berhasil. Silakan cek email '+email+' untuk konfirmasi, lalu masuk. (Konfirmasi email wajib di proyek ini.)';
        submitBtn.disabled=false; closeAuth(); return;
      }
      // else SIGNED_IN handled by onAuthChange
    }
    submitBtn.disabled=false;
  };
  document.getElementById('authCancel').onclick=closeAuth;

  // Show/hide password (login + daftar)
  var showPwEl=document.getElementById('showPw');
  if(showPwEl) showPwEl.onchange=function(){ document.getElementById('authPassword').type = showPwEl.checked ? 'text' : 'password'; };
  // reset toggle whenever the auth modal opens (don't stay revealed across modes)
  var _openAuth=openAuth;
  openAuth=function(m){ var el=document.getElementById('showPw'); if(el){ el.checked=false; var p=document.getElementById('authPassword'); if(p) p.type='password'; } _openAuth(m); };

  document.getElementById('logoutBtn').onclick=async function(){
    await API.signOut(); // onAuthChange SIGNED_OUT will update UI
  };

  // M3.5: Google OAuth button (adds a login path; email/password stays).
  // On success Supabase redirects to redirectTo; the returned session fires
  // SIGNED_IN through onAuthChange, which runs onSessionReady + soft-converts
  // a guest (?gt=) viewer into a member via redeem_invitation.
  var googleBtn=document.getElementById('googleBtn');
  if(googleBtn) googleBtn.onclick=async function(){
    errEl.textContent='';
    googleBtn.disabled=true;
    var r=await API.signInWithOAuth('google');
    if(r.error){ errEl.textContent=humanErr(r.error); googleBtn.disabled=false; return; }
    // If a session is returned inline (no redirect, e.g. popup flows), handle it:
    if(r.data&&r.data.session){ /* onAuthChange will fire */ }
    // Otherwise the browser is redirecting to Google now — leave button disabled.
  };

  function humanErr(e){
    var m=(e&&e.message)||'';
    if(/invalid login/i.test(m)||/email or password/i.test(m)) return 'Email atau password salah.';
    if(/user already registered/i.test(m)) return 'Email sudah terdaftar. Coba masuk.';
    if(/password should be/i.test(m)) return 'Password minimal 6 karakter.';
    if(/unable to validate email/i.test(m)) return 'Format email tidak valid.';
    return m||'Terjadi kesalahan. Coba lagi.';
  }

  // Auth-state listener (acceptance #5/#6)
  API.onAuthChange(function(event,session){
    var uid=session&&session.user?session.user.id:null;
    if(event==='SIGNED_IN'||(session&&uid)){
      colState.uid=uid;
      document.getElementById('logoutBtn').style.display='';
      // M3.5: capture OAuth display name (Google/Apple) so it's available
      // for trips/members without re-prompting. Falls back to existing.
      var metaName=session&&session.user&&session.user.user_metadata&&session.user.user_metadata.full_name||session.user.user_metadata&&session.user.user_metadata.name;
      if(metaName&&typeof saveName==='function'){ saveName(String(metaName).slice(0,40)); colState.name=String(metaName).slice(0,40); }
      // M3.5: soft-convert a guest (?gt=) viewer into a real member of the
      // trip they were viewing. redeem_invitation accepts authenticated users.
      if(pendingGuestToken){
        (async()=>{ try{ const nm=(colState.name)||''; await API.redeemInvitation(pendingGuestToken, nm||null); pendingGuestToken=null; if(colState.group) openGroup(colState.group.id,false); }catch(e){ console.warn('soft-convert failed',e); } })();
      }
      closeAuth();
      onSessionReady(uid); // M2: backfill local trips to Supabase (idempotent, non-blocking)
      if(pendingAction){ var a=pendingAction; pendingAction=null; if(typeof a==='function') a(); else if(a==='makeGroup') makeGroupFromTrip(); }
    } else if(event==='SIGNED_OUT'||(!session)){
      colState.uid=null;
      document.getElementById('logoutBtn').style.display='none';
      // signed-out: update UI in place (no navigation — avoids reload loop)
      // Guests (?gt=) must NOT be forced into the login modal — they view read-only.
      if(isGuest()){ return; }
      renderHome(); show('homeView'); openAuth('login');
    }
  });

  // gate primary group-creation entry
  var mg=document.getElementById('makeGroupBtn');
  if(mg) mg.onclick=async function(){ var s=await API.getSession(); if(!(s.data&&s.data.session)){ pendingAction='makeGroup'; openAuth('login'); return; } makeGroupFromTrip(); };

  // clear error message for invalid/expired group links (startup catch already shows one)
})();
