const puppeteer = require('puppeteer-core');
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
(async()=>{
  const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const browser = await puppeteer.launch({executablePath:CHROME,headless:true,args:['--no-sandbox','--disable-gpu','--window-size=1280,800']});
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(30000);
  var logs=[], failCount=0;
  function log(msg){logs.push(msg);console.log(msg);console.log('');}
  function chk(n,c,d){var s=c?'PASS':'FAIL';if(!c)failCount++;log('['+s+'] '+n+': '+d);}
  page.on('console',m=>log('[PAGE:'+m.type()+'] '+m.text()));
  page.on('pageerror',e=>log('[ERR] '+e.message));
  page.on('dialog',async d=>{var t=d.type();var m;try{m=typeof d.message==='function'?d.message():d.message;}catch(e){m='[unknown]';}log('[DIALOG] type='+t+': '+m);if(t==='confirm'||t==='prompt'){await d.accept();}else{await d.dismiss();}});
  page.on('framenavigated',async f=>log('[NAV] '+f.url()));
  // Prevent sync from reloading the page mid-test
  await page.evaluateOnNewDocument(()=>{
    window.__allowNav=false;
    window.addEventListener('beforeunload',function(e){
      if(!window.__allowNav){e.preventDefault();e.returnValue='';}
    });
  });
  function blockSync(){
    return page.evaluate(()=>{
      if(!window.MarkiSync)return;
      window.MarkiSync.onSessionReady=function(){return Promise.resolve()};
      window.MarkiSync.loadServerGroups=function(){return Promise.resolve()};
      window.MarkiSync.loadPersonalTrips=function(){return Promise.resolve()};
      window.MarkiSync.verifySync=function(){return Promise.resolve()};
    });
  }

  const email=process.env.PUPPETEER_EMAIL||'';
  const pass=process.env.PUPPETEER_PASS||'';

  log('=== STEP 1: Navigate & Login ===');
  await page.goto('https://marki.cab/trip-planner.html?mode=login',{waitUntil:'networkidle2',timeout:30000});
  await wait(3000);
  await page.type('#authEmail',email);
  await page.type('#authPassword',pass);
  await Promise.all([page.click('#authSubmit'),wait(5000)]);
  await wait(3000);
  var uid=await page.evaluate(()=>window.colState&&colState.uid);
  chk('Login',!!uid,'UID='+JSON.stringify(uid));
  await blockSync(); await wait(200);

  log('=== STEP 2: Save Dieng trip (fresh) ===');
  // If a Dieng trip already exists with dates, reset it first
  await page.evaluate(async ()=>{
    // Clean up any existing Dieng trips
    if(window.MarkiAPI && window.colState && window.colState.uid){
      var res = await window.MarkiAPI.listSavedTrips && window.MarkiAPI.listSavedTrips();
      if(res && res.data){
        for(var t of res.data){
          if((t.title||'').includes('Dieng')){
            await window.MarkiAPI.deleteSavedTrip(t.id);
          }
        }
      }
    }
  });
  await wait(1000);
  // Save fresh Dieng trip
  await page.evaluate(()=>{(window.saveExploreTrip||function(){})('dieng-weekend')});
  await wait(2000);

  log('=== STEP 3: Navigate to Saved trips ===');
  await page.evaluate(() => { if(window.goNav) window.goNav('saved'); });
  await wait(2000);
  var cards=await page.evaluate(()=>Array.from(document.querySelectorAll('#savedTripsList [data-saved]')).map(c=>({id:c.dataset.saved,text:(c.textContent||'').trim().substring(0,50)})));
  var diengCard=cards.find(c=>c.text.includes('Dieng'))||(cards[cards.length-1]||null);
  var targetId=diengCard?diengCard.id:null;
  chk('Saved Trip Card found',!!targetId,'id='+targetId);

  log('=== STEP 4: Open detail & verify 9 items + title ===');
  await page.evaluate(id=>{window.openSavedTripDetail(id);},targetId);
  await wait(800);
  // Verify via API that snapshot has 9 items
  var snapCheck=await page.evaluate(async (id)=>{
    var res=await window.MarkiAPI.getSavedTrip(id);
    if(res.error||!res.data)return{error:res.error||'no-data'};
    var snap=res.data.snapshot||{};
    return {items:(snap.items||[]).length,start:snap.start,end:snap.end};
  },targetId);
  log('Snapshot: '+JSON.stringify(snapCheck));
  chk('9 items in snapshot',snapCheck.items===9,'items='+snapCheck.items);
  // Verify rendered title
  var detail=await page.evaluate(() => {
    var t=document.getElementById('savedTripTitle');
    return {title:t?t.textContent.trim():'NONE'};
  });
  log('Title: '+detail.title);
  chk('Title is Dingin-dingin ke Dieng',detail.title==='Dingin-dingin ke Dieng','title='+detail.title);

  log('=== STEP 5: Verify all 9 item titles ===');
  var titles=await page.evaluate(()=>{var it=document.getElementById('savedTripItinerary');if(!it)return[];return Array.from(it.querySelectorAll('.item')).map(i=>{var t=i.querySelector('.item-title');return t?t.textContent.trim():'no-title';})});
  log('Rendered titles: '+JSON.stringify(titles));
  // Count across all days by also checking via click
  var allTitles=await page.evaluate(()=>{
    var btns=Array.from(document.querySelectorAll('#savedTripDayTabs .day-tab'));
    var allItems=[];
    btns.forEach(function(b){b.click();var it=document.getElementById('savedTripItinerary');if(it){allItems=allItems.concat(Array.from(it.querySelectorAll('.item')).map(i=>{var t=i.querySelector('.item-title');return t?t.textContent.trim():'no-title';}));}});
    return allItems;
  });
  log('All-day titles: '+JSON.stringify(allTitles));
  chk('All 9 items across days',allTitles.length===9,'count='+allTitles.length);
  chk('First title correct',allTitles[0]==='Sunrise di Bukit Sikunir','='+allTitles[0]);
  chk('Last title present',allTitles.includes('Makan Siang di Wonosobo'),'allTitles.length='+allTitles.length);

  log('=== STEP 6: Date edit via UI onclick ===');
  // Call startSavedDateEdit via button.onclick (bypasses click event → no form submit)
  var editRes=await page.evaluate(()=>{
    var b=document.getElementById('savedDateEditBtn');
    var sd=document.getElementById('savedTripStartDate');
    var ed=document.getElementById('savedTripEndDate');
    return {hasBtn:!!b,hasOnclick:!!(b&&b.onclick),editDisp:b?b.style.display:'NONE',saveDisp:document.getElementById('savedDateSaveBtn')?document.getElementById('savedDateSaveBtn').style.display:'NONE'};
  });
  log('Pre-edit state: '+JSON.stringify(editRes));
  // Start edit mode AND set dates in one evaluate call
  await page.evaluate(()=>{
    var b=document.getElementById('savedDateEditBtn');
    if(b&&b.onclick)b.onclick.call(b);
    document.getElementById('savedTripStartDate').value='2025-07-15';
    document.getElementById('savedTripEndDate').value='2025-07-17';
  });
  await wait(500);
  // Verify edit mode is active
  var editCheck=await page.evaluate(() => {
    return {
      saveDisp: document.getElementById('savedDateSaveBtn')?document.getElementById('savedDateSaveBtn').style.display:'NONE',
      editDisp: document.getElementById('savedDateEditBtn')?document.getElementById('savedDateEditBtn').style.display:'NONE',
      startVal: document.getElementById('savedTripStartDate')?document.getElementById('savedTripStartDate').value:'NONE',
      endVal: document.getElementById('savedTripEndDate')?document.getElementById('savedTripEndDate').value:'NONE'
    };
  });
  log('Edit mode: '+JSON.stringify(editCheck));
  chk('Edit mode active',editCheck.saveDisp!=='none' && editCheck.saveDisp!==null,'saveDisp='+JSON.stringify(editCheck.saveDisp));
  chk('Dates set in inputs',editCheck.startVal==='2025-07-15'&&editCheck.endVal==='2025-07-17','start='+editCheck.startVal+' end='+editCheck.endVal);

  // Click save button via onclick (await async function)
  var saveRes=await page.evaluate(async ()=>{
    var b=document.getElementById('savedDateSaveBtn');
    if(!b||!b.onclick){return{error:'no-save-handler'}};
    try{
      var r=b.onclick.call(b);
      if(r&&r.then){await r;}
      return{ok:true};
    }catch(e){return{error:e.message}};
  });
  log('Save result: '+JSON.stringify(saveRes));
  chk('saveSavedDateEdit executed',!saveRes.error,'error='+saveRes.error);
  await wait(3000);

  log('=== STEP 7: Verify dates after save ===');
  var datesNow=await page.evaluate(()=>{
    var sd=document.getElementById('savedTripStartDate'),ed=document.getElementById('savedTripEndDate');
    return {start:sd?sd.value:'NONE',end:ed?ed.value:'NONE'};
  });
  log('Dates now: '+JSON.stringify(datesNow));
  chk('Dates saved (start)',datesNow.start==='2025-07-15','start='+datesNow.start);
  chk('Dates saved (end)',datesNow.end==='2025-07-17','end='+datesNow.end);

  log('=== STEP 8: Reload & verify persistence ===');
  await page.evaluate(()=>{window.__allowNav=true;});
  await page.reload({waitUntil:'load',timeout:15000});
  await page.evaluate(()=>{window.__allowNav=false;});
  await wait(8000);
  await blockSync(); await wait(300);
  await page.evaluate(() => { if(window.goNav) window.goNav('saved'); });
  await wait(2000);
  cards=await page.evaluate(()=>Array.from(document.querySelectorAll('#savedTripsList [data-saved]')).map(c=>({id:c.dataset.saved,text:(c.textContent||'').trim().substring(0,50)})));
  diengCard=cards.find(c=>c.text.includes('Dieng'))||(cards[cards.length-1]||null);
  targetId=diengCard?diengCard.id:null;
  if(!targetId){chk('Find card after reload',false,'no card');}
  else{
    // Verify via API
    var snapAfter=await page.evaluate(async (id)=>{
      var res=await window.MarkiAPI.getSavedTrip(id);
      if(res.error||!res.data)return{error:res.error||'no-data'};
      var snap=res.data.snapshot||{};
      return {items:(snap.items||[]).length,start:snap.start,end:snap.end};
    },targetId);
    log('After reload snapshot: '+JSON.stringify(snapAfter));
    chk('Items persist in snapshot',snapAfter.items===9,'items='+snapAfter.items);
    chk('Dates persist in snapshot (start)',snapAfter.start==='2025-07-15','start='+snapAfter.start);
    chk('Dates persist in snapshot (end)',snapAfter.end==='2025-07-17','end='+snapAfter.end);
    // Also open detail view
    await page.evaluate(id=>{window.openSavedTripDetail(id);},targetId);
    await wait(800);
    var dr=await page.evaluate(()=>{
      var t=document.getElementById('savedTripTitle');
      var sd=document.getElementById('savedTripStartDate');
      var ed=document.getElementById('savedTripEndDate');
      return {title:t?t.textContent.trim():'NONE',start:sd?sd.value:'NONE',end:ed?ed.value:'NONE'};
    });
    log('Detail view: '+JSON.stringify(dr));
    chk('Title correct after reload',dr.title==='Dingin-dingin ke Dieng','title='+dr.title);
    chk('Dates show in detail view',dr.start==='2025-07-15'&&dr.end==='2025-07-17','start='+dr.start+' end='+dr.end);
  }

    log('=== STEP 9: Gunakan sebagai trip baru ===');
  if(targetId){
    // Re-open detail
    await page.evaluate(id=>{window.openSavedTripDetail(id);},targetId);
    await wait(800);
    // Check mcConfirm state and override it to bypass dialog
    var mcInfo=await page.evaluate(()=>{
      return {mcConfirmType:typeof window.mcConfirm,mcImplType:typeof window.mcConfirmImpl};
    });
    log('mcConfirm state: '+JSON.stringify(mcInfo));
    // Override mcConfirm to always accept (bypass confirmation dialog)
    await page.evaluate(()=>{
      window.mcConfirm=function(msg,opts){console.log('[MC] Bypassed confirm: '+(msg||''));return Promise.resolve(true);};
    });
    // Call useSavedTrip via button onclick (fire-and-forget, poll in Node)
    var gunakanRes=await page.evaluate(()=>{
      var b=document.getElementById('useSavedTripBtn');
      if(!b||!b.onclick){return{error:'no-use-handler'}};
      b.onclick.call(b);
      return{started:true};
    });
    log('Gunakan result: '+JSON.stringify(gunakanRes));
    chk('useSavedTrip triggered',!gunakanRes.error,'error='+gunakanRes.error);
    // Poll for planner items
    var grp={items:0,exists:false};
    for(var pi=0;pi<20;pi++){
      await wait(3000);
      grp=await page.evaluate(()=>{
        var g=document.getElementById('groupItineraryList');
        var gv=document.getElementById('groupPlannerView');
        var items=g?g.querySelectorAll('.item'):[];
        var activeView=document.querySelector('.view[style*="block"]');
        return {exists:!!g,items:items.length,groupViewExists:!!gv,activeView:activeView?activeView.id:'none',itemText:Array.from(items||[]).map(function(i){var t=i.querySelector('.item-title');return t?t.textContent.trim():'';}).slice(0,3)};
      });
      log('Gunakan poll '+pi+': '+JSON.stringify(grp));
      if(grp.items>=9) break;
    }
    log('Planner after Gunakan: '+JSON.stringify(grp));
    chk('Group planner has items after Gunakan',grp.items>=1,'items='+grp.items);
  }

  await browser.close();
  log('');
  log('=== SUMMARY: '+failCount+' failures ===');
  process.exit(failCount>0?1:0);
})().catch(e=>{console.error('=== CRASH ===',e.message);console.error(e.stack||'');process.exit(1);});
