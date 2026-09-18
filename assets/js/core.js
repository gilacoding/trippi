/**
 * markicab-core.js — Infrastructure shared by personal + group planners.
 *
 * Split from trip-planner.html Script 1 (lines 1438-4299, ~759 lines):
 *  • Constants, state, $, dbg, esc, money, dateText, daysBetween, tripStatus,
 *    getTrip, utils aliases, API, colState, updateHeaderAvatar, applyUserAvatar,
 *    navigateHome, busyBtn/freeBtn/showLoading/hideLoading, createGroupDirectly,
 *    normalizeLink, categoryIcon, shareGroup, copyGroupLink, shareTrip,
 *    ensureAuth, askName, ownerNameFromAccount, groupLink, makeGroupFromTrip,
 *    joinGroup, openGroup, loadShared, loadMembers, reconcileTrip,
 *    installSyncRecovery, routeReconcile, loadGroupExpenses, loadWishlists,
 *    seedIdentities, resolveIdentity, isPlaceholderName, loadIdentities,
 *    AVATAR_TTL, avatarUrlFor, ensureAvatarUrls, avatarChip,
 *    locationStatusOf, nameOfOrNull, nameOf, roleLabelOf,
 *    journey init (colState.journey, colState.isGuest),
 *    isFreshLocation, distanceMeters, fmtDistance,
 *    addGroupAgenda, addGroupExpense, editGroupTime, editGroupCost,
 *    removeGroupItem, removeGroupExpense, leaveGroup, teardownGroupSession,
 *    canEdit*, applyPermsUI, openFromHash,
 *    pendingGuestToken + startup + auth gate + utils exports.
 *
 * NOT included (owned by feature scripts, Script 2 of group-planner.html):
 *  renderHome, renderPlanner, renderToGo, renderExpenses, addOrUpdateTrip,
 *  addAgenda, addExpense, deleteExpense, saveTrip* (12 functions),
 *  updateHeaderAvatar (Script 2 version — collides with Core version),
 *  applyUserAvatar (Script 2 version — calls Core updateHeaderAvatar),
 *  tripStatus, getTrip (Script 2 versions with same names).
 *
 * Adaptations applied (Core vs HTML):
 *  • guestSession → window.guestSession
 *  • pendingAction → window.pendingAction
 *  • pendingGuestToken → window.pendingGuestToken
 *  • renderGuestView/topics → window.renderGuestView (typeof guard)
 *  • openAuth → window.openAuth (typeof guard)
 *  • renderGroupPlanner → window.renderGroupPlanner (typeof guard)
 *  • renderGroupWishlist → window.renderGroupWishlist (typeof guard)
 *  • renderJourneyView → window.renderJourneyView (typeof guard)
 *  • loadCrewMap → window.loadCrewMap (typeof guard)
 *  • openGroupSettings → window.openGroupSettings (typeof guard)
 *  • renderHome → window.renderHome (typeof guard + setTimeout for race safety)
 *  • esc + humanErr → exposed on window.utils AND as standalone helpers
 *    (so Core helpers like addGroupAgenda can call bare humanErr)
 */

/** humanErr, refactored: used by Core functions (addGroupAgenda, leaveGroup, etc.). */
function humanErr(e) {
  if (e === null || e === undefined) return 'Gagal: error tidak dikenal.';
  if (typeof e === 'string') return 'Gagal: ' + e;
  if (e.message) return 'Gagal: ' + e.message;
  if (e.error && typeof e.error === 'string') return 'Gagal: ' + e.error;
  if (e.errors && Array.isArray(e.errors)) {
    return 'Gagal: ' + e.errors.map(function(r) { return (r.message || r) || ''; }).filter(Boolean).join('; ');
  }
  return "Gagal: error tak diketahui (" + (typeof e) + ")";
}

