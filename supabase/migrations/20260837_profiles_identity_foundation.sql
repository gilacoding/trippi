-- P0.7 Identity Foundation: canonical per-user profile.
--
-- AUDIT FINDING (measured on live data, not inferred):
--   * public.group_members.display_name was the ONLY place a human name lived, and
--     it is per-MEMBERSHIP, so one person could carry a different name per trip.
--   * 199 rows held a placeholder as the name: 'Creator' x172 (11 users),
--     'Guest' x27 (22 users).
--   * 8 users had conflicting names across trips, e.g. one user rendered as
--     'Creator' | 'Owner' | 'Ras' | 'TestOwner' depending on which trip you opened.
--   * There was no profiles table, and only 1 of 10 registered users had a name in
--     auth.users.raw_user_meta_data. Anonymous users have no name there at all.
-- A frontend resolver cannot fix this, because the stored value itself differs.
--
-- This migration adds the missing per-user source of truth. It does NOT drop
-- group_members.display_name — that stays as a legacy per-trip snapshot (and remains
-- the only name an anonymous guest has, since guests get no profile row).
--
-- Role is deliberately NOT stored here; role stays in group_members.role.

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Own profile: full self-service.
drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Crew visibility: you may read the profile of someone who shares a trip with you.
-- This is what lets Crew, journey markers, wishlist attribution and expense payer
-- resolve a name. It is scoped by shared membership — never a global user directory,
-- and it exposes no email.
drop policy if exists "profiles_select_shared_group" on public.profiles;
create policy "profiles_select_shared_group" on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.group_members me
      join public.group_members them on them.group_id = me.group_id
      where me.user_id = (select auth.uid())
        and them.user_id = profiles.id
    )
  );

grant select, insert, update on public.profiles to authenticated;

create index if not exists idx_profiles_display_name on public.profiles (display_name);
