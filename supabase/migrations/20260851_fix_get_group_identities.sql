-- Fix: get_group_identities should use group_members.is_anonymous as source of truth
-- The auth.users.is_anonymous flag may be stale for converted users (Supabase Auth
-- may preserve the anonymous flag on the new user created via signUp in a session
-- that was previously anonymous). The transfer function correctly sets
-- group_members.is_anonymous = false, so use that instead.

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
             -- Use group_members.is_anonymous as source of truth; fallback to auth.users
             'is_anonymous', coalesce(gm.is_anonymous, u.is_anonymous, false),
             'avatar_url', p.avatar_url
           ) order by gm.joined_at)
    from public.group_members gm
    left join public.profiles p on p.id = gm.user_id
    left join auth.users u on u.id = gm.user_id
    where gm.group_id = p_group_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_group_identities(uuid) to authenticated;
