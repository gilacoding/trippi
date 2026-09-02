# MarkiCab Backend (Collaboration)

Backend untuk fitur kolaborasi MarkiCab: **grup**, **shared to-do / place-to-go**,
dan **live location** antar anggota. Backend yang dipakai: **Supabase** (Postgres + Realtime + Auth).

## Status
- **M0 (fondasi):** skema SQL + verifikasi CRUD lokal via Docker — ✅
- **M1:** grup & undang anggota
- **M2:** shared list real-time
- **M3:** live location (peta)

## Setup Supabase (butuh akun kamu)
1. Buat project di https://supabase.com (free tier cukup).
2. Buka **SQL Editor** → jalankan `schema.sql` (ini kanonik: sudah include RLS + realtime).
3. Ambil **Project URL** dan **anon public key** dari **Settings → API**.
4. Masukkan ke `trip-planner.html`:
   ```html
   <script>
     window.__MARKICAB_SUPABASE__ = { url: 'https://xxxx.supabase.co', anonKey: 'eyJ...' };
   </script>
   ```
   (atau via `<meta name="markicab-supabase-url">`). MarkiCab otomatis aktif mode kolaborasi.

> ⚠️ **Jangan** commit file `.env` ke repo (sudah di-.gitignore). anon key aman dipakai di
> client karena semua akses dibatasi oleh Row Level Security (lihat `schema.sql`).

## Verifikasi lokal (tanpa akun)
```bash
docker run -d --name markicab-pg -e POSTGRES_PASSWORD=localdev -e POSTGRES_DB=markicab -p 5432:5432 postgres:16
# tunggu ready, lalu:
docker exec -i markicab-pg psql -U postgres -d markicab < schema.local.sql
docker exec -i markicab-pg psql -U postgres -d markicab -c "insert into groups (name) values ('Test');"
docker exec -i markicab-pg psql -U postgres -d markicab -c "select * from groups;"
docker rm -f markicab-pg   # bersihkan
```
