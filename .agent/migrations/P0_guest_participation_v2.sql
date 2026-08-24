-- ============================================================
-- P0.2 — Guest Trip Participation Model V2 (anonymous auth)
-- Additive only. No existing table/RLS/RPC semantics broken.
-- Requires: Anonymous Auth enabled in Supabase Dashboard.
-- ============================================================

-- 1. participant_limit on invitations (per-invitation capacity)
alter table public.invitations
  add column if not exists participant_limit integer not null default 10;

-- 2. Updated redeem_invitation: accepts anonymous uid + atomic capacity check
--    (replaces M2/M3 version — same function name, additive logic)
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
  v_count integer;
begin
  -- auth.uid() must be present (anonymous or authenticated)
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;

  -- validate invitation
  select * into inv from public.invitations where token = p_token;
  if not found then raise exception 'invalid invitation' using errcode = 'P0001'; end if;
  if inv.revoked then raise exception 'invitation revoked' using errcode = 'P0001'; end if;
  if inv.expires_at < now() then raise exception 'invitation expired' using errcode = 'P0001'; end if;

  -- atomic capacity check + insert
  select count(*) into v_count from public.group_members where group_id = inv.group_id;
  if inv.participant_limit is not null and v_count >= inv.participant_limit then
    raise exception 'trip penuh' using errcode = 'P0001';
  end if;

  insert into public.group_members (group_id, user_id, display_name, role)
    values (inv.group_id, v_uid, coalesce(nullif(trim(p_display_name), ''), 'Guest'), 'member')
    on conflict on constraint group_members_pkey do nothing;

  payload := public.guest_payload(inv.group_id);
  payload := payload || jsonb_build_object(
    'is_member', true,
    'participant_limit', inv.participant_limit,
    'current_count', v_count + 1
  );
  return payload;
end;
$$;

-- 3. Updated get_guest_trip: include participant_limit + current_count
create or replace function public.get_guest_trip(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv     record;
  v_uid   uuid := auth.uid();
  payload jsonb;
  v_count integer;
  v_is_member boolean;
begin
  select * into inv from public.invitations where token = p_token;
  if not found then raise exception 'invalid invitation' using errcode = 'P0001'; end if;
  if inv.revoked then raise exception 'invitation revoked' using errcode = 'P0001'; end if;
  if inv.expires_at < now() then raise exception 'invitation expired' using errcode = 'P0001'; end if;

  select count(*) into v_count from public.group_members where group_id = inv.group_id;

  -- is_member: true when a row already exists for this caller (handles anonymous uid too)
  select exists (select 1 from public.group_members where group_id = inv.group_id and user_id = v_uid)
    into v_is_member;

  payload := public.guest_payload(inv.group_id);
  payload := payload || jsonb_build_object(
    'is_member', v_is_member,
    'participant_limit', inv.participant_limit,
    'current_count', v_count
  );
  return payload;
end;
$$;
