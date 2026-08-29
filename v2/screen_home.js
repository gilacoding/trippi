function saveProfile() {
  var name = document.getElementById('profileNameInput').value.trim();
  var banned = ['guest','creator','owner','member','anggota','kamu','user','anonymous','tanpa nama'];
  var error = document.getElementById('profileNameError');
  var input = document.getElementById('profileNameInput');
  if (name.length < 2) {
    error.textContent = 'Nama terlalu minimal (minimal 2 karakter).';
    error.style.display = 'block';
    input.classList.add('error');
    return;
  }
  if (name.length > 40) {
    error.textContent = 'Nama terlalu panjang (maksimal 40 karakter).';
    error.style.display = 'block';
    input.classList.add('error');
    return;
  }
  if (banned.indexOf(name.toLowerCase()) !== -1) {
    error.textContent = 'Nama ini tidak bisa digunakan.';
    error.style.display = 'block';
    input.classList.add('error');
    return;
  }
  error.style.display = 'none';
  input.classList.remove('error');
  document.getElementById('profileName').textContent = name;
  document.getElementById('headerAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('profileAvatarText').textContent = name.charAt(0).toUpperCase();
  showToast('Tersimpan ✓');
}
