-- Trippi backend schema — LOCAL test variant (plain Postgres, no auth.users).
-- Used only to verify the DDL + CRUD locally via Docker. Do NOT use in production.
-- The canonical version is schema.sql (with RLS + auth FKs for Supabase).

create extension if not exists "pgcrypto";

create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

create table if not exists group_members (
  group_id     uuid references groups(id) on delete cascade,
  user_id      uuid,
  display_name text not null,
  joined_at    timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists shared_items (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references groups(id) on delete cascade,
  created_by uuid,
  title      text not null,
  note       text default '',
  link       text default '',
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists locations (
  group_id   uuid references groups(id) on delete cascade,
  user_id    uuid,
  lat        double precision not null,
  lng        double precision not null,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists shared_items_group_idx on shared_items(group_id);
create index if not exists locations_group_idx     on locations(group_id);
