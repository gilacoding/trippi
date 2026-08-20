
  const STORE_KEY='trippi_personal_planner_v2';
  const LEGACY_STORE_KEY='trippi_personal_planner_v1';
  const state={trips:[],toGo:[],activeTripId:null,activeDate:null,pendingToGoId:null,editTripId:null,readOnlyTrip:null};
  const $=id=>document.getElementById(id);
  const dbg=(msg)=>{const e=document.getElementById('debugEl');if(e){e.style.display='block';e.textContent+=(e.textContent?'\n':'')+msg+' ['+Date.now()+']';}try{console.log('[dbg]',msg)}catch{}};
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  // ── Collaborative (P2) state ──
  const API=window.TrippiAPI;
  const colState={uid:null,name:null,group:null,items:[],members:[],expenses:[],nameMap:{},activeDate:null,channel:null,poll:null};
  const loadName=()=>localStorage.getItem('trippi_display_name')||'';
  const saveName=n=>localStorage.setItem('trippi_display_name',n);
  const money=value=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value)||0);
  const dateText=value=>new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value+'T12:00:00'));
  const MIG_KEY='trippi_migration_v';
  const SYNC_VERSION=1;
  const getMig=()=>parseInt(localStorage.getItem(MIG_KEY)||'0',10)||0;
  const setMig=v=>localStorage.setItem(MIG_KEY,String(v));
  // Dual-write scheduler: localStorage write is synchronous + authoritative for render.
  // Server sync is best-effort, non-blocking, failure-tolerant (never throws to UI).
  let _syncTimer=null;
  const scheduleSync=()=>{ if(_syncTimer)clearTimeout(_syncTimer); _syncTimer=setTimeout(syncActiveTrip,400); };
  const save=()=>{ localStorage.setItem(STORE_KEY,JSON.stringify({trips:state.trips,toGo:state.toGo})); scheduleSync(); };
  function load(){try{const current=JSON.parse(localStorage.getItem(STORE_KEY)||'null');if(current){state.trips=current.trips||[];state.toGo=current.toGo||[]}else{state.trips=JSON.parse(localStorage.getItem(LEGACY_STORE_KEY)||'[]');state.toGo=[];save()}}catch{state.trips=[];state.toGo=[]}}

  // ── Guest session (M2 security patch) ──
  // Guests open an invited trip via ?gt={token}. They CANNOT create/share trips.
  // Only the trip creator can share. Guest access is read-only + scoped to the token's trip.
  let guestSession = null; // { token, trip: {...payload} } or null
  function isGuest(){ return !!guestSession; }

  async function openGuestTrip(token){
    try{
      const { data, error } = await API.getGuestTrip(token);
      if(error){ alert('Undangan tidak valid, kedaluwarsa, atau sudah dibatalkan.'); renderHome(); show('homeView'); return; }
      if(!data){ alert('Undangan tidak valid.'); renderHome(); show('homeView'); return; }
      guestSession = { token, trip: data };
      renderGuestTrip(data);
      show('groupView'); // reuse group view for read-only rendering
    }catch(e){ console.error('[guest] open failed', e); alert('Gagal membuka undangan.'); renderHome(); show('homeView'); }
  }

  function renderGuestTrip(t){
    $('groupName').textContent = t.name || 'Trip';
    $('groupMeta').textContent = [t.destination, t.start_date||'', t.end_date||''].filter(Boolean).join(' · ');
    $('groupStats').innerHTML = '';
    const ig = document.getElementById('inviteGroupBtn'); if(ig) ig.style.display='none';
    const lg = document.getElementById('leaveGroupBtn'); if(lg) lg.style.display='none';
    // M3.5: guest soft-convert CTA — "Bergabung sebagai anggota" / "Masuk / Daftar untuk bergabung"
    const joinCta = colState.uid
      ? `<button class="btn secondary small" id="guestJoinBtn" style="margin-top:8px">Bergabung sebagai anggota</button>`
      : `<button class="btn secondary small" id="guestJoinBtn" style="margin-top:8px">Masuk / Daftar untuk bergabung</button>`;
    const banner = document.getElementById('readOnlyBanner');
    if(banner){ banner.innerHTML = `Mode lihat saja — trip ini dibuka dari link bagikan.${joinCta}`; banner.style.display='block'; }
    const jb = document.getElementById('guestJoinBtn');
    if(jb) jb.onclick = async ()=>{
      if(!colState.uid){ openAuth('login'); return; }
      const token = (state.readOnlyTrip && state.readOnlyTrip.guestToken) || null;
      if(!token){ alert('Token undangan hilang. Minta pembuat trip mengirim ulang link.'); return; }
      try{ await API.redeemInvitation(token, colState.name||null); alert('Kamu sekarang anggota trip ini.'); location.reload(); }
      catch(e){ alert('Gagal bergabung: '+(e.message||e)); }
    };
    // render itinerary from payload
    const list = (t.items||[]).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    $('groupItineraryList').innerHTML = list.length
      ? list.map(i=>`<article class="agenda-item"><div class="agenda-when">${esc(i.date||'')} ${esc(i.time||'')}</div><div class="agenda-body"><div class="agenda-title">${esc(i.title)}</div>${i.note?`<div class="agenda-note">${esc(i.note)}</div>`:''}${i.link?`<a class="agenda-link" href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.link)}</a>`:''}${i.budget?`<div class="agenda-budget">${money(i.budget)}</div>`:''}</div></article>`).join('')
      : '<div class="empty">Belum ada agenda.</div>';
    // expenses
    const exp = t.expenses||[];
    $('groupExpenseList').innerHTML = exp.length
      ? exp.map(x=>`<article class="expense-item"><span class="expense-icon">${categoryIcon(x.category)}</span><div class="expense-copy"><div class="expense-name">${esc(x.name)}</div><div class="expense-meta">${esc(x.category||'')}</div></div><div class="expense-amount">${money(x.amount)}</div></article>`).join('')
      : '<div class="empty">Belum ada pengeluaran.</div>';
    // members
    $('memberList').innerHTML = (t.members||[]).map(m=>`<div class="member">${esc(m.display_name||'Anggota')}</div>`).join('') || '<div class="empty">Belum ada anggota.</div>';
    // disable add forms for guests (read-only)
    document.querySelectorAll('#groupView details').forEach(d=>d.style.display='none');
    // guests never authenticate: ensure no login modal is forced over the read-only view
    const am = document.getElementById('authModal'); if(am) am.style.display='none';
  }

  // ── M2 Sync layer (Supabase = source of truth; localStorage = cache/draft) ──
  // Guardrails: idempotent (local_id upsert), per-trip failure isolation,
  // never clears localStorage, keeps trippi_personal_planner_v2 until promoted.
  async function syncTrip(trip){
    if(!colState.uid||!trip)return;
    try{
      const sb=await API.upsertTrip({local_id:trip.id,name:trip.name,destination:trip.destination,start:trip.start,end:trip.end,note:trip.note});
      if(sb.error){console.error('[sync] trip upsert failed',sb.error);return;}
      const sbId=sb.data&&sb.data.id; if(!sbId)return;
      trip.supabase_trip_id=sbId;
      await API.upsertAgenda(sbId,trip.items||[]);
      await API.upsertExpenses(sbId,trip.expenses||[]);
      trip.synced_at=Date.now();
      // persist the mapping locally (does not clear v2)
      try{localStorage.setItem(STORE_KEY,JSON.stringify({trips:state.trips,toGo:state.toGo}));}catch{}
    }catch(e){console.error('[sync] trip sync error',e);}
  }
  async function syncActiveTrip(){
    if(!colState.uid)return;
    const t=getTrip();
    if(t&&!t.readOnlyTrip) await syncTrip(t);
  }
  // Backfill: push all local trips lacking a server id. Idempotent via local_id.
  async function backfillAndSync(){
    if(!colState.uid)return;
    const localTrips=(state.trips||[]).filter(t=>!t.supabase_trip_id);
    for(const t of localTrips){
      try{ await syncTrip(t); }catch(e){ console.error('[sync] backfill trip failed (skipped, non-fatal):',e); }
    }
    if(localTrips.length) setMig(SYNC_VERSION);
    await verifySync();
  }
  // Verify local(server-backed) vs Supabase counts; logs only (read-switch happens later).
  async function verifySync(){
    try{
      const sb=await API.countTrips();
      const sbCount=(sb.data&&typeof sb.data.count==='number')?sb.data.count:(sb.count||0);
      const localCount=(state.trips||[]).filter(t=>t.supabase_trip_id).length;
      console.log('[sync] verify local(server-backed)='+localCount+' server='+sbCount+(sbCount===localCount?' MATCH':' MISMATCH'));
    }catch(e){ console.error('[sync] verify error',e); }
  }
  // Hook: when a session appears, backfill. Preserves local-draft-before-login (only runs if uid).
  async function onSessionReady(uid){ if(uid){ colState.uid=uid; await backfillAndSync(); await loadServerGroups(); } }
  function daysBetween(start,end){const days=[];let d=new Date(start+'T12:00:00'), last=new Date(end+'T12:00:00');while(d<=last){days.push(d.toISOString().slice(0,10));d.setDate(d.getDate()+1)}return days}
  function tripStatus(trip){const today=new Date();today.setHours(0,0,0,0);const start=new Date(trip.start+'T00:00:00');start.setHours(0,0,0,0);const end=new Date(trip.end+'T00:00:00');end.setHours(0,0,0,0);if(today>end)return ['past','Selesai'];if(today>=start)return ['active','Berlangsung'];return ['upcoming','Mendatang']}
  function getTrip(){return state.readOnlyTrip||state.trips.find(t=>t.id===state.activeTripId)}
  function show(view){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));$(view).classList.add('active')}
  function openSharedTrip(trip){state.readOnlyTrip=trip;state.activeTripId=null;state.editTripId=null;state.activeDate=trip.start;renderPlanner();show('plannerView')}
  async function loadServerGroups(){
    if(!colState.uid)return;
    try{
      const { data, error } = await API.listMyGroups();
      if(error || !data || !data.length)return;
      // Map server groups into local state.trips so renderHome shows them.
      // Use server id as local id to avoid dupes; merge by id.
      const now=[...state.trips];
      data.forEach(g=>{
        const existing=now.find(t=>t.id===g.id||t.serverId===g.id);
        if(existing){
          existing.name=g.name; existing.destination=g.destination||'';
          existing.start=g.start_date||existing.start; existing.end=g.end_date||existing.end;
          existing.serverId=g.id; existing.isGroup=true; existing.role=g.role;
          existing._member_count=g.member_count; existing._item_count=g.item_count; existing._expense_total=g.expense_total;
        }else{
          now.push({id:g.id,serverId:g.id,name:g.name,destination:g.destination||'',start:g.start_date||'2026-01-01',end:g.end_date||'2026-01-01',items:[],expenses:[],isGroup:true,role:g.role,_member_count:g.member_count,_item_count:g.item_count,_expense_total:g.expense_total});
        }
      });
      state.trips=now; save(); renderHome();
    }catch(e){ console.warn('[groups] loadServerGroups failed',e); }
  }
  function renderHome(){const now=[],past=[];state.trips.forEach(t=>(tripStatus(t)[0]==='past'?past:now).push(t));now.sort((a,b)=>a.start.localeCompare(b.start));past.sort((a,b)=>b.end.localeCompare(a.end));$('upcomingCount').textContent=now.length?`${now.length} trip`:'';$('historyCount').textContent=past.length?`${past.length} trip`:'';$('upcomingTrips').innerHTML=now.length?now.map(tripCard).join(''):'<div class="empty"><strong>Belum ada trip yang direncanakan.</strong>Buat planner pertamamu untuk mulai menyusun perjalanan.</div>';$('historyTrips').innerHTML=past.length?past.map(t=>`<div class="history-card"><div><h3>${esc(t.name)}</h3><div class="trip-meta">${esc(t.destination)} · ${dateText(t.start)} — ${dateText(t.end)}</div></div><button class="btn secondary small" data-open="${t.id}">Buka</button></div>`).join(''):'<div class="empty"><strong>Belum ada riwayat.</strong>Trip yang tanggalnya lewat akan muncul di sini.</div>';document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openTrip(b.dataset.open));renderToGo()}
  function tripCard(t){const [style,label]=tripStatus(t),count=t.items?.length||0,spent=(t.expenses||[]).reduce((sum,item)=>sum+(Number(item.amount)||0),0);return `<button class="trip-card" data-open="${t.id}"><span class="state ${style}">${label}</span><h3>${esc(t.name)}</h3><div class="trip-meta">${esc(t.destination)} · ${dateText(t.start)} — ${dateText(t.end)}</div><div class="trip-summary"><span>${count} agenda</span><span>${daysBetween(t.start,t.end).length} hari</span><span>Keluar ${money(spent)}</span></div></button>`}
  function openTrip(id){state.activeTripId=id;state.readOnlyTrip=null;const trip=getTrip();state.activeDate=state.activeDate&&daysBetween(trip.start,trip.end).includes(state.activeDate)?state.activeDate:trip.start;renderPlanner();show('plannerView')}
  function renderPlanner(){const trip=getTrip();if(!trip)return;const ro=!!state.readOnlyTrip;const actions=document.querySelector('.planner-actions');if(actions)actions.style.display=ro?'none':'flex';$('readOnlyBanner').style.display=ro?'block':'none';$('addPanel').style.display=ro?'none':'';$('expensePanel').style.display=ro?'none':'';$('deleteTrip').style.display=ro?'none':'';const dates=daysBetween(trip.start,trip.end),items=trip.items||[];$('plannerName').textContent=trip.name;$('plannerMeta').textContent=`${trip.destination} · ${dateText(trip.start)} — ${dateText(trip.end)}`;$('placeTotal').textContent=items.length;$('budgetTotal').textContent=money(items.reduce((sum,item)=>sum+(Number(item.budget)||0),0));$('dayTotal').textContent=dates.length;$('dayTabs').innerHTML=dates.map((date,index)=>`<button class="day-tab ${date===state.activeDate?'active':''}" data-day="${date}">Hari ${index+1}<br><span style="font-weight:500;opacity:.8">${dateText(date).replace(/ \d{4}/,'')}</span></button>`).join('');document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{state.activeDate=b.dataset.day;renderPlanner()});const todayItems=items.filter(i=>i.date===state.activeDate).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));$('itineraryList').innerHTML=todayItems.length?todayItems.map(item=>`<article class="item"><div class="item-time" data-edit-time="${item.id}" title="Klik untuk ubah jam">${item.time||'—'}</div><div><div class="item-title">${esc(item.title)}</div><div class="item-detail">${esc(item.note)||'Belum ada catatan'}</div>${item.link?`<a class="item-link" href="${esc(item.link)}" target="_blank" rel="noopener">Buka referensi ↗</a>`:''}${Number(item.budget)?`<div class="item-cost" data-edit-cost="${item.id}" title="Klik untuk ubah biaya">${money(item.budget)}</div>`:`<div class="item-cost muted" data-edit-cost="${item.id}" title="Klik untuk ubah biaya">biaya?</div>`}</div><button class="delete-item" data-delete="${item.id}" aria-label="Hapus agenda">×</button></article>`).join(''):`<div class="empty"><strong>Hari ini masih longgar.</strong>Tambahkan tempat, transport, atau agenda yang ingin kamu ingat.</div>`;document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteItem(b.dataset.delete));document.querySelectorAll('[data-edit-time]').forEach(el=>el.onclick=()=>editInline(el,'time','time'));document.querySelectorAll('[data-edit-cost]').forEach(el=>el.onclick=()=>editInline(el,'budget','number'));renderExpenses()}
  function deleteItem(id){const trip=getTrip();const item=trip.items.find(i=>i.id===id);if(!confirm(`Hapus “${item.title}” dari itinerary?`))return;trip.items=trip.items.filter(i=>i.id!==id);save();renderPlanner()}
  function editInline(el,field,type){if(state.readOnlyTrip)return;const id=el.dataset[field==='time'?'editTime':'editCost'];const trip=getTrip();const item=trip.items.find(i=>i.id===id);if(!item)return;const input=document.createElement('input');input.type=type;input.className='inline-edit';input.value=item[field]||'';el.replaceWith(input);input.focus();if(type==='time')input.showPicker&&input.showPicker();const commit=()=>{const val=input.value.trim();if(field==='budget'&&val&&!isNaN(Number(val)))item.budget=Number(val);else if(field==='time')item.time=val;save();renderPlanner()};input.onblur=commit;input.onkeydown=e=>{if(e.key==='Enter')input.blur();if(e.key==='Escape')renderPlanner()}}
  async function addOrUpdateTrip(event){event.preventDefault();const start=$('tripStart').value,end=$('tripEnd').value;if(end<start){alert('Tanggal selesai harus sama atau setelah tanggal mulai.');return}
    if(state.editTripId){const trip=state.trips.find(t=>t.id===state.editTripId);if(!trip)return;trip.name=$('tripName').value.trim();trip.destination=$('tripDestination').value.trim();trip.start=start;trip.end=end;trip.note=$('tripNote').value.trim();state.editTripId=null;$('newTripTitle').textContent='Buat trip baru';$('newTripLead').textContent='Mulai dari tujuan dan tanggal. Detail agenda bisa kamu tambah sesudahnya.';$('newTripSubmit').textContent='Buat planner';save();event.target.reset();openTrip(trip.id);return}
    await createGroupDirectly($('tripName').value.trim(),$('tripDestination').value.trim(),start,end,$('tripNote').value.trim(),state.pendingToGoId)}
  async function createGroupDirectly(name,destination,start,end,note,pendingToGoId){const uid=await ensureAuth();if(!uid){alert('Layanan grup belum tersedia. Coba lagi nanti.');return}const { data:g,error:e }=await API.createGroup({name:name,destination:destination||'',start_date:start,end_date:end,created_by:uid});if(e){console.error('[createGroup] INSERT gagal:',e);alert('Gagal buat grup: '+e.message);return}const { error:em }=await API.joinGroup({group_id:g.id,user_id:uid,display_name:loadName()||'Guest'});if(em){console.error('[createGroup] member insert FAILED:',em);alert('Grup berhasil dibuat, tapi gagal mendaftarkan diri sebagai anggota: '+em.message);return}
colState.activeDate=null;state.pendingToGoId=null;$('selectedToGo').style.display='none';if(event&&event.target)event.target.reset();await openGroup(g.id,true);if(!colState.group||colState.group.id!==g.id){alert('Error: Gagal membuka grup. Silakan coba buat ulang.');return}history.replaceState({},'',groupLink(g.id));if(pendingToGoId){const sp=(state.toGo||[]).find(t=>t.id===pendingToGoId);if(sp){await API.addItem({group_id:g.id,date:start,title:sp.name,time:'',link:normalizeLink(sp.link||''),note:sp.note||'',budget:0,created_by:uid});await loadShared(g.id )}}}
  function normalizeLink(value){const link=value.trim();if(!link)return '';return /^https?:\/\//i.test(link)?link:'https://'+link}
  function addAgenda(event){event.preventDefault();const trip=getTrip();trip.items.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),date:state.activeDate,title:$('agendaTitle').value.trim(),time:$('agendaTime').value,budget:$('agendaBudget').value,link:normalizeLink($('agendaLink').value),note:$('agendaNote').value.trim()});save();event.target.reset();$('addPanel').open=false;renderPlanner()}
  const categoryIcon=category=>({Makan:'🍜',Transport:'🚗',Hotel:'🛏️',Tiket:'🎟️',Belanja:'🛍️',Lainnya:'•'})[category]||'•';
  function renderExpenses(){const trip=getTrip();const expenses=trip.expenses||[],dayExpenses=expenses.filter(item=>item.date===state.activeDate);const sum=list=>list.reduce((total,item)=>total+(Number(item.amount)||0),0);$('dailyExpenseTotal').textContent=money(sum(dayExpenses));$('tripExpenseTotal').textContent=money(sum(expenses));$('expenseList').innerHTML=dayExpenses.length?dayExpenses.map(item=>`<article class="expense-item"><span class="expense-icon">${categoryIcon(item.category)}</span><div class="expense-copy"><div class="expense-name">${esc(item.name)}</div><div class="expense-meta">${esc(item.category)}${item.note?` · ${esc(item.note)}`:''}</div></div><div class="expense-amount">${money(item.amount)}</div><button class="expense-delete" data-delete-expense="${item.id}" aria-label="Hapus pengeluaran">×</button></article>`).join(''):'<div class="empty"><strong>Belum ada pengeluaran hari ini.</strong>Catat saat uang benar-benar keluar.</div>';document.querySelectorAll('[data-delete-expense]').forEach(button=>button.onclick=()=>deleteExpense(button.dataset.deleteExpense))}
  function addExpense(event){event.preventDefault();const trip=getTrip();if(!trip.expenses)trip.expenses=[];trip.expenses.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),date:state.activeDate,name:$('expenseName').value.trim(),amount:$('expenseAmount').value,category:$('expenseCategory').value,note:$('expenseNote').value.trim()});save();event.target.reset();$('expensePanel').open=false;renderExpenses()}
  function deleteExpense(id){const trip=getTrip();trip.expenses=(trip.expenses||[]).filter(item=>item.id!==id);save();renderExpenses()}
  function renderToGo(){const q=($('toGoSearch').value||'').trim().toLowerCase();const list=q?state.toGo.filter(i=>(i.name||'').toLowerCase().includes(q)||(i.link||'').toLowerCase().includes(q)||(i.note||'').toLowerCase().includes(q)):state.toGo;$('toGoCount').textContent=state.toGo.length?`${state.toGo.length} tempat`:'';$('toGoSearch').style.display=state.toGo.length?'block':'none';$('toGoList').innerHTML=list.length?list.map(item=>`<article class="to-go-item"><div class="to-go-copy"><div class="to-go-name">${esc(item.name)}</div>${item.link?`<a class="to-go-source" href="${esc(item.link)}" target="_blank" rel="noopener">${esc(item.link)}</a>`:''}${item.note?`<div class="link-field">${esc(item.note)}</div>`:''}</div><div class="to-go-actions"><button class="btn small" data-schedule="${item.id}">Jadwalkan</button><button class="btn secondary small" data-remove-togo="${item.id}" aria-label="Hapus dari To Go List">×</button></div></article>`).join(''):'<div class="empty"><strong>Belum ada tempat tersimpan.</strong>Paste link atau simpan tempat yang ingin kamu datangi.</div>';document.querySelectorAll('[data-schedule]').forEach(b=>b.onclick=()=>scheduleToGo(b.dataset.schedule));document.querySelectorAll('[data-remove-togo]').forEach(b=>b.onclick=()=>{state.toGo=state.toGo.filter(item=>item.id!==b.dataset.removeTogo);save();renderToGo()})}
  function addToGo(event){event.preventDefault();state.toGo.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:$('toGoName').value.trim(),link:normalizeLink($('toGoLink').value),note:$('toGoNote').value.trim()});save();event.target.reset();$('toGoPanel').open=false;renderToGo()}
  function scheduleToGo(id){const item=state.toGo.find(x=>x.id===id);if(!item)return;state.editTripId=null;state.pendingToGoId=id;$('newTripTitle').textContent='Buat trip baru';$('newTripLead').textContent='Mulai dari tujuan dan tanggal. Detail agenda bisa kamu tambah sesudahnya.';$('newTripSubmit').textContent='Buat planner';$('selectedToGo').innerHTML=`<strong>${esc(item.name)}</strong> akan ditambahkan ke agenda hari pertama setelah trip dibuat.`;$('selectedToGo').style.display='block';show('newTripView');$('tripName').focus()}
  function editTrip(){const trip=getTrip();if(!trip||state.readOnlyTrip)return;state.editTripId=trip.id;state.pendingToGoId=null;$('selectedToGo').style.display='none';$('newTripTitle').textContent='Edit trip';$('newTripLead').textContent='Perbarui tujuan atau rentang tanggal trip ini.';$('newTripSubmit').textContent='Simpan perubahan';$('tripName').value=trip.name;$('tripDestination').value=trip.destination;$('tripStart').value=trip.start;$('tripEnd').value=trip.end;$('tripNote').value=trip.note||'';show('newTripView');$('tripName').focus()}
  async function shareGroup(){
    const gid=colState.group?colState.group.id:(getTrip()&&getTrip().groupId);
    if(!gid){
      const ok=confirm('Mulai kolaborasi?\n\nTrip ini akan dikonversi ke grup — setiap orang yang membuka link grup akan ikut otomatis dan melihat perubahan secara langsung (via realtime + polling 3 detik).');
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
      const url = location.origin + location.pathname + '?gt=' + token;
      const note='Tautan undangan tamu disalin. Siapa saja yang membukanya bisa melihat trip ini tanpa login (baca-saja). Hanya pembuat trip yang dapat membagikan.';
      if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(()=>alert(note),()=>prompt('Salin tautan ini:',url))}else{prompt('Salin tautan ini:',url)}
    }catch(e){ console.error('[share] invite failed', e); alert('Gagal membuat undangan.'); }
  }
  function copyGroupLink(id){
    let url=groupLink(id);
    const note='Link grup kolaboratif disalin. Siapa saja yang membuka link ini langsung jadi anggota grup ini.';
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(()=>alert(note),()=>prompt('Salin link ini:',url))}else{prompt('Salin link ini:',url)}
  }
  // back-compat: old #t= link still opens read-only snapshot (graceful)
  const shareTrip=shareGroup;
  // ── Collaborative backend (P2) ─────────────────────────────
  async function ensureAuth(){
    if(colState.uid)return colState.uid;
    const uid=await API.ensureAuth();
    if(uid)colState.uid=uid;
    return colState.uid;
  }
  function askName(){
    // Fallback only: name should be captured at registration. Used for pre-existing
    // accounts that registered without a name, or if localStorage name is missing.
    let n=loadName();
    while(!n||!n.trim()){n=prompt('Nama kamu di grup? (tampil ke anggota lain)');if(n===null)return null;}
    n=n.trim().slice(0,40);saveName(n);colState.name=n;return n;
  }
  function groupLink(id){return `${location.origin}${location.pathname}?group=${id}`;}
  // Convert a shared (read-only) trip into a collaborative group.
  async function makeGroupFromTrip(){
    const trip=getTrip();if(!trip)return;
    if(trip.groupId){await openGroup(trip.groupId,false,trip);return trip.groupId;}
    const uid=await ensureAuth();if(!uid){pendingAction='makeGroup';openAuth('login');return;}
    const name=askName();if(!name)return;
    const { data:g,error }=await API.createGroup({name:trip.name,destination:trip.destination||'',start_date:trip.start,end_date:trip.end,created_by:uid});
    if(error){alert('Gagal buat grup: '+error.message);return;}
    if(trip.items&&trip.items.length){
      const rows=trip.items.map(i=>({group_id:g.id,title:i.title||'',time:i.time||'',date:i.date||colState.activeDate||'',budget:Number(i.budget)||0,note:i.note||'',link:i.link||'',done:i.done||false,created_by:uid}));
      await API.addItemsBatch(rows);
    }
    if(trip.expenses&&trip.expenses.length){
      const rows=trip.expenses.map(x=>({group_id:g.id,name:x.name||'',amount:Number(x.amount)||0,category:x.category||'',note:x.note||'',date:x.date||'',created_by:uid}));
      await API.addExpensesBatch(rows);
    }
    const { error:em }=await API.joinGroup({group_id:g.id,user_id:uid,display_name:name});
    if(em){console.error('[createGroup] group_members insert failed:',em);alert('Gagal membuat anggota grup: '+em.message);return null}
    trip.groupId=g.id;save();state.activeTripId=trip.id;
    await openGroup(g.id,true,trip);
    history.replaceState({}, '', `?group=${g.id}`);
    return g.id;
  }
  async function joinGroup(id){
    dbg('joinGroup: start id='+id);
    const uid=await ensureAuth();
    if(!uid){dbg('joinGroup: ensureAuth FAILED (uid null)');pendingAction=()=>joinGroup(id);openAuth('login');return;}
    dbg('joinGroup: uid='+uid);
    let name=loadName();if(!name){name=askName();if(!name)return;}
    const { data:g }=await API.getGroup(id);
    if(!g){dbg('joinGroup: group not found in DB (RLS?)');alert('Grup tidak ditemukan.');return;}
    dbg('joinGroup: group found '+g.name);
    const { data:existing}=await API.isMember(id,uid);
    if(!existing){const {error:ee}=await API.joinGroup({group_id:id,user_id:uid,display_name:name});dbg('joinGroup: insert member '+(!ee?'OK':'ERR '+ee.message));}
    else dbg('joinGroup: already member');
    await openGroup(id,false);
  }
  async function openGroup(id,fresh,trip){
    const uid=await ensureAuth();if(!uid)return;
    const {data:g}=await API.getGroup(id);
    if(!g){alert('Grup tidak ditemukan.');return;}
    colState.group=g;colState.activeDate=null;colState.expenses=[];colState.nameMap={};
    show('groupView');
    $('groupName').textContent=g.name;
    if(colState.channel)await API._getSb().removeChannel(colState.channel);
    const ch=API._getSb().channel('group:'+id);
    ch.on('postgres_changes',{event:'*',schema:'public',table:'shared_items',filter:'group_id=eq.'+id},()=>loadShared(id))
      .on('postgres_changes',{event:'*',schema:'public',table:'group_members',filter:'group_id=eq.'+id},()=>loadMembers(id))
      .on('postgres_changes',{event:'*',schema:'public',table:'group_expenses',filter:'group_id=eq.'+id},()=>loadGroupExpenses(id));
    const st=await new Promise((resolve)=>{
      const timer=setTimeout(()=>resolve('TIMED_OUT'),8000);
      const unsub=ch.subscribe((status)=>{
        if(status==='SUBSCRIBED'){clearTimeout(timer);resolve('SUBSCRIBED')}
        else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){clearTimeout(timer);resolve(status)}
      });
    });
    console.log('[Trippi] realtime group:'+id+' status:',st);
    colState.channel=ch;
    if(colState.poll)clearInterval(colState.poll);
    colState.poll=setInterval(()=>{if(colState.group&&colState.group.id===id){loadShared(id);loadMembers(id);loadGroupExpenses(id);}},3000);
    if(fresh&&trip&&trip.items){
      const agenda=trip.items.filter(i=>i.title&&i.title.trim());
      if(agenda.length){
        const rows=agenda.map(i=>({group_id:id,title:i.title.trim(),note:i.note||'',link:i.link||'',date:i.date||'',time:i.time||'',budget:Number(i.budget)||0}));
        const {error:ce}=await API.addItemsBatch(rows);
        if(ce)console.warn('[Trippi] copy agenda failed:',ce.message);
      }
    }
    await loadShared(id);await loadMembers(id);await loadGroupExpenses(id);renderGroupPlanner();
    // M3 Phase 1: load permission matrix and apply to UI
    const permsRes=await API.getTripPermissions(id);
    colState.perms=(permsRes&&permsRes.data)||null;
    applyPermsUI();
  }
  async function loadShared(id){const { data }=await API.getItems(id);
  const ad=colState.activeDate||(colState.group&&daysBetween(String(colState.group.start_date||''),String(colState.group.end_date||''))[0])||'';
  colState.items=(data||[]).map(i=>i.date?i:{...i,date:ad});renderGroupPlanner();}
  async function loadMembers(id){const { data }=await API.getMembers(id);colState.members=data||[];colState.nameMap={};data.forEach(m=>colState.nameMap[m.user_id]=m.display_name);renderGroupPlanner();}
  async function loadGroupExpenses(id){const { data }=await API.getExpenses(id);colState.expenses=data||[];renderGroupExpenses();}
  function nameOf(uid){return (colState.nameMap&&colState.nameMap[uid])||(uid===colState.uid?'kamu':(colState.members.find(m=>m.user_id===uid)||{}).display_name||'anggota');}
  function renderGroupPlanner(){
    const g=colState.group;if(!g)return;
    const dates=daysBetween(g.start_date?String(g.start_date):'',g.end_date?String(g.end_date):'');
    if(!colState.activeDate&&dates.length)colState.activeDate=dates[0];
    $('groupName').textContent=g.name;
    $('groupMeta').textContent=`${(g.destination||'')?g.destination+' · ':''}${g.start_date?dateText(String(g.start_date)):'?'}${g.end_date?' — '+dateText(String(g.end_date)):''} · Pembuat ${creatorName()}`;
    $('groupStats').innerHTML=`<span>${colState.items.length} agenda</span><span>${dates.length} hari</span><span>${colState.members.length} anggota</span><span>Est. ${money(colState.items.reduce((s,i)=>s+(Number(i.budget)||0),0))}</span>`;
    $('groupMemberCount').textContent=colState.members.length?colState.members.length+' orang':'';
    $('groupDayTabs').innerHTML=dates.map((d,idx)=>`<button class="day-tab ${d===colState.activeDate?'active':''}" data-gday="${d}">Hari ${idx+1}<br><span style="font-weight:500;opacity:.8">${dateText(d).replace(/ \d{4}/,'')}</span></button>`).join('');
    document.querySelectorAll('[data-gday]').forEach(b=>b.onclick=()=>{colState.activeDate=b.dataset.gday;renderGroupPlanner();});
    const dayItems=colState.items.filter(i=>i.date===colState.activeDate).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
    $('groupDayTitle').textContent=`Itinerary · ${colState.activeDate?dateText(colState.activeDate):'pilih hari'} · ${dayItems.length} titik`;
    $('groupItineraryList').innerHTML=dayItems.length?dayItems.map(item=>`<article class="item">${item.link?`<div class="item-pin" title="Titik lokasi">📍</div>`:''}<div class="item-time" data-gtime="${item.id}" title="Klik ubah jam">${item.time||'—'}</div><div><div class="item-title">${esc(item.title)}</div><div class="item-detail">${esc(item.note)||'Belum ada catatan'} · <span class="by">oleh ${esc(nameOf(item.created_by))}</span></div>${item.link?`<a class="item-link" href="${esc(item.link)}" target="_blank" rel="noopener">Buka referensi ↗</a>`:''}${Number(item.budget)?`<div class="item-cost" data-gcost="${item.id}" title="Klik ubah biaya">${money(item.budget)}</div>`:`<div class="item-cost muted" data-gcost="${item.id}" title="Klik ubah biaya">biaya?</div>`}</div><button class="delete-item" data-gdel="${item.id}" aria-label="Hapus">×</button></article>`).join(''):'<div class="empty"><strong>Belum ada agenda hari ini.</strong>Tambah kegiatan bareng-bareng.</div>';
    document.querySelectorAll('[data-gtime]').forEach(el=>el.onclick=()=>editGroupTime(el));
    document.querySelectorAll('[data-gcost]').forEach(el=>el.onclick=()=>editGroupCost(el));
    document.querySelectorAll('[data-gdel]').forEach(b=>b.onclick=()=>removeGroupItem(b.dataset.gdel));
    const wish=colState.items.filter(i=>!i.date);
    $('groupWishList').innerHTML=wish.length?wish.map(item=>`<article class="to-go-item"><div class="to-go-copy"><div class="to-go-name">${esc(item.title)} <span class="by">· oleh ${esc(nameOf(item.created_by))}</span></div>${item.link?`<a class="to-go-source" href="${esc(item.link)}" target="_blank" rel="noopener">${esc(item.link)}</a>`:''}${item.note?`<div class="link-field">${esc(item.note)}</div>`:''}</div><div class="to-go-actions"><button class="btn secondary small" data-gdel="${item.id}">×</button></div></article>`).join(''):'<div class="empty">Belum ada wishlist.</div>';
    renderMembers();
    populatePayerSelect();
  }
  function renderGroupExpenses(){
    const dayExp=colState.expenses.filter(i=>i.date===colState.activeDate);
    const sum=l=>l.reduce((s,i)=>s+(Number(i.amount)||0),0);
    $('groupDailyExpense').textContent=money(sum(dayExp));
    $('groupTripExpense').textContent=money(sum(colState.expenses));
    $('groupExpenseList').innerHTML=dayExp.length?dayExp.map(item=>`<article class="expense-item"><span class="expense-icon">${categoryIcon(item.category)}</span><div class="expense-copy"><div class="expense-name">${esc(item.name)} <span class="by">· oleh ${esc(nameOf(item.created_by))}</span></div><div class="expense-meta">${esc(item.category)}${item.paid_by&&item.paid_by!==item.created_by?` · dibayar ${esc(nameOf(item.paid_by))}`:''}${item.note?` · ${esc(item.note)}`:''}</div></div><div class="expense-amount">${money(item.amount)}</div><button class="expense-delete" data-gdelexp="${item.id}">×</button></article>`).join(''):'<div class="empty"><strong>Belum ada pengeluaran hari ini.</strong>Catat saat uang keluar.</div>';
    document.querySelectorAll('[data-gdelexp]').forEach(b=>b.onclick=()=>removeGroupExpense(b.dataset.gdelexp));
  }
  // M3 Phase 2: payer select on the expense form (member list)
  function populatePayerSelect(){
    const sel=document.getElementById('groupExpensePayer'); if(!sel) return;
    const cur=sel.value;
    sel.innerHTML='<option value="">— saya —</option>'+(colState.members||[]).map(m=>`<option value="${m.user_id}">${esc(m.display_name)}${m.user_id===colState.uid?' (kamu)':''}</option>`).join('');
    if(cur) sel.value=cur;
  }
  // M3 Phase 2: Trip Identity — show creator ("Pembuat")
  function creatorName(){ const o=(colState.members||[]).find(m=>m.role==='owner'); return o?o.display_name:''; }

  /* ═══════════════════════════════════════════════════════════════════
   * M4.5 — Location Sharing UX
   * Built behind M4.3/M4.4 backend gate. NO GPS until consent + active
   * journey. Guest isolation via URL check. Frontend is display-only —
   * server-side gate in get_crew_locations() is authoritative.
   * ═══════════════════════════════════════════════════════════════════ */
  colState.journey = null;
  colState.locationConsent = null;
  colState.locationWatchId = null;
  colState.crewLocations = [];
  colState.isGuest = window.location.search.includes('gt=');

  var _crewRefresh = null;

  async function renderJourneyView(){
    if(colState.isGuest){ return; }
    const panel=document.getElementById('journeyPanel');
    if(!panel) return;
    panel.style.display='block';

    // Probe journey state: get_crew_locations applies the same 4-gate
    // admission check (auth.uid, is_group_member, active journey, consent).
    // If the journey is NOT active, it returns [] or an error.
    // We also check consent state via local cache + server probe.
    const locRes = await API.getCrewLocations();

    // Determine journey active state:
    // - If get_crew_locations returns data (even []) with no error,
    //   the user passed the admission gates → journey is active.
    // - If it errors with "no active journey", journey is not active.
    if(locRes && locRes.error && locRes.error.message && locRes.error.message.includes('no active journey')){
      colState.journey = {status:'planned'};
      colState.crewLocations = [];
    } else if(locRes && locRes.data){
      colState.journey = {status:'active'};
      colState.crewLocations = locRes.data;
    } else {
      colState.journey = {status:'planned'};
      colState.crewLocations = [];
    }

    // Consent state: check local cache (server is authoritative on actual writes)
    colState.locationConsent = _checkConsent();

    renderJourneyContent();

    if(colState.journey.status === 'active'){
      loadCrewMap();
      startCrewRefresh();
      // If owner/consENT, start location watch
      if(colState.locationConsent === 'granted' && !colState.locationWatchId){
        startLocationWatch();
      }
    } else {
      stopCrewRefresh();
      stopLocationWatch();
    }
  }

  function renderJourneyContent(){
    const isOwner = colState.perms && colState.perms.is_owner;
    const active = colState.journey && colState.journey.status === 'active';
    const hasConsent = colState.locationConsent === 'granted';
    const html=[];

    // Journey Mode banner — owner controls start/end
    if(isOwner){
      if(active){
        html.push('<div class="journey-controls"><span class="journey-badge active"><span class="dot on"></span>Journey Mode aktif</span><button class="btn secondary small" id="endJourneyBtn">📍 End Journey</button></div>');
      } else {
        html.push('<div class="journey-controls"><span class="journey-badge inactive"><span class="dot off"></span>Journey Mode mati</span><button class="btn small" id="startJourneyBtn">Mulai Journey Mode</button></div>');
      }
    } else {
      var _bCls = active ? 'active' : 'inactive';
      var _dCls = active ? 'on' : 'off';
      var _lbl = active ? ('Journey Mode aktif (oleh ' + esc(creatorName()) + ')') : 'Journey Mode belum dimulai';
      html.push('<div class="journey-controls"><span class="journey-badge ' + _bCls + '"><span class="dot ' + _dCls + '"></span>' + _lbl + '</span></div>');    }

    // Consent banner — members opt in; guests see nothing
    if(active && !colState.isGuest){
      if(!hasConsent){
        html.push('<div class="consent-banner" id="consentBanner"><p>Share your live location with this trip crew while Journey Mode is active.</p><div class="consent-actions"><button class="btn small" id="shareLocationBtn">Share my location</button><button class="btn secondary small" id="denyLocationBtn">Not now</button></div></div>');
      } else {
        html.push('<div class="consent-banner consent-denied" id="consentBanner"><p>📍 Sedang membagikan lokasi ke grup.</p><div class="consent-actions"><button class="btn secondary small" id="stopSharingBtn">Stop sharing</button></div></div>');
      }
    }

    // Crew map — shown when journey active + consent granted
    html.push('<div id="crewMapContainer" style="display:' + (active && hasConsent ? 'block' : 'none') + ';margin-top:16px"><div class="section-head"><h2>Petualangan Grup</h2><span class="count" id="crewStatus"></span></div><div id="crewMap" style="width:100%;height:280px;border:1px solid var(--line);border-radius:14px;background:var(--surface2);position:relative;overflow:hidden"></div><div class="empty" id="crewEmpty" style="margin-top:12px">Belum ada lokasi anggota yang tersedia.</div></div>');

    const jc = document.getElementById('journeyContent');
    if(jc) jc.innerHTML = html.join('');

    // Wire buttons
    var sb = document.getElementById('startJourneyBtn');
    if(sb) sb.onclick = startJourneyMode;
    var eb = document.getElementById('endJourneyBtn');
    if(eb) eb.onclick = endJourneyMode;
    var sh = document.getElementById('shareLocationBtn');
    if(sh) sh.onclick = shareLocationHandler;
    var dn = document.getElementById('denyLocationBtn');
    if(dn) dn.onclick = denyLocationHandler;
    var ss = document.getElementById('stopSharingBtn');
    if(ss) ss.onclick = stopSharingHandler;

    updateCrewStatus();
  }

  // ── Journey Mode control (owner) ──────────────────────────
  async function startJourneyMode(){
    const res = await API.startJourney();
    if(res.error){ alert('Gagal memulai Journey: ' + (res.error.message || res.error)); return; }
    colState.journey = {status:'active'};
    setTimeout(renderJourneyView, 500);
  }

  async function endJourneyMode(){
    const res = await API.endJourney();
    if(res.error){ alert('Gagal mengakhiri Journey: ' + (res.error.message || res.error)); return; }
    colState.journey = {status:'planned'};
    stopLocationWatch();
    stopCrewRefresh();
    hideCrewMap();
    renderJourneyView();
  }

  // ── Member consent banner ─────────────────────────────────
  async function shareLocationHandler(){
    if(!navigator.geolocation){
      colState.locationConsent = 'denied';
      alert('Browser Anda tidak mendukung geolokasi.');
      return;
    }
    // 1. Server-side consent (M4.3 security gate)
    const res = await API.grantLocationConsent();
    if(res.error){ alert('Consent gagal: ' + (res.error.message || res.error)); return; }
    colState.locationConsent = 'granted';
    _setConsent('granted');

    // 2. Browser permission dialog
    navigator.geolocation.getCurrentPosition(
      function(pos){
        API.upsertMemberLocation(
          pos.coords.latitude, pos.coords.longitude,
          pos.coords.accuracy || 0,
          pos.coords.heading || null,
          pos.coords.speed || null
        );
        startLocationWatch();
        renderJourneyView();
      },
      function(err){
        colState.locationConsent = 'denied';
        alert('Geolokasi ditolak: ' + err.message);
        renderJourneyView();
      },
      {enableHighAccuracy: true, timeout: 10000, maximumAge: 30000}
    );
  }

  async function denyLocationHandler(){
    const res = await API.revokeLocationConsent();
    colState.locationConsent = 'denied';
    renderJourneyView();
  }

  async function stopSharingHandler(){
    await API.revokeLocationConsent();
    stopLocationWatch();
    colState.locationConsent = 'denied';
    hideCrewMap();
    renderJourneyView();
  }

  // ── Browser geolocation with adaptive heartbeat ─────────
  function startLocationWatch(){
    if(colState.locationWatchId) return;
    if(!colState.journey || colState.journey.status !== 'active') return;
    if(colState.locationConsent !== 'granted') return;

    var lastPos = null, lastSent = 0;
    colState.locationWatchId = navigator.geolocation.watchPosition(
      function(pos){
        var now = Date.now();
        var moved = lastPos
          ? Math.sqrt(
              Math.pow(pos.coords.latitude - lastPos.latitude, 2) +
              Math.pow(pos.coords.longitude - lastPos.longitude, 2)
            ) > 0.0001
          : true;
        var minInterval = moved ? 30000 : 300000;
        if(moved || now - lastSent > minInterval){
          lastPos = {latitude: pos.coords.latitude, longitude: pos.coords.longitude};
          lastSent = now;
          API.upsertMemberLocation(
            pos.coords.latitude, pos.coords.longitude,
            pos.coords.accuracy || 0,
            pos.coords.heading || null,
            pos.coords.speed || null
          );
        }
      },
      function(err){
        console.warn('[M4.5] geolocation error:', err.code, err.message);
        if(err.code === err.PERMISSION_DENIED){
          colState.locationConsent = 'denied';
        }
      },
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000}
    );
  }

  function stopLocationWatch(){
    if(colState.locationWatchId && navigator.geolocation){
      navigator.geolocation.clearWatch(colState.locationWatchId);
    }
    colState.locationWatchId = null;
  }

  // ── Crew map (CSS-based markers, no external lib) ────────
  async function loadCrewMap(){
    const res = await API.getCrewLocations();
    colState.crewLocations = (res && res.data) || [];

    const map = document.getElementById('crewMap');
    const empty = document.getElementById('crewEmpty');
    if(!map || !empty) return;

    if(colState.crewLocations.length === 0){
      map.style.display = 'none';
      empty.style.display = 'block';
      empty.textContent = 'Belum ada lokasi anggota yang tersedia.';
      return;
    }

    map.style.display = 'block';
    empty.style.display = 'none';

    const meUid = colState.uid;
    var markers = colState.crewLocations.map(function(m){
      var isMe = m.user_id === meUid;
      var isStale = m.updated_at && (Date.now() - new Date(m.updated_at).getTime()) > 300000;
      var name = m.display_name || nameOf(m.user_id);
      var staleClass = isStale ? ' stale' : '';
      return '<div class="crew-member' + (isMe ? ' me' : '') + '">' +
        '<span class="crew-dot' + staleClass + '" title="' + (isMe ? 'Kamu' : name) + '"></span>' +
        '<div class="crew-info"><b>' + esc(name) + (isMe ? ' (kamu)' : '') + '</b>' +
        '<div class="crew-meta">' + (m.latlng || (m.latitude ? m.latitude + ', ' + m.longitude : 'lokasi tersembunyi')) +
        ' · ' + (m.updated_at ? 'update ' + new Date(m.updated_at).toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'}) : '') + '</div></div></div>';
    }).join('');

    map.innerHTML = markers;
    updateCrewStatus();
  }

  function hideCrewMap(){
    var c = document.getElementById('crewMapContainer');
    if(c) c.style.display = 'none';
  }

  function updateCrewStatus(){
    var el = document.getElementById('crewStatus');
    if(!el) return;
    var active = colState.journey && colState.journey.status === 'active';
    if(active){
      el.textContent = colState.crewLocations.length + ' anggota di jalan';
    } else {
      el.textContent = 'Journey belum dimulai';
    }
  }

  // ── Adaptive refresh (no-realtime fallback) ─────────────
  function startCrewRefresh(){
    if(_crewRefresh) clearInterval(_crewRefresh);
    _crewRefresh = setInterval(function(){
      if(colState.journey && colState.journey.status === 'active'){
        loadCrewMap();
      }
    }, 10000);
  }
  function stopCrewRefresh(){
    if(_crewRefresh){ clearInterval(_crewRefresh); _crewRefresh = null; }
  }

  // ── Local consent state cache (server is authoritative) ──
  function _checkConsent(){
    return localStorage.getItem('trippi_consent_' + colState.group.id) || null;
  }
  function _setConsent(v){
    localStorage.setItem('trippi_consent_' + colState.group.id, v);
  }

  function renderMembers(){ 
    $('memberList').innerHTML=colState.members.length?colState.members.map(m=>`<article class="to-go-item"><div class="to-go-copy"><div class="to-go-name">${esc(m.display_name)}${m.role==='owner'?' <span class="role-badge">Pemilik</span>':''}</div><div class="link-field">${m.user_id===colState.uid?'kamu':''}</div></div>${m.user_id!==colState.uid&&colState.perms&&colState.perms.can_manage_members?`<button class="btn secondary small remove-member" data-rm="${m.user_id}">×</button>`:''}</article>`).join(''):'<div class="empty">Belum ada anggota.</div>';
    document.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>removeMemberFromTrip(b.dataset.rm));
  }
  async function addGroupAgenda(event){event.preventDefault();const g=colState.group;if(!g)return;const {error}=await API.addItem({group_id:g.id,title:$('groupAgendaTitle').value.trim(),time:$('groupAgendaTime').value,link:normalizeLink($('groupAgendaLink').value),note:$('groupAgendaNote').value.trim(),date:colState.activeDate||(colState.group&&daysBetween(String(colState.group.start_date||''),String(colState.group.end_date||''))[0])||'',budget:Number($('groupAgendaBudget').value)||0,created_by:colState.uid});if(error)alert('Gagal: '+error.message);else{$('groupAgendaForm').reset();$('groupAgendaForm').parentElement.open=false;await loadShared(g.id);}}
  async function addGroupExpense(event){event.preventDefault();const g=colState.group;if(!g)return;const payer=$('groupExpensePayer').value||'';const {error}=await API.addExpense({group_id:g.id,name:$('groupExpenseName').value.trim(),amount:Number($('groupExpenseAmount').value)||0,category:$('groupExpenseCategory').value,note:$('groupExpenseNote').value.trim(),date:colState.activeDate||'',paid_by:payer||null});if(error)alert('Gagal: '+error.message);else{$('groupExpenseForm').reset();$('groupExpensePayer').innerHTML='<option value="">— saya —</option>';populatePayerSelect();$('groupExpenseForm').parentElement.open=false;await loadGroupExpenses(g.id);}}
  async function addGroupWish(event){event.preventDefault();const g=colState.group;if(!g)return;const {error}=await API.addItem({group_id:g.id,title:$('groupWishTitle').value.trim(),link:normalizeLink($('groupWishLink').value),note:$('groupWishNote').value.trim(),created_by:colState.uid});if(error)alert('Gagal: '+error.message);else{$('groupWishForm').reset();$('groupWishForm').parentElement.open=false;await loadShared(g.id);}}
  async function editGroupTime(el){const id=el.dataset.gtime;const it=colState.items.find(i=>i.id===id);if(!it)return;const input=document.createElement('input');input.type='time';input.className='inline-edit';input.value=it.time||'';el.replaceWith(input);input.focus();if(input.showPicker)input.showPicker();const commit=async()=>{const v=input.value.trim();await API.updateItem(id,{time:v});await loadShared(colState.group.id);};input.onblur=commit;input.onkeydown=e=>{if(e.key==='Enter')input.blur();if(e.key==='Escape')loadShared(colState.group.id);};}
  async function editGroupCost(el){const id=el.dataset.gcost;const it=colState.items.find(i=>i.id===id);if(!it)return;const input=document.createElement('input');input.type='number';input.className='inline-edit';input.value=it.budget||0;el.replaceWith(input);input.focus();const commit=async()=>{const v=input.value.trim();await API.updateItem(id,{budget:Number(v)||0});await loadShared(colState.group.id);};input.onblur=commit;input.onkeydown=e=>{if(e.key==='Enter')input.blur();if(e.key==='Escape')loadShared(colState.group.id);};}
  async function removeGroupItem(id){await API.deleteItem(id);}
  async function removeGroupExpense(id){await API.deleteExpense(id);}
  async function leaveGroup(){
    if(colState.perms&&colState.perms.is_owner){
      if(!confirm('Hapus trip ini secara permanen? Tindakan tidak bisa dibatalkan.')) return;
      const { error }=await API.deleteGroup(colState.group.id);
      if(error){ alert('Gagal: '+humanErr(error)); return; }
    } else {
      if(!confirm('Keluar dari trip ini?')) return;
      const { error }=await API.leaveGroup(colState.group.id, colState.uid);
      if(error){ alert('Gagal: '+humanErr(error)); return; }
    }
    if(colState.poll)clearInterval(colState.poll);
    if(colState.channel)await API._getSb().removeChannel(colState.channel);
    colState.group=null; renderHome(); show('homeView');
  }

  // ── M4.2 Route ─────────────────────────────────────────────────────
  async function loadRoute(groupId){
    if(!groupId||!colState.group) return;
    const {data}=await API.getRoute(groupId);
    colState.route=(data&&data.data)||data||null;
    if(colState.route && typeof colState.route.waypoints==='string'){
      try{ colState.route.waypoints=JSON.parse(colState.route.waypoints); }catch(e){ colState.route.waypoints=[]; }
    }
    renderRoute();
  }
  function renderRoute(){
    if(!colState.group){ return; }
    const route=((colState.route&&colState.route.route)||null);
    const waypoints=((colState.route&&colState.route.waypoints)||[]);
    const p=colState.perms||{};
    const canEdit=!!p.can_edit;
    const list=$('routeList');
    const createBtn=$('createRouteBtn');
    const addPanel=$('addWaypointPanel');
    if(createBtn) createBtn.style.display=(canEdit&&!route)?'':'none';
    if(addPanel) addPanel.style.display=(canEdit&&!!route)?'':'none';
    if(!route){
      list.innerHTML=canEdit?'<div class="empty"><strong>No route planned yet</strong><br>Build your journey route.<br><br><button class="btn secondary" id="createRouteEmpty">Buat route</button></div>':'<div class="empty"><strong>Route preview</strong><br>Crew belum membuat route.</div>';
      const b=$('createRouteEmpty'); if(b) b.onclick=()=>{ const br=$('createRouteBtn'); if(br) br.click(); };
      return;
    }
    const seqs=waypoints.map(w=>w.sequence).filter(Boolean);
    const first=seqs.length?Math.min(...seqs):null;
    const last=seqs.length?Math.max(...seqs):null;
    list.innerHTML=waypoints.map(w=>{
      const isFirst=(first!==null&&w.sequence===first);
      const isLast=(last!==null&&w.sequence===last);
      const cls=isFirst?'start':isLast?'end':'';
      const cat=(w.category||'').toUpperCase();
      const day=w.day_number?`Day ${w.day_number} · `:'';
      const eta=w.estimated_arrival_time?`ETA ${new Date(w.estimated_arrival_time).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})} · `:'';
      const note=w.notes?`<div class="route-meta">${esc(w.notes)}</div>`:'';
      const actions=canEdit?`<div class="route-actions"><button class="btn secondary small icon route-up" data-rid="${w.id}" ${isFirst?'disabled':''}>▲</button><button class="btn secondary small icon route-down" data-rid="${w.id}" ${isLast?'disabled':''}>▼</button><button class="btn secondary small icon route-del" data-rid="${w.id}">×</button></div>`:'';
      return `<article class="route-card"><div class="route-seq ${cls}">${String(w.sequence).padStart(2,'0')}</div><div class="route-copy"><div class="route-cat">${esc(cat)}</div><div class="route-name">${esc(w.name)}</div><div class="route-meta">${day}${eta}</div>${note}</div>${actions}</article>`;
    }).join('');
    list.querySelectorAll('.route-up').forEach(b=>b.onclick=()=>moveWaypoint(b.dataset.rid,-1));
    list.querySelectorAll('.route-down').forEach(b=>b.onclick=()=>moveWaypoint(b.dataset.rid,1));
    list.querySelectorAll('.route-del').forEach(b=>b.onclick=()=>deleteWaypoint(b.dataset.rid));
  }
  async function moveWaypoint(id,dir){
    const route=(colState.route&&colState.route.route)||null;
    const waypoints=((colState.route&&colState.route.waypoints)||[]);
    if(!route||!waypoints.length) return;
    const arr=[...waypoints].sort((a,b)=>a.sequence-b.sequence);
    const idx=arr.findIndex(w=>w.id===id);
    if(idx<0) return;
    const to=idx+dir;
    if(to<0||to>=arr.length) return;
    [arr[idx],arr[to]]=[arr[to],arr[idx]];
    const ordered=arr.map(w=>w.id);
    const {error}=await API.reorderWaypoints(route.id,ordered);
    if(error){ alert('Gagal urutkan: '+(error&&error.message||'unknown')); return; }
    await loadRoute(colState.group.id);
  }
  async function deleteWaypoint(id){
    if(!confirm('Hapus perhentian ini?')) return;
    const {error}=await API.deleteWaypoint(id);
    if(error){ alert('Gagal: '+(error&&error.message||'unknown')); return; }
    await loadRoute(colState.group.id);
  }
  function openAddWaypoint(){
    const addPanel=$('addWaypointPanel');
    if(addPanel) addPanel.open=true;
  }

  // M3 Phase 1: apply owner/member permission matrix to the group UI
  function applyPermsUI(){
    const p=colState.perms||{};
    const ig=document.getElementById('inviteGroupBtn'); if(ig) ig.style.display = p.can_invite ? '' : 'none';
    const st=document.getElementById('shareTrip'); if(st) st.style.display = p.can_invite ? '' : 'none';
    const lb=document.getElementById('leaveGroupBtn'); if(lb) lb.textContent = p.is_owner ? 'Hapus trip' : 'Keluar';
    const cr=document.getElementById('createRouteBtn'); if(cr) cr.style.display = p.can_edit ? 'none' : 'none';
  }
  async function removeMemberFromTrip(userId){
    if(!confirm('Hapus anggota ini dari trip?')) return;
    const { error }=await API.removeMember(colState.group.id, userId);
    if(error){ alert('Gagal: '+humanErr(error)); return; }
    await loadMembers(colState.group.id);
  }

  function openFromHash(){if(location.hash.startsWith('#t=')){try{const json=LZString.decompressFromEncodedURIComponent(location.hash.slice(3));const trip=JSON.parse(json);if(trip&&trip.id&&trip.name&&trip.start&&trip.end){if(!Array.isArray(trip.items))trip.items=[];if(!Array.isArray(trip.expenses))trip.expenses=[];openSharedTrip(trip);return true}}catch{}}if(location.hash.startsWith('#trip=')){try{const trip=JSON.parse(decodeURIComponent(location.hash.slice(6)));if(trip&&trip.id&&trip.name&&trip.start&&trip.end){if(!Array.isArray(trip.items))trip.items=[];if(!Array.isArray(trip.expenses))trip.expenses=[];openSharedTrip(trip);return true}}catch{}}return false}
  function exportBackup(){const backup={app:'Trippi',version:1,exportedAt:new Date().toISOString(),trips:state.trips,toGo:state.toGo};const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`trippi-backup-${new Date().toISOString().slice(0,10)}.json`;link.click();URL.revokeObjectURL(url)}
  function importBackup(file){const reader=new FileReader();reader.onload=()=>{try{const backup=JSON.parse(reader.result);if(!Array.isArray(backup.trips)||!Array.isArray(backup.toGo))throw new Error('invalid');if(!confirm(`Pulihkan ${backup.trips.length} trip dan ${backup.toGo.length} tempat? Data Trippi saat ini akan diganti.`))return;state.trips=backup.trips;state.toGo=backup.toGo;state.activeTripId=null;state.activeDate=null;save();renderHome();show('homeView');alert('Data Trippi berhasil dipulihkan.')}catch{alert('File backup tidak valid. Pilih file JSON hasil Backup data dari Trippi.')}};reader.readAsText(file)}
  $('newTripBtn').onclick=()=>{state.pendingToGoId=null;state.editTripId=null;$('selectedToGo').style.display='none';$('newTripTitle').textContent='Buat trip baru';$('newTripLead').textContent='Mulai dari tujuan dan tanggal. Detail agenda bisa kamu tambah sesudahnya.';$('newTripSubmit').textContent='Buat planner';show('newTripView')};document.querySelectorAll('[data-home]').forEach(b=>b.onclick=()=>{renderHome();show('homeView')});$('tripForm').onsubmit=addOrUpdateTrip;$('agendaForm').onsubmit=addAgenda;$('expenseForm').onsubmit=addExpense;$('toGoForm').onsubmit=addToGo;$('cancelAgenda').onclick=()=>{$('agendaForm').reset();$('addPanel').open=false};$('cancelExpense').onclick=()=>{$('expenseForm').reset();$('expensePanel').open=false};$('cancelToGo').onclick=()=>{$('toGoForm').reset();$('toGoPanel').open=false};$('exportData').onclick=exportBackup;$('importData').onclick=()=>$('importFile').click();$('importFile').onchange=event=>{if(event.target.files[0])importBackup(event.target.files[0]);event.target.value=''};$('copyTrip').onclick=async()=>{try{await navigator.clipboard.writeText(itineraryText());alert('Itinerary disalin.')}catch{alert(itineraryText())}};$('printTrip').onclick=()=>window.print();$('deleteTrip').onclick=()=>{const t=getTrip();if(confirm(`Hapus trip “${t.name}”? Data ini tidak bisa dipulihkan.`)){state.trips=state.trips.filter(x=>x.id!==t.id);save();state.activeTripId=null;renderHome();show('homeView')}};$('editTripBtn').onclick=editTrip;$('shareTrip').onclick=shareTrip;$('toGoSearch').oninput=renderToGo;
  // P2 collaborative wiring
  $('makeGroupBtn').onclick=()=>makeGroupFromTrip();
  $('inviteGroupBtn').onclick=shareGroup;
  $('leaveGroupBtn').onclick=()=>leaveGroup();
  $('groupAgendaForm').onsubmit=addGroupAgenda;
  $('cancelGroupAgenda').onclick=()=>{$('groupAgendaForm').reset();$('groupAgendaForm').parentElement.open=false};
  $('groupExpenseForm').onsubmit=addGroupExpense;
  $('cancelGroupExpense').onclick=()=>{$('groupExpenseForm').reset();$('groupExpenseForm').parentElement.open=false};
  $('groupWishForm').onsubmit=addGroupWish;
  $('cancelGroupWish').onclick=()=>{$('groupWishForm').reset();$('groupWishForm').parentElement.open=false};
  // M4.2 Route view wiring
  const _groupViewTabs=document.getElementById('groupViewTabs');
  const _routePanel=document.getElementById('routePanel');
  const _itineraryPanel=document.getElementById('itineraryPanel');
  const _expensesPanel=document.getElementById('expensesPanel');
  const _journeyPanel=document.getElementById('journeyPanel');
  if(_groupViewTabs){
    _groupViewTabs.querySelectorAll('.view-tab').forEach(btn=>{
      btn.onclick=()=>{
        _groupViewTabs.querySelectorAll('.view-tab').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const v=btn.dataset.gview;
        if(_itineraryPanel) _itineraryPanel.classList.toggle('active', v==='itinerary');
        if(_routePanel) _routePanel.classList.toggle('active', v==='route');
        if(_expensesPanel) _expensesPanel.classList.toggle('active', v==='expenses');
        if(_journeyPanel) _journeyPanel.classList.toggle('active', v==='journey');
        if(v==='route') loadRoute(colState.group.id);
        if(v==='journey') renderJourneyView();
      };
    });
  }
  $('createRouteBtn').onclick=async()=>{
    if(!colState.group) return;
    const name=colState.group.name || 'Route';
    const {data:rid,error}=await API.createRoute(colState.group.id, name);
    if(error||!rid){ alert('Gagal: '+(error&&error.message||'unknown')); return; }
    await loadRoute(colState.group.id);
    setTimeout(()=>openAddWaypoint(), 120);
  };
  $('waypointForm').onsubmit=async (event) => {
    event.preventDefault();
    const route=(colState.route&&colState.route.route)||null;
    if(!route){ alert('Buat route dulu.'); return; }
    const wp={
      name:$('wpName').value.trim(),
      category:$('wpCategory').value,
      day_number:Number($('wpDay').value)||null,
      estimated_arrival_time:$('wpEta').value?new Date('1970-01-01T'+$('wpEta').value+'Z').toISOString():null,
      notes:$('wpNotes').value.trim()||null
    };
    const {data:id,error}=await API.addWaypoint(route.id, wp);
    if(error||!id){ alert('Gagal: '+(error&&error.message||'unknown')); return; }
    $('waypointForm').reset(); $('waypointForm').parentElement.open=false;
    await loadRoute(colState.group.id);
  };
  $('cancelWaypoint').onclick=()=>{$('waypointForm').reset();$('waypointForm').parentElement.open=false};
  // M3.5: capture pending guest token so a newly-authenticated user can be
  // soft-converted into a real member of the trip they were viewing.
  var pendingGuestToken=null;
  // auto-open guest trip from ?gt={token} (M2 security patch: guest, no login)
  (async()=>{
    const gt=new URLSearchParams(location.search).get('gt');
    if(gt){ pendingGuestToken=gt; dbg('startup: guest token = '+gt.slice(0,8)+'…'); await openGuestTrip(gt); return; }
  })();

  // auto-join from ?group= share link
  (async()=>{
    const gid=new URLSearchParams(location.search).get('group');
    dbg('startup: group param = '+(gid||'none')+' search='+location.search);
    if(gid){dbg('joinGroup invoked for '+gid);try{await joinGroup(gid);dbg('joinGroup resolved g='+JSON.stringify(colState.group?{id:colState.group.id,name:colState.group.name}:null));}catch(err){console.error('[startup] joinGroup error for '+gid+':',err);dbg('joinGroup error:'+err?.message);if(colState.group){openGroup(colState.group.id,false)}else{renderHome();show('homeView');alert('Trip tidak ditemukan. UUID '+gid+' tidak valid atau grup sudah dihapus.')}}}
  })();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('trippi-sw.js').catch(()=>{});
  if(!openFromHash()){load();renderHome();}
