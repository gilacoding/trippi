/**
 * gallery-agg.js — Gallery aggregation feature (cross-trip photo timeline).
 *
 * Extracted from trip-planner.html Script 2 (lines 4806–4903).
 *
 * Public interface:
 *   window.Gallery.init()      — one-time setup (no-op; all wiring is on-demand)
 *   window.Gallery.show()      — switch to gallery view + load aggregation
 *   window.Gallery.hide()      — hide gallery view DOM
 *   window.Gallery.destroy()    — not used (no persistent state)
 *
 * Dependencies (all via window — NO direct feature-internal imports):
 *   window.colState        — Core collaborative state
 *   window.MarkiAPI        — backend API (=== Script 1 `const API`)
 *   window.utils.esc       — pure escape utility (with fallback inside loadGalleryAgg)
 *   window.galleryLightbox — gallery-lightbox.js (in-group lightbox)
 *   window.goNav           — Navigation router
 *   window.openGroup       — Group feature (public export)
 *   window.setActiveNav    — Navigation
 *   window.show            — Core view switcher (overridden in Script 2)
 */
(function(){

  function _fmtDate(s){
    if(!s) return '';
    var m=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    var d=new Date(s); if(isNaN(d.getTime())) return s;
    return d.getDate()+' '+m[d.getMonth()]+' '+d.getFullYear();
  }
  function _fmtMonth(s){
    if(!s) return '';
    var m=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    var d=new Date(s); if(isNaN(d.getTime())) return s;
    return m[d.getMonth()]+' '+d.getFullYear();
  }

  async function loadGalleryAgg(){
    var agg=document.getElementById('galleryAgg');
    if(!agg) return;
    var _esc=window.utils?window.utils.esc:function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');};
    agg.innerHTML='<div class="gallery-agg-empty"><strong>Memuat galeri...</strong>Mencari foto dari semua trip kamu.</div>';
    try{
      var uid=window.colState.uid;
      if(!uid){ agg.innerHTML='<div class="gallery-agg-empty"><strong>Belum ada foto perjalanan.</strong>Foto yang kamu upload ke trip akan muncul di sini.</div>'; var gc=document.getElementById('galleryCount'); if(gc) gc.textContent=''; return; }
      var gres=await window.MarkiAPI.listMyGroups();
      if(gres.error||!Array.isArray(gres.data)){ agg.innerHTML='<div class="gallery-agg-empty"><strong>Galeri gagal dimuat.</strong>Coba buka panel ini lagi sebentar.</div>'; return; }
      var groups=gres.data;
      if(!groups.length){ agg.innerHTML='<div class="gallery-agg-empty"><strong>Belum ada foto perjalanan.</strong>Foto yang kamu upload ke trip akan muncul di sini.</div>'; var gc2=document.getElementById('galleryCount'); if(gc2) gc2.textContent=''; return; }
      var mediaResults=await Promise.all(groups.map(function(g){ return window.MarkiAPI.listMedia(g.id).catch(function(){ return {data:[],error:null}; }); }));
      // Filter: only current user's uploaded photos
      var trips=[];
      groups.forEach(function(g, i){
        var items=(mediaResults[i].data||[]).filter(function(it){ return it.uploader_id===uid; });
        if(items.length) trips.push({group:g, items:items});
      });
      if(!trips.length){ agg.innerHTML='<div class="gallery-agg-empty"><strong>Belum ada foto perjalanan.</strong>Foto yang kamu upload ke trip akan muncul di sini.</div>'; var gc3=document.getElementById('galleryCount'); if(gc3) gc3.textContent='0 media · 0 trip'; return; }
      // Sort trips by most recent photo date (descending)
      trips.sort(function(a,b){
        var aMax=a.items.reduce(function(m,it){ return it.created_at>m?it.created_at:m; }, '');
        var bMax=b.items.reduce(function(m,it){ return it.created_at>m?it.created_at:m; }, '');
        return bMax.localeCompare(aMax);
      });
      var totalPhotos=0, totalVideos=0;
      trips.forEach(function(t){ t.items.forEach(function(it){ if(it.mime_type&&it.mime_type.indexOf('video')===0) totalVideos++; else totalPhotos++; }); });
      var gc4=document.getElementById('galleryCount'); if(gc4) gc4.textContent=(totalPhotos+totalVideos)+' media · '+trips.length+' trip';
      // Render with year/month timeline headers
      var lastYear='', lastMonth='';
      agg.innerHTML=trips.map(function(t){
        var g=t.group;
        // Use most recent photo date for timeline grouping
        var latestDate=t.items.reduce(function(m,it){ return it.created_at>m?it.created_at:m; }, '');
        var year=latestDate?String(new Date(latestDate).getFullYear()):'';
        var month=latestDate?_fmtMonth(latestDate):'';
        var yearHeader='';
        if(year!==lastYear){ yearHeader='<div class="gallery-trip-year">'+_esc(year)+'</div>'; lastYear=year; lastMonth=''; }
        var monthHeader='';
        if(month!==lastMonth){ monthHeader='<div class="gallery-trip-month">'+_esc(month)+'</div>'; lastMonth=month; }
        var date=g.start_date&&g.end_date?_fmtDate(g.start_date)+' — '+_fmtDate(g.end_date):(g.start_date?_fmtDate(g.start_date):'');
        var textVariant='';
        if(g.name&&g.name.indexOf('Bersama')!==-1) textVariant='text-bersama';
        else if(g.name&&g.name.indexOf('Personal')!==-1) textVariant='text-personal';
        var gBadge=g.name?'<span class="trip-pill '+textVariant+'">'+_esc(g.name)+'</span>':'';
        var thumbs=t.items.slice(0,5);
        var remaining=t.items.length-5;
        var seeAll=t.items.length>5?'<button class="gt-see-all" data-group-id="'+_esc(g.id)+'">Lihat semua <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 15L12.5 10L7.5 5"/></svg></button>':'';
        return yearHeader+monthHeader+
        '<div class="gallery-trip">'+
          '<div class="gt-head">'+
            '<div><div class="gt-title">'+gBadge+'</div>'+
            '<div class="gt-date">'+date+'</div>'+
            '<div class="gt-count">'+t.items.length+' foto · '+_esc(g.destination||'')+'</div>'+
            seeAll+'</div>'+
          '</div>'+
          '<div class="gt-thumbs">'+
            thumbs.map(function(it, idx){
              var src=it.signed_url||'';
              var alt=_esc(it.caption||'');
              return '<img class="gt-thumb" src="'+_esc(src)+'" alt="'+alt+'" data-trip-idx="'+idx+'" data-group-id="'+_esc(g.id)+'" loading="lazy" '+(src?'':'style="visibility:hidden;background:var(--border)"')+'>';
            }).join('')+
            (remaining>0?'<div class="gt-more" data-group-id="'+_esc(g.id)+'">+'+remaining+'</div>':'')+
          '</div>'+
        '</div>';
      }).join('');
      // Wire lightbox + navigation
      agg.querySelectorAll('.gt-thumb').forEach(function(img){
        var tripEl=img.closest('.gallery-trip');
        var groupId=img.dataset.groupId||(tripEl?tripEl.dataset.groupId:null);
        var tripBucket=trips.filter(function(t){return t.group.id===groupId;})[0];
        img.addEventListener('click', function(e){
          e.stopPropagation();
          var idx=parseInt(this.dataset.tripIdx||'0',10);
          if(window.galleryLightbox&&tripBucket) window.galleryLightbox.open(idx, tripBucket.items);
        });
      });
      agg.querySelectorAll('.gt-more').forEach(function(el){
        el.addEventListener('click', function(){ window.goNav('trip'); window.openGroup(el.dataset.groupId, false); });
      });
      agg.querySelectorAll('.gt-see-all').forEach(function(el){
        el.addEventListener('click', function(){ window.goNav('trip'); window.openGroup(el.dataset.groupId, false); });
      });
    }catch(e){ console.error('[Gallery agg]', e); agg.innerHTML='<div class="gallery-agg-empty"><strong>Galeri gagal dimuat.</strong>Coba lagi.</div>'; }
  }

  // ── Public interface ──
  function init(){
    // No one-time wiring needed — gallery aggregation is on-demand via show().
  }

  function show(){
    window.setActiveNav('gallery');
    window.show('galleryView');
    var t=document.getElementById('globalTitle');
    if(t) t.textContent='Galeri';
    var b=document.getElementById('globalBack');
    if(b) b.style.display='none';
    loadGalleryAgg();
  }

  function hide(){
    var el=document.getElementById('galleryView');
    if(el) el.style.display='none';
  }

  function destroy(){
    // No persistent state, intervals, or channels to tear down.
  }

  // Expose public interface
  window.Gallery = { init: init, show: show, hide: hide, destroy: destroy };

  // Backward-compatible export (bridge for existing nav wiring)
  window.loadGalleryAgg = loadGalleryAgg;

  // Auto-init
  init();
})();
