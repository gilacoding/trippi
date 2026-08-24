create or replace function public.get_guest_trip(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv     record;
  payload jsonb;
  v_count integer;
  v_uid   uuid := auth.uid();
  v_is_member boolean;
begin
  select * into inv from public.invitations where token = p_token;
  if not found then raise exception 'invalid invitation' using errcode = 'P0001'; end if;
  if inv.revoked then raise exception 'invitation revoked' using errcode = 'P0001'; end if;
  if inv.expires_at < now() then raise exception 'invitation expired' using errcode = 'P0001'; end if;

  select count(*) into v_count from public.group_members where group_id = inv.group_id;

  -- Check if the authenticated user is actually a member
  v_is_member := exists(
    select 1 from public.group_members
    where group_id = inv.group_id and user_id = v_uid
  );

  payload := public.guest_payload(inv.group_id);
  payload := payload || jsonb_build_object(
    'is_member', v_is_member,
    'participant_limit', inv.participant_limit,
    'current_count', v_count
  );
  return payload;
end;
$$;
