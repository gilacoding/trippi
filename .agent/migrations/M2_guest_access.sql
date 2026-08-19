-- ============================================================
-- MARKICAB GUEST ACCESS + CREATOR-ONLY SHARING (security patch)
-- Additive only. No existing table/RPC/RLS modified.
-- Anonymous Auth provider stays DISABLED; guests use the anon *API key*
-- (publishable) to call token-scoped RPCs — NOT Supabase Anonymous Auth.
-- ============================================================

-- 1) invitations table (trip-scoped share tokens)
create table if not exists public.invitations (
  token        uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  created_by   uuid not null,                      -- trip creator (set by create_invitation)
  display_name text,
  expires_at   timestamptz not null default (now() + interval '30 days'),
  created_at   timestamptz not null default now(),
  revoked      boolean not null default false
);
-- No RLS policies => all direct table access DENIED.
-- Only SECURITY DEFINER RPCs below may touch this table.
alter table public.invitations enable row level security;

-- 2) Safe payload builder. REVOKE EXECUTE from public so it cannot be
--    called directly with an arbitrary group_id (prevents enumeration /
--    cross-trip access). Only the SECURITY DEFINER RPCs below call it.
create or replace function public.guest_payload(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g      public.groups%rowtype;
  items  jsonb;
  exps   jsonb;
  mems   jsonb;
begin
  select * into g from public.groups where id = p_group_id;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'note', note, 'link', link,
      'done', done, 'date', date, 'time', "time", 'budget', budget)), '[]'::jsonb)
    into items from public.shared_items where group_id = p_group_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'amount', amount, 'category', category,
      'note', note, 'date', date)), '[]'::jsonb)
    into exps from public.group_expenses where group_id = p_group_id;
  select coalesce(jsonb_agg(jsonb_build_object('display_name', display_name)), '[]'::jsonb)
    into mems from public.group_members where group_id = p_group_id;
  return jsonb_build_object(
    'id', g.id, 'name', g.name, 'destination', g.destination,
    'start_date', g.start_date, 'end_date', g.end_date,
    'items', items, 'expenses', exps, 'members', mems
  );
end;
$$;
revoke execute on function public.guest_payload(uuid) from public;

-- 3) create_invitation — CREATOR ONLY
create or replace function public.create_invitation(p_group_id uuid, p_display_name text)
returns table (token uuid, group_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tok uuid;
  v_exp timestamptz;
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.groups where id = p_group_id and created_by = v_uid) then
    raise exception 'only the trip creator can share this trip' using errcode = 'P0001';
  end if;
  insert into public.invitations (group_id, created_by, display_name)
    values (p_group_id, v_uid, nullif(trim(p_display_name), ''))
    returning invitations.token, invitations.expires_at into v_tok, v_exp;
  return query select v_tok, p_group_id, v_exp;
end;
$$;

-- 4) redeem_invitation — guest (anon OR authenticated) joins + gets payload
create or replace function public.redeem_invitation(p_token uuid, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv     record;
  v_uid   uuid := auth.uid();
  payload jsonb;
begin
  select * into inv from public.invitations where token = p_token;
  if not found then raise exception 'invalid invitation' using errcode = 'P0001'; end if;
  if inv.revoked then raise exception 'invitation revoked' using errcode = 'P0001'; end if;
  if inv.expires_at < now() then raise exception 'invitation expired' using errcode = 'P0001'; end if;
  if v_uid is not null then
    insert into public.group_members (group_id, user_id, display_name)
      values (inv.group_id, v_uid, coalesce(nullif(trim(p_display_name), ''), 'Guest'))
      on conflict on constraint group_members_pkey do nothing;
  end if;
  payload := public.guest_payload(inv.group_id);
  payload := payload || jsonb_build_object('is_member', (v_uid is not null));
  return payload;
end;
$$;

-- 5) get_guest_trip — anon-safe read by token (reload without auth).
--    Takes ONLY the token => always trip-scoped. Never accepts a group_id.
create or replace function public.get_guest_trip(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv     record;
  payload jsonb;
begin
  select * into inv from public.invitations where token = p_token;
  if not found then raise exception 'invalid invitation' using errcode = 'P0001'; end if;
  if inv.revoked then raise exception 'invitation revoked' using errcode = 'P0001'; end if;
  if inv.expires_at < now() then raise exception 'invitation expired' using errcode = 'P0001'; end if;
  payload := public.guest_payload(inv.group_id);
  payload := payload || jsonb_build_object('is_member', false);
  return payload;
end;
$$;

-- 6) revoke_invitation — CREATOR ONLY
create or replace function public.revoke_invitation(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.invitations where token = p_token and created_by = v_uid) then
    raise exception 'only the trip creator can revoke this invitation' using errcode = 'P0001';
  end if;
  update public.invitations set revoked = true where token = p_token;
  return true;
end;
$$;

-- 7) list_my_invitations — CREATOR ONLY (manage links)
create or replace function public.list_my_invitations(p_group_id uuid)
returns table (token uuid, expires_at timestamptz, revoked boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.groups where id = p_group_id and created_by = v_uid) then
    raise exception 'only the trip creator can view invitations' using errcode = 'P0001';
  end if;
  return query
    select i.token, i.expires_at, i.revoked, i.created_at
    from public.invitations i
    where i.group_id = p_group_id
    order by i.created_at desc;
end;
$$;
