# Trippi Backend (P2 — Collaboration)

Fondasi backend untuk fitur kolaborasi Trippi: **grup**, **shared to-do / place-to-go**,
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
4. Masukkan ke `backend/.env` (lihat `.env.example`):
   ```
   TRIPPI_SUPABASE_URL=https://xxxx.supabase.co
   TRIPPI_SUPABASE_ANON=eyJhbGci...
   ```
5. Di `trip-planner.html`, set `window.__TRIPPI_SUPABASE__ = { url, anonKey }`
   (atau via `<meta name="trippi-supabase-url">`). Trippi otomatis aktif mode kolaborasi.

> ⚠️ **Jangan** commit file `.env` ke repo (sudah di-.gitignore). anon key aman dipakai di
> client karena semua akses dibatasi oleh Row Level Security (lihat `schema.sql`).

## Verifikasi lokal (tanpa akun)
```bash
docker run -d --name trippi-pg -e POSTGRES_PASSWORD=localdev -e POSTGRES_DB=trippi -p 5432:5432 postgres:16
# tunggu ready, lalu:
docker exec -i trippi-pg psql -U postgres -d trippi < schema.local.sql
docker exec -i trippi-pg psql -U postgres -d trippi -c "insert into groups (name) values ('Test');"
docker exec -i trippi-pg psql -U postgres -d trippi -c "select * from groups;"
docker rm -f trippi-pg   # bersihkan
```
