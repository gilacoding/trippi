-- ============================================================
-- M2 — DATA FOUNDATION
-- Additive schema: personal trip data moves to Supabase (source of truth).
-- HARD PRINCIPLE: Supabase = source of truth; localStorage = cache/draft/offline only.
-- These tables are NEW and do NOT touch existing group/collab tables or RPCs.
-- Backward compatible: existing group RPCs (create_group etc.) unchanged.
-- ============================================================

-- 1) trips (personal, owner-scoped)
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default '',
  destination text not null default '',
  start_date  date,
  end_date    date,
  note        text not null default '',
  local_id    text,                       -- old localStorage trip uuid (dedup / migration key)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, local_id)             -- prevents double backfill of same local trip
);
create index if not exists trips_user_idx on public.trips (user_id, updated_at desc);

-- 2) agenda_items (child of trips)
create table if not exists public.agenda_items (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  date       date,
  title      text not null default '',
  time       text not null default '',
  budget     numeric not null default 0,
  link       text not null default '',
  note       text not null default '',
  sort_idx   int not null default 0,
  local_id   text,                       -- old localStorage item uuid (dedup / idempotent upsert)
  created_at timestamptz not null default now(),
  unique (trip_id, local_id)             -- idempotent backfill key
);
create index if not exists agenda_trip_idx on public.agenda_items (trip_id, date, sort_idx);

-- 3) expenses (child of trips)
create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  date       date,
  name       text not null default '',
  amount     numeric not null default 0,
  category   text not null default 'Lainnya',
  note       text not null default '',
  local_id   text,                       -- old localStorage expense uuid (dedup)
  created_at timestamptz not null default now(),
  unique (trip_id, local_id)             -- idempotent backfill key
);
create index if not exists expenses_trip_idx on public.expenses (trip_id, date);

-- updated_at trigger (shared helper)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

-- ============================================================
-- RLS: owner-only. True anon (no JWT) gets ZERO access.
-- ============================================================
alter table public.trips         enable row level security;
alter table public.agenda_items  enable row level security;
alter table public.expenses      enable row level security;

-- trips: owner CRUD
drop policy if exists trips_owner_all on public.trips;
create policy trips_owner_all on public.trips
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- agenda_items: accessible iff parent trip is owned by caller
drop policy if exists agenda_owner_all on public.agenda_items;
create policy agenda_owner_all on public.agenda_items
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

-- expenses: same ownership rule
drop policy if exists expenses_owner_all on public.expenses;
create policy expenses_owner_all on public.expenses
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

-- NOTE: NO grant/permission change to existing group tables or to anon.
-- These three tables are independent of the collaborative group layer.
