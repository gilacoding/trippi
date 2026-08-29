function renderSegmentedTabs(activeTab){
  var tabs=document.querySelectorAll('.flex.gap-2.mb-3 > button');
  if(!tabs.length)return;
  tabs.forEach(function(b){
    var txt=b.textContent.trim();
    if(txt===activeTab){
      b.style.borderBottom='2px solid '+getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      b.style.color=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    }else{
      b.style.borderBottom='2px solid '+getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
      b.style.color=getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();
    }
  });
}