// ── Infrastructure (Script 1 lines 1438-1509) ───────────────────────────────
  const STORE_KEY='markicab_personal_planner_v2';
  const LEGACY_STORE_KEY='markicab_personal_planner_v1';
  const state={trips:[],toGo:[],activeTripId:null,activeDate:null,pendingToGoId:null,editTripId:null,readOnlyTrip:null};
  const $=id=>document.getElementById(id);
  const dbg=(msg)=>{};
  const esc=window.utils.esc;

  const tripBgCat=window.utils.tripBgCat;
  // ── Collaborative (P2) state ──
  const API=window.MarkiAPI;
  const colState={uid:null,name:null,group:null,items:[],wishlists:[],members:[],expenses:[],gallery:[],nameMap:{},identities:{},activeDate:null,channel:null,poll:null,locationChannel:null,userAvatarUrl:null};
  // P0-3: Minimal activation telemetry (best-effort, non-blocking)
  window.logEvent = async function(eventName, tripId, isGuest) {
    try {
      await API.rpc('log_product_event', {p_event_name: eventName, p_trip_id: tripId, p_is_guest: isGuest});
    } catch(e) { /* telemetry must never block product */ }
  };
  // Display name fallback chain: profile → metadata → localStorage → email prefix → Guest
  const loadName=()=>localStorage.getItem('markicab_display_name')||'';
  const saveName=n=>localStorage.setItem('markicab_display_name',n);
  const displayName=(user)=>{
    // Priority 1: explicit display name from profile/members
    if(user.display_name) return user.display_name;
    // Priority 2: user_metadata.name
    if(user.user_metadata?.name) return user.user_metadata.name;
    // Priority 3: email prefix
    if(user.email) return user.email.split('@')[0];
    // Priority 4: fallback
    return 'Guest';
  };
  const money=window.utils.money;
  const dateText=window.utils.dateText;
  const MIG_KEY='markicab_migration_v';
  const SYNC_VERSION=1;
  const getMig=()=>parseInt(localStorage.getItem(MIG_KEY)||'0',10)||0;
  const setMig=v=>localStorage.setItem(MIG_KEY,String(v));
  // Dual-write scheduler: localStorage write is synchronous + authoritative for render.
  // Server sync is best-effort, non-blocking, failure-tolerant (never throws to UI).
  let _syncTimer=null;
  const scheduleSync=()=>{ if(_syncTimer)clearTimeout(_syncTimer); _syncTimer=setTimeout(syncActiveTrip,400); };
  const save=()=>{ localStorage.setItem(STORE_KEY,JSON.stringify({trips:state.trips,toGo:state.toGo})); scheduleSync(); };
  function load(){try{const current=JSON.parse(localStorage.getItem(STORE_KEY)||'null');if(current){state.trips=current.trips||[];state.toGo=current.toGo||[]}else{state.trips=JSON.parse(localStorage.getItem(LEGACY_STORE_KEY)||'[]');state.toGo=[];save()}}catch{state.trips=[];state.toGo=[]}}

  // ── Guest Mode (M4.6 redesign) ────────────
  // Guests open an invited trip via ?gt={token}. They CANNOT create/share trips.
  // Flow: Shared link → Guest View (preview + participant count + "Gabung Trip")
  //       → [server RPC redeem_invitation] → Member.
  // Join ≠ location consent (M4.3/M4.4 gates remain). Frontend display-only;
  // server-side gate in get_crew_locations() is authoritative.
  window.guestSession = window.guestSession || null; // { token, trip, isMember }
  function isGuest(){ return !!window.guestSession; }

  async function openGuestTrip(token){
    try{
      const { data, error } = await API.getGuestTrip(token);
      if(error){ alert('Undangan tidak valid, kedaluwarsa, atau sudah dibatalkan.'); navigateHome("home"); return; }
      if(!data){ alert('Undangan tidak valid.'); navigateHome("home"); return; }
      window.guestSession = { token, trip: data, isMember: !!(colState.uid && data.is_member) };
      lockNavForGuest();
      if (typeof window.renderGuestView === "function") await window.renderGuestView(data, window.guestSession.isMember);
      show('guestView');
    }catch(e){ console.error('[guest] open failed', e); alert('Gagal membuka undangan.'); navigateHome("home"); }
  }

  function lockNavForGuest(){
    document.querySelectorAll('[data-home], #newTripBtn').forEach(el => el.style.display = 'none');
    const tabs = document.getElementById('groupViewTabs'); if(tabs) tabs.style.display = 'none';
  }
  function unlockNav(){
    document.querySelectorAll('[data-home], #newTripBtn').forEach(el => el.style.display = '');
    const tabs = document.getElementById('groupViewTabs'); if(tabs) tabs.style.display = '';
  }
  // ── M2 Sync layer (delegated to sync.js) ───────────────────────
  async function syncTrip(trip) { return window.MarkiSync.syncTrip(trip); }
  async function syncActiveTrip() { return window.MarkiSync.syncActiveTrip(); }
  async function backfillAndSync() { return window.MarkiSync.backfillAndSync(); }
  async function verifySync() { return window.MarkiSync.verifySync(); }
  async function onSessionReady(uid) { return window.MarkiSync.onSessionReady(uid); }
  async function loadServerGroups() { return window.MarkiSync.loadServerGroups(); }
  async function loadPersonalTrips() { return window.MarkiSync.loadPersonalTrips(); }

  const daysBetween=window.utils.daysBetween;
  function tripStatus(trip){ return window.TripDomain.tripStatus(trip); }
  function getTrip(){ return window.TripDomain.getTrip(); }
  function show(view){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));$(view).classList.add('active')}
  function openSharedTrip(trip){
    // PHASE 0 INVARIANT: Creator never becomes read-only on their own trip.
    // Keep readOnlyTrip set so getTrip() can resolve the trip object.
    // renderPlanner() will check ownership to decide edit controls.
    state.readOnlyTrip = trip;
    state.activeTripId = null;
    state.editTripId = null;
    state.activeDate = trip.start;
    renderPlanner();
    show('plannerView');
  }
    // Fetch personal trips from Supabase and merge into local state
    function updateHeaderAvatar(displayName) {
      var headerAvatar = document.getElementById('headerAvatar');
      if (!headerAvatar) return;

      // Don't clobber a photo that was applied by applyUserAvatar()
      if (colState.userAvatarUrl || headerAvatar.classList.contains('has-photo')) {
        return;
      }

      headerAvatar.textContent =
        displayName ? displayName.charAt(0).toUpperCase() : '?';
      window.updateHeaderAvatar = updateHeaderAvatar;
    }

    async function applyUserAvatar() {
      try {
        if (typeof API.getUserObject !== 'function') return;

        const user = await API.getUserObject();
        if (!user || !user.avatar_url) {
          colState.userAvatarUrl = null;
          return;
        }

        const res = await API.getAvatarSignedUrl(user.avatar_url);
        const url = res && res.data && res.data.signed_url;

        if (!url) {
          colState.userAvatarUrl = null;
          return;
        }

        colState.userAvatarUrl = url;

        ['profileAvatar', 'headerAvatar'].forEach(function (id) {
          var el = document.getElementById(id);
          if (!el) return;

          el.classList.add('has-photo');
          el.style.backgroundImage = 'url("' + url + '")';
          el.style.backgroundSize = 'cover';
          el.style.backgroundPosition = 'center';
          el.textContent = '';
        });

      } catch (e) {
        console.warn('[avatar] Failed to load avatar:', e && e.message);
        colState.userAvatarUrl = null;
      }
    }

