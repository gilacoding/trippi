/**
 * explore.js — Explore feature (curated trip discovery).
 *
 * Extracted from trip-planner.html Script 3 (lines 4978–5067).
 *
 * Public interface:
 *   window.Explore.init()      — one-time setup (currently no-op; nav wiring
 *                                is handled by the shared Navigation module)
 *   window.Explore.show()      — render explore list (opens exploreView)
 *   window.Explore.hide()      — hide explore DOM elements
 *   window.Explore.destroy()   — not used (no persistent state, intervals, or
 *                                realtime channels to tear down)
 *
 * Dependencies (all via window exports — NO direct feature-internal imports):
 *   window.show()           — Core view switcher (window.show)
 *   window.setActiveNav()   — Navigation module (public export)
 *   window.utils.esc        — pure utility
 *   window.colState         — Core collaborative state
 *   window.MarkiAPI         — backend API (= Core's API const)
 *   window.busyBtn/freeBtn  — Core button helpers
 *   window.openAuth()       — Auth module (public export)
 *   window.openSavedTrips() — Saved Trips module (public export)
 *   window.EXPLORE_CATALOG  — explore-catalog.js (pure data)
 */
(function(){
  var initialized = false;

  // ── Rendering ──────────────────────────────────────────────────────

  function openExploreView(){
    window.show('exploreView');
    window.setActiveNav('explore');
    document.getElementById('globalTitle').textContent='Jelajah';
    document.getElementById('globalBack').style.display='none';
    renderExploreList();
  }

  async function openExploreDetail(id){
    var item=null;
    (window.EXPLORE_CATALOG||[]).forEach(function(t){ if(t.id===id) item=t; });
    if(!item){ openExploreView(); return; }
    window.show('exploreDetailView');
    window.setActiveNav('explore');
    document.getElementById('globalTitle').textContent='Jelajah';
    document.getElementById('globalBack').style.display='none';
    var _esc = window.utils ? window.utils.esc : function(s){return String(s==null?'':s);};
    var days=(item.days||[]).map(function(d){
      var items=(d.items||[]).map(function(it){
        return '<div class="exp-item"><div class="exp-time">'+_esc(it.time||'')+'</div><div><div class="exp-ttl">'+_esc(it.title||'')+'</div>'+(it.note?'<div class="exp-note">'+_esc(it.note)+'</div>':'')+'</div></div>';
      }).join('');
      return '<div class="exp-day"><div class="exp-day-h"><span class="exp-day-n">Hari '+_esc(d.day)+'</span><span class="exp-day-t">'+_esc(d.title||'')+'</span></div>'+items+'</div>';
    }).join('');
    var why=(item.why||[]).map(function(w){ return '<li>'+_esc(w)+'</li>'; }).join('');
    document.getElementById('exploreDetail').innerHTML=
      '<div class="exp-nav"><button class="back" data-nav="explore"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="no"><path d="M13 4L6 10l7 6"/></svg> kembali</button></div>'+
      '<div class="exp-hero" style="background-image:url('+_esc(item.cover||'')+')"><div class="exp-hero-scrim"></div>'+
        '<div class="exp-hero-copy"><h1>'+_esc(item.title||'')+'</h1>'+
        '<div class="exp-meta">'+_esc(item.destination||'')+' · '+item.duration+' hari · '+_esc(item.type||'')+'</div></div></div>'+
      '<div class="exp-body"><p class="exp-desc">'+(item.description||'').replace(/\n/g,'<br>')+'</p>'+
      '<h2>Kenapa trip ini?</h2><ul class="exp-why">'+why+'</ul>'+
      '<h2>Rencana per hari</h2><div class="exp-days">'+days+'</div>'+
      '<div class="exp-actions"><button class="btn" id="exploreSaveBtn">Simpan trip</button></div></div>';
    var sb=document.getElementById('exploreSaveBtn');
    if(sb) sb.onclick=function(){ saveExploreTrip(item); };
  }

  async function saveExploreTrip(item){
    if(!window.colState || !window.colState.uid){ window.openAuth('login'); return; }
    var snapshot={
      name:item.title||'',
      destination:item.destination||'',
      start:null, end:null,
      note:'Dari Jelajah: '+(item.summary||''),
      items:[]
    };
    (item.days||[]).forEach(function(d){
      (d.items||[]).forEach(function(it){
        snapshot.items.push({date:null,title:it.title||'',time:it.time||'',note:it.note||'',link:'',budget:0});
      });
    });
    var btn=document.getElementById('exploreSaveBtn');
    if(btn) window.busyBtn(btn,'Menyimpan...');
    try{
      var res=await window.MarkiAPI.saveTrip({title:item.title,destination:item.destination,snapshot:snapshot});
      if(res && res.error){ alert('Gagal menyimpan: '+(res.error.message||'unknown')); return; }
      if(!res || !res.data){ alert('Gagal menyimpan: tidak ada data yang tersimpan'); return; }
      window.openSavedTrips();
    }catch(e){ alert('Gagal menyimpan: '+e.message); }
    finally{ if(btn) window.freeBtn(btn); }
  }

  function renderExploreList(){
    var list=document.getElementById('exploreList');
    if(!list) return;
    var _esc = window.utils ? window.utils.esc : function(s){return String(s==null?'':s);};
    var items=(window.EXPLORE_CATALOG||[]).slice().sort(function(a,b){ return (a.order||99)-(b.order||99); });
    if(!items.length){ list.innerHTML='<div class="empty"><strong>Belum ada trip.</strong>Katalog Jelajah masih kosong.</div>'; return; }
    list.innerHTML=items.map(function(t){
          return '<button class="trip-card has-bg" data-explore="'+t.id+'">'+
            '<span class="trip-bg" style="background-image:url('+_esc(t.cover||'')+')"></span>'+
            '<span class="state upcoming">'+_esc(t.type||'')+'</span>'+
            '<h3>'+_esc(t.title||'')+'</h3>'+
            '<div class="trip-meta">'+_esc(t.destination||'')+' · '+t.duration+' hari</div>'+
            '<div class="trip-summary"><span>'+_esc(t.summary||'')+'</span></div></button>';
        }).join('');
    list.querySelectorAll('[data-explore]').forEach(function(b){
      b.onclick=function(){ openExploreDetail(b.dataset.explore); };
    });
  }

  // ── Public interface ───────────────────────────────────────────────

  function init(){
    if(initialized) return;
    initialized = true;
    // Explore has no event listeners to wire at init time — the shared
    // Navigation module (Script 2) handles nav-tab click delegation.
    // All rendering is on-demand via show().
  }

  function show(){
    openExploreView();
  }

  function hide(){
    ['exploreView','exploreDetailView'].forEach(function(id){
      var el=document.getElementById(id);
      if(el) el.style.display='none';
    });
  }

  function destroy(){ /* no-op — no persistent state */ }

  // ── Exports ────────────────────────────────────────────────────────

  // Public interface (published BEFORE init — FeatureBootstrap guarantees
  // containment even if init throws)
  var iface = {
    Explore: { init: init, show: show, hide: hide, destroy: destroy },
    openExploreView: openExploreView,
    openExploreDetail: openExploreDetail,
    saveExploreTrip: saveExploreTrip,
    renderExploreList: renderExploreList
  };
  window.Explore = iface.Explore;
  window.openExploreView = iface.openExploreView;
  window.openExploreDetail = iface.openExploreDetail;
  window.saveExploreTrip = iface.saveExploreTrip;
  window.renderExploreList = iface.renderExploreList;

  // UMD export for headless testing
  if (typeof module !== 'undefined' && module.exports) module.exports = iface;

  // Init with failure isolation: defer to FeatureBootstrap when available,
  // fall back to bare init() (original behaviour) when it is not.
  if (typeof window !== 'undefined' && window.FeatureBootstrap) {
    window.FeatureBootstrap.register('explore', init);
  } else {
    init();
  }
})();
