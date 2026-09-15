-- Add can_edit_itinerary and can_edit_expense flags to trip_permissions RPC.
-- Guest-first removal: can_edit remains owner-only (route builder, trip admin).
-- Members (registered + anonymous): can_edit_itinerary = true.
-- Members + guests: can_edit_expense = true (RLS grants is_group_member).
-- Privacy: personal expenses remain owner-only (type='personal' AND created_by=auth.uid()).
create or replace function public.trip_permissions(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_group record;
  v_is_member boolean;
  v_is_owner boolean;
  v_is_anon boolean;
begin
  select g.id, g.created_by, g.members_can_add_itinerary
  into v_group
  from public.groups g
  where g.id = p_group_id;

  if not found then
    return jsonb_build_object('error', 'group not found');
  end if;

  select exists(
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_uid
  ) into v_is_member;

  v_is_owner := (v_group.created_by = v_uid);
  v_is_anon := public.is_anonymous_caller();

  return jsonb_build_object(
    'is_owner', v_is_owner,
    'is_member', v_is_member,
    'is_anonymous', v_is_anon,
    'can_edit', v_is_owner,
    'can_invite', v_is_owner,
    'can_manage_members', v_is_owner,
    'can_add_itinerary', v_is_owner or (v_is_member and not v_is_anon and coalesce(v_group.members_can_add_itinerary, false)),
    'can_edit_itinerary', v_is_owner or (v_is_member and not v_is_anon),
    'can_edit_expense', v_is_owner or v_is_member
  );
end;
$$;
