-- Fix: get_group_identities should only flag user as anonymous if explicitly true
-- The is_anonymous column is NULL for most members (legacy data), and only
-- explicitly true for anonymous guests. Converted users have it set to false
-- by transfer_anonymous_identity. Use IS TRUE check, not coalesce.

create or replace function public.get_group_identities(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = 'P0001';
  end if;
  if not public.is_group_member(p_group_id) then
    raise exception 'not a group member' using errcode = 'P0001';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', gm.user_id,
             'role', gm.role,
             'name', coalesce(
                       case when public.is_placeholder_name(p.display_name)
                            then null else p.display_name end,
                       case when public.is_placeholder_name(gm.display_name)
                            then null else gm.display_name end
                     ),
             -- Only flag as anonymous if explicitly true (not NULL, not false)
             'is_anonymous', (gm.is_anonymous IS TRUE),
             'avatar_url', p.avatar_url
           ) order by gm.joined_at)
    from public.group_members gm
    left join public.profiles p on p.id = gm.user_id
    where gm.group_id = p_group_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_group_identities(uuid) to authenticated;
