function renderProfile(){
  updateProfileCharCount();
  // Trigger avatar edit overlay visibility
  var avatar=document.getElementById('profileAvatar');
  if(avatar){
    avatar.dispatchEvent(new Event('mouseenter'));
  }
}
