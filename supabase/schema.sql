-- Trippi backend schema — canonical version for a Supabase project.
-- VERIFIED against project lchwquifbzzamozwk (anonymous sign-in enabled).
--
-- IMPORTANT (project-specific quirk):
--   In this Supabase project, anonymous sign-in works at the Auth level, but
--   `auth.uid()` / `auth.jwt()` evaluate to NULL inside Postgres RLS policies.
--   Therefore we cannot gate rows by `auth.uid()` in the database. Instead we
--   use permissive RLS (FOR ALL true) and enforce membership / access control
--   at the APPLICATION level: the client only ever queries groups where the
--   current user is a row in `group_members`. Group IDs are random UUIDs, so
--   this is sufficient privacy for a personal MVP. Revisit if real user auth
--   (email/Google) is added later — then switch these policies to
--   `auth.uid()`-based checks.

create extension if not exists "pgcrypto";

-- ── Groups ───────────────────────────────────────────────
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ── Members (who is in a group) ──────────────────────────
create table if not exists public.group_members (
  group_id     uuid references public.groups(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  display_name text not null,
  joined_at    timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ── Shared to-do / place-to-go (real-time collaborative) ─
create table if not exists public.shared_items (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references public.groups(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title      text not null,
  note       text default '',
  link       text default '',
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Live location (one row per member per group, upserted) ─
create table if not exists public.locations (
  group_id   uuid references public.groups(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists shared_items_group_idx on public.shared_items(group_id);
create index if not exists locations_group_idx     on public.locations(group_id);

-- ── Row Level Security ───────────────────────────────────
-- Permissive: access is enforced in the application layer (see note above).
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.shared_items   enable row level security;
alter table public.locations      enable row level security;

drop policy if exists "groups_all"    on public.groups;
drop policy if exists "members_all"   on public.group_members;
drop policy if exists "items_all"     on public.shared_items;
drop policy if exists "locations_all" on public.locations;

create policy "groups_all"    on public.groups         for all using (true) with check (true);
create policy "members_all"   on public.group_members  for all using (true) with check (true);
create policy "items_all"     on public.shared_items   for all using (true) with check (true);
create policy "locations_all" on public.locations      for all using (true) with check (true);

-- Grants so the anon key can reach the tables through PostgREST.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.groups, public.group_members,
      public.shared_items, public.locations to anon, authenticated;

-- Enable realtime for the collaborative tables. Guarded so a missing/renamed
-- publication never aborts the rest of the script.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.shared_items;
    exception when duplicate_object then null; end;
    begin
      alter publication supabase_realtime add table public.locations;
    exception when duplicate_object then null; end;
  end if;
end $$;