function navigateHome(reason) {
  // PHASE 0 INVARIANT: All home navigation cleans URL state.
  // Prevents stale ?group=, ?t=, ?trip=, ?gt= from surviving across mutations.
  if (window.location.search || window.location.hash) {
    history.replaceState({}, '', window.location.pathname);
  }
  if (typeof teardownGroupSession === 'function') teardownGroupSession();
  if (typeof window.renderHome === 'function') window.renderHome();
  show('homeView');
}
  function busyBtn(el, label){ if(!el) return; el.dataset.origText=el.textContent; el.disabled=true; el.textContent=label; }
  function freeBtn(el){ if(!el) return; el.textContent=el.dataset.origText||el.textContent; el.disabled=false; }
  function showLoading(el, label){ if(!el) return false; el.dataset.origHTML=el.innerHTML; const sk=document.createElement('div'); sk.className='loading-skel'; sk.textContent=label; el.innerHTML=''; el.appendChild(sk); return true; }
  function hideLoading(el){ if(!el||!el.dataset.origHTML) return; el.innerHTML=el.dataset.origHTML; delete el.dataset.origHTML; }
  async function createGroupDirectly(name,destination,start,end,note,pendingToGoId){const submitBtn=$('newTripSubmit');busyBtn(submitBtn,'Membuat...');try{
  // Founder rule 2026-09-15 (replaces guest-first): FREE, but an account is
  // required to own a trip. No session - or an anonymous guest session - means
  // the existing auth modal opens; creation continues after sign-in.
  let uid=await ensureAuth();
  const _cu=uid?await API.getUserObject():null;
  if(!uid||(_cu&&_cu.is_anonymous)){
    freeBtn(submitBtn);
    // Existing continue-after-auth pattern (same as makeGroupBtn/joinGroup):
    // replay this creation once a real session exists.
    window.pendingAction=function(){ createGroupDirectly(name,destination,start,end,note,pendingToGoId); };
    if(typeof window.openAuth==='function')window.openAuth('signup');
    return;
  }const { data:g,error:e }=await API.createGroup({name:name,destination:destination||'',start_date:start,end_date:end,created_by:uid});if(e){console.error('[createGroup] INSERT gagal:',e);alert('Gagal buat grup: '+e.message);return}const _ownerName=loadName()||ownerNameFromAccount();const { error:em }=await API.joinGroup({group_id:g.id,user_id:uid,display_name:_ownerName});if(em){console.error('[createGroup] member insert FAILED:',em);alert('Grup berhasil dibuat, tapi gagal mendaftarkan diri sebagai anggota: '+em.message);return}
  // P0-3: Telemetry - trip created (best-effort, non-blocking)
  if(window.logEvent) window.logEvent('trip_created', g.id, false);
colState.activeDate=null;state.pendingToGoId=null;$('selectedToGo').style.display='none';if(event&&event.target)event.target.reset();await openGroup(g.id,true);if(!colState.group||colState.group.id!==g.id){alert('Error: Gagal membuka grup. Silakan coba buat ulang.');return}history.replaceState({},'',groupLink(g.id));if(pendingToGoId){const sp=(state.toGo||[]).find(t=>t.id===pendingToGoId);if(sp){await API.addItem({group_id:g.id,date:start,title:sp.name,time:'',link:normalizeLink(sp.link||''),note:sp.note||'',budget:0,created_by:uid});await loadShared(g.id )}}}finally{freeBtn(submitBtn)}}
  const normalizeLink=window.utils.normalizeLink;
  function addAgenda(event){event.preventDefault();const trip=getTrip();trip.items.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),date:state.activeDate,title:$('agendaTitle').value.trim(),time:$('agendaTime').value,budget:$('agendaBudget').value,link:normalizeLink($('agendaLink').value),note:$('agendaNote').value.trim()});save();syncTrip(trip);event.target.reset();$('addPanel').open=false;renderPlanner()}
  const categoryIcon=window.utils.categoryIcon;
  function renderExpenses(){const trip=getTrip();const expenses=trip.expenses||[],dayExpenses=expenses.filter(item=>item.date===state.activeDate);const sum=list=>list.reduce((total,item)=>total+(Number(item.amount)||0),0);$('dailyExpenseTotal').textContent=money(sum(dayExpenses));$('tripExpenseTotal').textContent=money(sum(expenses));$('expenseList').innerHTML=dayExpenses.length?dayExpenses.map(item=>`<article class="expense-item"><span class="expense-icon" aria-hidden="true">${categoryIcon(item.category)}</span><div class="expense-copy"><div class="expense-name">${esc(item.name)}</div><div class="expense-meta">${esc(item.category)}${item.note?` · ${esc(item.note)}`:''}</div></div><div class="expense-amount">${money(item.amount)}</div><button class="expense-delete" data-delete-expense="${item.id}" aria-label="Hapus pengeluaran">×</button></article>`).join(''):'<div class="empty" data-ic="coins"><strong>Belum ada pengeluaran hari ini.</strong>Catat saat uang benar-benar keluar.</div>';document.querySelectorAll('[data-delete-expense]').forEach(button=>button.onclick=()=>deleteExpense(button.dataset.deleteExpense))}
  function addExpense(event){event.preventDefault();const trip=getTrip();if(!trip.expenses)trip.expenses=[];trip.expenses.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),date:state.activeDate,name:$('expenseName').value.trim(),amount:$('expenseAmount').value,category:$('expenseCategory').value,note:$('expenseNote').value.trim()});save();syncTrip(trip);event.target.reset();$('expensePanel').open=false;renderExpenses()}
  function deleteExpense(id){
  const trip=getTrip();
  if(!trip||!trip.expenses)return;
  const i=trip.expenses.findIndex(x=>x.id===id);
  if(i<0)return;
  trip.expenses.splice(i,1);
  save();
  syncTrip(trip);
  renderExpenses();
}
  async function shareGroup(){
    const gid=colState.group?colState.group.id:(getTrip()&&getTrip().groupId);
    if(!gid){
      const ok=await window.mcConfirm('Mulai kolaborasi?\n\nTrip ini akan dikonversi ke grup — setiap orang yang membuka link grup akan ikut otomatis dan melihat perubahan secara langsung (via realtime + polling 3 detik).');
      if(!ok)return;
      await makeGroupFromTrip();
      const gid2=colState.group?colState.group.id:(getTrip()&&getTrip().groupId);
      if(!gid2)return;
      copyGroupLink(gid2);
      return;
    }
    // M2 security patch: ONLY the trip creator may generate a share/invite link.
    // Server enforces this (create_invitation raises for non-creators); UI also hides it.
    const isCreator = !!(colState.group && colState.group.created_by && colState.uid && colState.group.created_by === colState.uid);
    if(!isCreator){
      alert('Hanya pembuat trip yang dapat membuat tautan undangan.');
      return;
    }
    try{
      const { data, error } = await API.createInvitation(gid, colState.name);
      if(error){ alert('Gagal membuat undangan: '+(error.message||'error')); return; }
      const token = data && data[0] && data[0].token;
      if(!token){ alert('Gagal membuat undangan.'); return; }
      const link = groupLink(gid)+'?gt='+token;
      const input = document.getElementById('shareInput');
      if(input){ input.value = link; input.select(); }
      copyGroupLink(link);
    }catch(e){ alert('Gagal membuat undangan: '+(e.message||e)); }
  }
  function copyGroupLink(gid){
    const link=groupLink(gid);
    const input=document.getElementById('shareInput');
    if(input){input.value=link;input.select()}
    if(typeof navigator!=='undefined'&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(link).then(()=>{const b=document.getElementById('shareCopyBadge');if(b){b.textContent='Tautan disalin!';setTimeout(()=>{b.textContent='Tautan disalin!'},2500)}}).catch(()=>{alert('Salin manual: '+link)})}else{alert('Salin manual: '+link)}
  }
  async function shareTrip(){const g=colState.group;if(!g)return;await shareGroup()}

  async function ensureAuth(){
    let uid=null;
    try{const s=await API.getSession();if(s&&s.data&&s.data.session&&s.data.session.user&&s.data.session.user.id){uid=s.data.session.user.id}}catch{}
    // In a browser context, fall back to Supabase currentUser
    if(!uid && typeof window!=='undefined' && window.supabase && typeof window.supabase.currentUser==='function'){
      try{const cu=window.supabase.currentUser();uid=cu?cu.id:null}catch{}
    }
    // Also check colState (may have been set by sync.js)
    if(!uid && colState && colState.uid) uid=colState.uid;
    return uid;
  }

  async function askName(){
    const u = await API.getUserObject();
    if(u && !u.is_anonymous && u.display_name) return u.display_name;
    if(u && u.email) return u.email.split('@')[0];
    const saved = loadName();
    if(saved) return saved;
    // Lightweight - don't block with a full modal; use a small inline prompt
    const nm = window.prompt ? window.prompt('Masukkan nama untuk tampilan grup') : '';
    if(nm && nm.trim()){
      saveName(nm.trim());
      return nm.trim();
    }
    return 'Penyusun';
  }

  async function ownerNameFromAccount(){
    const u=await API.getUserObject();
    if(u&&!u.is_anonymous&&u.display_name)return u.display_name;
    if(u&&u.email)return u.email.split('@')[0];
    return 'Penyusun';
  }

  function groupLink(id){const h=window.location.hostname||'marki.cab';const p=window.location.pathname.replace(/\/+$/,'');return'https://'+h+p+'/g/'+id}

  async function makeGroupFromTrip(){
    const trip=getTrip();
    if(!trip)return;
    const uid=await ensureAuth();
    if(!uid){
      window.pendingAction='makeGroup';
      if(typeof window.openAuth==='function')window.openAuth('login');
      return;
    }
    const nm=await askName();
    const g={name:trip.name+' (Grup)',destination:trip.destination,start_date:trip.start,end_date:trip.end,created_by:uid,is_group:true};
    const {data:group,error}=await API.createGroup(g);
    if(error){console.error('[makeGroupFromTrip] createGroup FAILED:',error);alert('Tidak bisa membuat grup: '+error.message);return}
    await API.joinGroup({group_id:group.id,user_id:uid,display_name:nm});
    // Link trip → group
    if(trip.id){await API.linkTrip({trip_id:trip.id,group_id:group.id})}
    state.pendingToGoId=null;
    colState.group=group;
    await loadShared(group.id);
    await loadMembers(group.id);
    await loadIdentities(group.id);
    renderGroupPlanner();
    applyPermsUI();
    show('groupView');
    $('groupName').textContent=group.name;
    history.replaceState({},'',groupLink(group.id));
    return group;
  }

  async function joinGroup(id){
    const uid=await ensureAuth();
    if(!uid){dbg('joinGroup: ensureAuth FAILED (uid null)');window.pendingAction=()=>joinGroup(id);if(typeof window.openAuth==='function')window.openAuth('login');return}
    // PHASE 6 INVARIANT (idempotency): duplicate calls are harmless.
    // Server-side: is_member guard + ON CONFLICT DO NOTHING.
    // Frontend-side: we re-derive the complete group session from scratch every
    // time openGroup() is called, so replaying a join is always safe (not a bug
    // if a mid-tier service dedupes or reinvites; do NOT special-case an error).
    let nm=loadName()||await askName();
    const {error}=await API.joinGroup({group_id:id,user_id:uid,display_name:nm});
    if(error&&!error.message.includes('already a member')){
      console.error('[joinGroup] insert FAILED:',error);
      alert('Gagal bergabung: '+error.message);
      return;
    }
    window.pendingAction=null;
    await openGroup(id);
  }

  async function openGroup(id,fresh,trip){
    const uid=await ensureAuth();if(!uid)return;
    let g = (await API.getGroup(id)).data;
    if(!g){
      // list_my_groups may not reflect a just-joined membership yet (PostgREST caching)
      dbg('openGroup: retrying getGroup after 2s for freshly joined member');
      await new Promise(r => setTimeout(r, 2000));
      g = (await API.getGroup(id)).data;
    }
    if(!g){
      alert('Grup tidak ditemukan.');
      // Remove dead group reference from local state
      if (colState.group && colState.group.id === id) {
        colState.group = null;
      }
      // Also remove from state.trips if it's a group trip
      const deadIdx = state.trips.findIndex(t => t.groupId === id || t.serverId === id);
      if (deadIdx >= 0) {
        state.trips.splice(deadIdx, 1);
        save();
      }
      navigateHome('openGroup-not-found');
      return;
    }
    // Fase A: tear down any previous group session BEFORE wiring the new one.
    // Guarantees no leaked channel/interval and no stale trip-A data in trip B.
    await teardownGroupSession();
    colState.group=g;
    show('groupView');
    $('groupName').textContent=g.name;
    const ch=API._getSb().channel('group:'+id);
    // P0.5: realtime is an INVALIDATION SIGNAL, not a data channel. No handler
    // trusts its payload or patches a single row; each one just asks for a fresh
    // authoritative snapshot, so a missed/duplicated/late event cannot corrupt state.
    const invalidate = (why) => () => reconcileTrip('realtime:' + why);
    ch.on('postgres_changes',{event:'*',schema:'public',table:'shared_items',filter:'group_id=eq.'+id}, invalidate('shared_items'))
      .on('postgres_changes',{event:'*',schema:'public',table:'group_members',filter:'group_id=eq.'+id}, invalidate('group_members'))
      .on('postgres_changes',{event:'*',schema:'public',table:'group_expenses',filter:'group_id=eq.'+id}, invalidate('group_expenses'))
      .on('postgres_changes',{event:'*',schema:'public',table:'wishlist_items',filter:'group_id=eq.'+id}, invalidate('wishlist_items'))
      // Journey start/end changes which surface is valid, so re-derive it too.
      .on('postgres_changes',{event:'*',schema:'public',table:'journey_sessions',filter:'group_id=eq.'+id},()=>{ if(document.getElementById('journeyPanel')) { if(typeof window.renderJourneyView==='function') window.renderJourneyView(); } })
      .on('postgres_changes',{event:'*',schema:'public',table:'member_locations',filter:'group_id=eq.'+id},()=>{ if(colState.journey && colState.journey.status === 'active') { if(typeof window.loadCrewMap==='function') window.loadCrewMap(); } });
    const st=await new Promise((resolve)=>{
      const timer=setTimeout(()=>resolve('TIMED_OUT'),8000);
      const unsub=ch.subscribe((status)=>{
        if(status==='SUBSCRIBED'){
          clearTimeout(timer);
          // Every (re)subscribe reconciles: while the socket was down we received
          // nothing, so the snapshot is the only way back to a correct state.
          if(colState._subscribedOnce) reconcileTrip('resubscribe');
          colState._subscribedOnce = true;
          resolve('SUBSCRIBED');
        }
        else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){clearTimeout(timer);resolve(status)}
      });
    });
    console.log('[MarkiCab] realtime group:'+id+' status:',st);
    colState.channel=ch;
    if(colState.poll)clearInterval(colState.poll);
    // Safety net: same reconciliation path, not a parallel set of fetches.
    colState.poll=setInterval(()=>{ if(colState.group&&colState.group.id===id) reconcileTrip('poll'); },5000);
    installSyncRecovery();
    if(fresh&&trip&&trip.items){
          const agenda=trip.items.filter(i=>i.title&&i.title.trim());
          if(agenda.length){
            const rows=agenda.map(i=>({group_id:id,title:i.title.trim(),note:i.note||'',link:i.link||'',date:i.date||'',time:i.time||'',budget:Number(i.budget)||0}));
            const {error:ce}=await API.addItemsBatch(rows);
            if(ce)console.warn('[MarkiCab] copy agenda failed:',ce.message);
          }
        }
        if(fresh&&trip&&trip.expenses){
          const expenses=trip.expenses.filter(x=>x.name&&x.name.trim());
          if(expenses.length){
            const rows=expenses.map(x=>({group_id:id,name:x.name.trim(),amount:Number(x.amount)||0,category:x.category||'',note:x.note||'',date:x.date||''}));
            const {error:xe}=await API.addExpensesBatch(rows);
            if(xe)console.warn('[MarkiCab] copy expenses failed:',xe.message);
          }
        }
    // Permissions must be resolved BEFORE anything permission-gated renders:
    // the wishlist's '+ Jadwalkan' and the itinerary edit controls read
    // canEditTrip(), which was still false when they rendered first.
    const permsRes=await API.getTripPermissions(id);
    // PHASE 6 INVARIANT: Distinguish RPC failure from "no permissions".
    // On error, preserve previous perms (don't silently downgrade Creator/Member).
    if (permsRes && permsRes.error && !permsRes.data) {
      console.warn('[MarkiCab] getTripPermissions failed:', permsRes.error.message);
      // Keep previous perms; if first load, default to no permissions
      colState.perms = colState.perms || null;
    } else {
      colState.perms = (permsRes && permsRes.data) || null;
    }
    await loadShared(id);await loadMembers(id);await loadGroupExpenses(id);
    await loadIdentities(id);   // P0.7: canonical names before anything renders them
    if (document.getElementById('groupWishList')) { await loadWishlists(id); }
    if (typeof window.renderGroupPlanner === "function") window.renderGroupPlanner();
    applyPermsUI();
  }
  async function loadShared(id){ return window.MarkiSync.loadShared(id); }
  async function loadMembers(id){ return window.MarkiSync.loadMembers(id); }
  // ═════════════════════════════════════════════════════════════════════════
  //  M2 Reconciliation Safety Net
  //  Fires after the realtime channel has been established, so it's the LAST
  //  fetch — not the FIRST. Guarantees eventual consistency after any period of
  //  offline/realtime-down time WITHOUT racing the initial snapshot.
  // ═════════════════════════════════════════════════════════════════════════
  async function reconcileTrip(reason){
    if(!colState.group)return;
    const id=colState.group.id;
    await loadShared(id);
    await loadMembers(id);
    await loadGroupExpenses(id);
    await loadIdentities(id);
    if(document.getElementById('groupWishList'))await loadWishlists(id);
    if(typeof window.renderGroupPlanner==='function')window.renderGroupPlanner();
    applyPermsUI();
  }

  function installSyncRecovery(){
    if(!colState.group||colState.group.id!==colState.group.id)return;
    // Page-visible + connected polling: picks up server-side template events
    // (invite redemptions, device joins) missed during realtime downtime.
    if(colState.poll) clearInterval(colState.poll);
    colState.poll=setInterval(async()=>{
      try{
        if(!document.hidden && typeof Supabase !== 'undefined' && API._getSb().getTransport() === Supabase.ReceptionTypes)
        await reconcileTrip('poll');
      }catch(e){console.warn('[recover] poll error:',e)}
    },5000);
  }

  function routeReconcile(){
    if(!colState.group){
      // Digest still arrived after the group session closed — safe to ignore.
      return;
    }
    reconcileTrip('dispatch');
  }
  async function loadGroupExpenses(id){return window.MarkiSync.loadGroupExpenses(id)}

  async function loadWishlists(id){
    const wl = document.getElementById('groupWishList');
    if (!wl) return;
    showLoading(wl, 'Memuat wishlist...');
    const { data, error } = await API.listWishlists(id);
    colState.wishlists = error ? [] : (Array.isArray(data) ? data : (data ? [data] : []));
    if (typeof window.renderGroupWishlist === "function") window.renderGroupWishlist();
  }

  function renderGroupWishlist(){
    const wl = document.getElementById('groupWishList');
    if (!wl) return;
    const canConvert = canEditItinerary();
    const pending = (colState.wishlists || []).filter(w => w.status === 'suggested');
    const history = (colState.wishlists || []).filter(w => w.status !== 'suggested');
    let html = '';
    if (pending.length){
      html += '<div class="section-head"><div><h3>Group Wishlist</h3><div class="muted" style="font-size:12px">Ide tempat dari anggota. Creator yang memutuskan masuk itinerary.</div></div></div>';
      html += '<div class="wishlist-list">';
      html += pending.map(w => `<article class="to-go-item">
        <div class="to-go-copy">
          <div class="to-go-icon">\u{1F3E0}</div>
          <div class="to-go-text">
            <div class="to-go-name">${esc(w.name || w.title || '')}</div>
            <div class="to-go-sub">oleh ${esc(resolveIdentity(w.suggested_by)) || '?'} · ${esc(w.reason || '')}</div>
          </div>
        </div>
        <div class="to-go-actions">
          <button class="btn-tertiary" data-add-wish="${w.id}">+ Masuk itinerary</button>
          <button class="btn-text" data-dismiss-wish="${w.id}">Sembunyikan</button>
        </div>
      </article>`).join('');
      html += '</div>';
    }
    if (history.length){
      html += '<div class="section-head"><div><h3>Masuk itinerary</h3></div></div>';
      html += '<div class="wishlist-list">';
      html += history.map(w => `<article class="to-go-item">
        <div class="to-go-copy">
          <div class="to-go-icon">\u{1F3E0}</div>
          <div class="to-go-text">
            <div class="to-go-name">${esc(w.name || w.title || '')}</div>
            <div class="to-go-sub">oleh ${esc(resolveIdentity(w.suggested_by)) || '?'}</div>
          </div>
        </div>
      </article>`).join('');
      html += '</div>';
    }
    if(!pending.length&&!history.length){
      html += '<div class="empty">Belum ada ide dari anggota.</div>';
    }
    wl.innerHTML = html;
    wl.querySelectorAll('[data-add-wish]').forEach(btn=>btn.onclick=()=>{
      const id=btn.dataset.addWish;
      if(canConvert){
        const w=colState.wishlists.find(x=>x.id===id);
        if(w){addWishlistToItinerary(w)}
      }else{alert('Hanya creator yang bisa memasukkan ide ke itinerary.')}
    });
    wl.querySelectorAll('[data-dismiss-wish]').forEach(btn=>btn.onclick=async()=>{
      const id=btn.dataset.dismissWish;
      await API.dismissWishlist(id);
      await loadWishlists(colState.group.id);
    });
  }

  function addWishlistToItinerary(w){
    const trip=getTrip();
    if(!trip)return;
    const existing=trip.items.find(i=>i.title===w.name||i.link===w.link);
    if(!existing){
      trip.items.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),date:state.activeDate,title:w.name,note:w.reason||'',link:w.link||'',budget:0});
      save();
      syncTrip(trip);
      renderPlanner();
    }
  }

  // ── Canonical identity ────────────────────────────────────
  // ONE source of truth for names, used by Crew, Journey markers, itinerary
  // authors and wishlist suggested_by. Rules:
  //   display name = the user's own name, nothing else
  //   role         = Trip Creator / Guest / Member   (metadata, NOT the name)
  //   status       = Online / Offline / Tidak berbagi (metadata, NOT the name)
  // Words like 'Creator', 'Guest', 'anggota', 'member' or 'kamu' must never be
  // substituted for a real display name.
  function seedIdentities(rows){
    if(!rows || !rows.length) return;
    colState.nameMap = colState.nameMap || {};
    rows.forEach(function(r){
      if(!r) return;
      var uid = r.user_id || r.uid;
      var nm  = r.display_name || r.name;
      if(uid && nm) colState.nameMap[uid] = nm;
    });
  }

  function isPlaceholderName(name){
    if(!name) return true;
    var t=name.trim();
    return !t||t==='-'||t==='nama'||t==='Nama'||t.toLowerCase()==='guest'||/^guest\d*$/.test(t)||t==='Penyusun'||t.length<2;
  }

  async function loadIdentities(id){
    colState.identities = colState.identities || {};
    try{
      const res = await API.getGroupMembers(id);
      if(!res || res.error || !res.data) return;
      seedIdentities(res.data);
      resolveIdentity.cache = null;
    }catch(e){console.warn('[identity] load failed:',e)}
  }

  var resolveIdentity=(function(){
    var cache=null;
    return function(uid){
      if(uid===undefined||uid===null)return null;
      uid=String(uid);
      if(cache&&cache[uid])return cache[uid];
      if(!colState.nameMap||cache!==colState.nameMap){
        cache=colState.nameMap||{};
      }
      if(cache[uid])return cache[uid];
      // Fallback to email prefix (server-rounded names may be missing)
      if(!cache[uid]&&uid&&colState.nameMap){
        var u=uid.toLowerCase();
        // Try to find by email pattern (this is a best-effort fallback)
        for(var k in colState.nameMap){
          if(k.toLowerCase()===u)return colState.nameMap[k];
        }
      }
      return null;
    };
  })();

  const AVATAR_TTL=24*60*60*1000; // 24h
  var _avatarCache={};
  function avatarUrlFor(uid){
    if(!uid)return null;
    uid=String(uid);
    var now=Date.now();
    if(_avatarCache[uid]&&_avatarCache[uid].expires>now)return _avatarCache[uid].url;
    // Attempt to derive from colState (if members have avatar_url)
    if(colState.members&&colState.members[uid]){
      var m=colState.members[uid];
      if(m&&m.avatar_url){
        _avatarCache[uid]={url:m.avatar_url,expires:now+AVATAR_TTL};
        return m.avatar_url;
      }
    }
    // Fallback: initials-based SVG (generated by the main planner)
    return null;
  }
  function ensureAvatarUrls(){
    if(!colState.members)return;
    var newMap={};
    for(var uid in colState.members){
      newMap[uid]=avatarUrlFor(uid);
    }
    colState.avatarUrls=newMap;
  }
  function avatarChip(uid){
    var url=avatarUrlFor(uid);
    if(url){
      return '<div class="avatar-chip" style="background-image:url('+esc(url)+')"></div>';
    }
    var nm=resolveIdentity(uid);
    if(nm&&nm!=='Penyusun'){
      return '<div class="avatar-chip initials">'+esc(nm.charAt(0).toUpperCase())+'</div>';
    }
    if(!nm){
      return '<div class="avatar-chip initials muted">?</div>';
    }
    return '<div class="avatar-chip text">'+esc(nm.charAt(0).toUpperCase())+'</div>';
  }

  function locationStatusOf(userId){
    if(!colState.crewLocations||!colState.crewLocations.length)return 'Tidak berbagi';
    var loc=colState.crewLocations.find(l=>l.user_id===userId||String(l.user_id)===String(userId));
    if(!loc)return 'Tidak berbagi';
    if(loc.status==='online')return 'Online';
    if(loc.status==='offline')return 'Offline';
    return 'Tidak berbagi';
  }
  function nameOfOrNull(userId){
    if(!userId)return null;
    return resolveIdentity(userId);
  }
  function nameOf(userId){
    var n=nameOfOrNull(userId);
    return n||'Tamu';
  }
  function roleLabelOf(userId){
    // Return the role label, never substitute for display name.
    if(!colState.group||!colState.group.created_by)return 'Member';
    if(String(colState.group.created_by)===String(userId))return 'Trip Creator';
    if(colState.perms&&colState.perms.members&&colState.perms.members[userId]==='guest')return 'Guest';
    return 'Member';
  }

  // ── colState journey init (Script 1 portion only — NOT the journey functions) ──
  colState.journey = null;

  // ── Distance / freshness helpers ─────────────────────────
  function isFreshLocation(m){
    if(!m||!m.timestamp)return false;
    return Date.now()-m.timestamp<120000;
  }
  function distanceMeters(a,b){
    if(a.lat===undefined||a.lng===undefined||!b||!b.lat||!b.lng)return null;
    var R=6371000;
    var dLat=(b.lat-a.lat)*Math.PI/180;
    var dLon=(b.lng-a.lng)*Math.PI/180;
    var aa=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
    var c=2*Math.atan2(Math.sqrt(aa),Math.sqrt(1-aa));
    return R*c;
  }
  function fmtDistance(m){
    if(m===null||m===undefined)return '';
    if(m<1000)return m.toFixed(0)+' m';
    return (m/1000).toFixed(1)+' km';
  }

  // ── Group agenda / expense editors ────────────────────────
  async function addGroupAgenda(event){
    event.preventDefault();
    const g=colState.group;
    if(!g)return;
    const {error}=await API.addItem({
      group_id:g.id,
      title:$('groupAgendaTitle').value.trim(),
      time:$('groupAgendaTime').value,
      link:normalizeLink($('groupAgendaLink').value),
      note:$('groupAgendaNote').value.trim(),
      date:colState.activeDate||(colState.group&&daysBetween(String(colState.group.start_date||''),String(colState.group.end_date||''))[0])||'',
      budget:Number($('groupAgendaBudget').value)||0,
      created_by:colState.uid
    });
    if(error)alert('Gagal: '+humanErr(error));
    else{
      $('groupAgendaForm').reset();
      $('groupAgendaForm').parentElement.open=false;
      await loadShared(g.id);
    }
  }
  async function addGroupExpense(event){
    event.preventDefault();
    const g=colState.group;
    if(!g)return;
    const typeEl=document.querySelector('input[name="groupExpenseType"]:checked');
    const type=(typeEl&&typeEl.value==='personal')?'personal':'trip';
    const payer=type==='personal'?'':($('groupExpensePayer').value||'');
    const {error}=await API.addExpense({
      group_id:g.id,
      name:$('groupExpenseName').value.trim(),
      amount:Number($('groupExpenseAmount').value)||0,
      category:$('groupExpenseCategory').value,
      note:$('groupExpenseNote').value.trim(),
      date:colState.activeDate||'',
      paid_by:payer||null,
      type:type
    });
    if(error)alert('Gagal: '+humanErr(error));
    else{
      $('groupExpenseForm').reset();
      $('groupExpensePayer').innerHTML='<option value="">— saya —</option>';
      populatePayerSelect();
      updateExpTypeUI();
      $('groupExpenseForm').parentElement.open=false;
      await loadGroupExpenses(g.id);
    }
  }
  // addGroupWish removed 2026-09-15: dead code since the groupWishForm IDs vanished from
  // markup (it would have crashed on $('groupWishTitle').value). The live path is
  // addWishlist, wired to #groupWishlistForm.
  async function editGroupTime(el){
    const id=el.dataset.gtime;
    const it=colState.items.find(i=>i.id===id);
    if(!it)return;
    const input=document.createElement('input');
    input.type='time';
    input.className='inline-edit';
    input.value=it.time||'';
    el.replaceWith(input);
    input.focus();
    if(input.showPicker)input.showPicker();
    const commit=async()=>{
      const v=input.value.trim();
      await API.updateItem(id,{time:v});
      await loadShared(colState.group.id);
    };
    input.onblur=commit;
    input.onkeydown=e=>{
      if(e.key==='Enter')input.blur();
      if(e.key==='Escape')loadShared(colState.group.id);
    };
  }
  async function editGroupCost(el){
    const id=el.dataset.gcost;
    const it=colState.items.find(i=>i.id===id);
    if(!it)return;
    const input=document.createElement('input');
    input.type='number';
    input.className='inline-edit';
    input.value=it.budget||0;
    el.replaceWith(input);
    input.focus();
    const commit=async()=>{
      const v=input.value.trim();
      await API.updateItem(id,{budget:Number(v)||0});
      await loadShared(colState.group.id);
    };
    input.onblur=commit;
    input.onkeydown=e=>{
      if(e.key==='Enter')input.blur();
      if(e.key==='Escape')loadShared(colState.group.id);
    };
  }
  async function removeGroupItem(id){await API.deleteItem(id)}
  async function removeGroupExpense(id){await API.deleteExpense(id)}
  async function leaveGroup(){
      const g = colState.group;
      if(!g) return;
      const gid = g.id;
      if(colState.perms && colState.perms.is_owner){
        if(!(await window.mcConfirm('Hapus trip ini secara permanen? Tindakan tidak bisa dibatalkan.')))return;
        const { error }=await API.deleteGroup(gid);
        if(error){ alert('Gagal: '+humanErr(error)); return; }
      } else {
        if(!(await window.mcConfirm('Keluar dari trip ini?')))return;
        const { error }=await API.leaveGroup(gid, colState.uid);
        if(error){ alert('Gagal: '+humanErr(error)); return; }
      }
      // Remove from local state
      state.trips = state.trips.filter(t => t.groupId !== gid && t.serverId !== gid);
      save();
      navigateHome("teardown+home");
    }

  async function teardownGroupSession(){ return window.MarkiSync.teardownGroupSession(); }

  // ── M4.2 Route (HIDDEN — UI removed, backend preserved for future) ──
  // ── M4.2 Route (HIDDEN — UI removed, backend preserved for future) ──
  async function loadRoute(groupId){
    if(!document.getElementById('routePanel')) return; // route hidden
    if(!groupId||!colState.group) return;
    const list=$('routeList');
    showLoading(list, 'Memuat route...');
    const {data}=await API.getRoute(groupId);
    colState.route=(data&&data.data)||data||null;
    if(colState.route && typeof colState.route.waypoints==='string'){
      try{ colState.route.waypoints=JSON.parse(colState.route.waypoints); }catch(e){ colState.route.waypoints=[]; }
    }
    renderRoute();
  }