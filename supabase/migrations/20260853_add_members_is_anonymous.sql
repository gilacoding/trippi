-- Fix: add is_anonymous column to group_members
-- This allows the transfer function to mark converted users as non-anonymous
-- at the membership level, independent of auth.users flags.

alter table public.group_members
  add column if not exists is_anonymous boolean default null;

-- Backfill: existing registered users are not anonymous
update public.group_members set is_anonymous = false where is_anonymous is null;

-- Update redeem_invitation to set is_anonymous based on caller's auth state
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
  v_is_anon boolean;
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;

  select * into inv from public.invitations where token = p_token;
  if not found then raise exception 'invalid invitation' using errcode = 'P0001'; end if;
  if inv.revoked then raise exception 'invitation revoked' using errcode = 'P0001'; end if;
  if inv.expires_at < now() then raise exception 'invitation expired' using errcode = 'P0001'; end if;

  -- Check if the caller is an anonymous user
  select is_anonymous into v_is_anon from auth.users where id = v_uid;
  if v_is_anon is null then v_is_anon = false; end if;

  select count(*) into v_count from public.group_members where group_id = inv.group_id;
  if inv.participant_limit is not null and v_count >= inv.participant_limit then
    raise exception 'trip penuh' using errcode = 'P0001';
  end if;

  insert into public.group_members (group_id, user_id, display_name, role, is_anonymous)
    values (inv.group_id, v_uid, coalesce(nullif(trim(p_display_name), ''), 'Guest'), 'member', v_is_anon)
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

grant execute on function public.redeem_invitation(uuid, text) to authenticated;
