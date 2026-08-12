-- Trippi backend schema — canonical version for a Supabase project.
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- Assumes Supabase extensions + auth.users are present.

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

-- Helper: is the current auth user a member of this group?
create or replace function public.is_group_member(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = g and m.user_id = auth.uid()
  );
$$;

-- ── Row Level Security ───────────────────────────────────
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.shared_items   enable row level security;
alter table public.locations      enable row level security;

-- groups: members can read; creator can create
create policy "groups_select" on public.groups for select using (public.is_group_member(id));
create policy "groups_insert" on public.groups for insert with check (auth.uid() = created_by);

-- members: visible to group members; a user can join/leave themselves
create policy "members_select" on public.group_members for select using (public.is_group_member(group_id));
create policy "members_insert" on public.group_members for insert with check (auth.uid() = user_id);
create policy "members_delete" on public.group_members for delete using (auth.uid() = user_id);

-- shared_items: group members get full CRUD
create policy "items_select" on public.shared_items for select using (public.is_group_member(group_id));
create policy "items_insert" on public.shared_items for insert with check (public.is_group_member(group_id));
create policy "items_update" on public.shared_items for update using (public.is_group_member(group_id));
create policy "items_delete" on public.shared_items for delete using (public.is_group_member(group_id));

-- locations: members can see; a user edits only their own position
create policy "loc_select" on public.locations for select using (public.is_group_member(group_id));
create policy "loc_upsert" on public.locations for insert with check (auth.uid() = user_id and public.is_group_member(group_id));
create policy "loc_update" on public.locations for update using (auth.uid() = user_id);

-- Enable realtime for the collaborative tables (Supabase).
alter publication supabase_realtime add table public.shared_items;
alter publication supabase_realtime add table public.locations;
