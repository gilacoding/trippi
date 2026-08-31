-- Fix: transfer_anonymous_identity lost memberships when new user had no
-- existing group_members rows. The old "existing CTE + merged UPDATE" only
-- transferred rows where the new user already had a membership; everything
-- else fell through to the DELETE and vanished.
--
-- New logic: handle each anon membership independently.
--   - If the new user is not yet a member of that group → transfer the row.
--   - If the new user is already a member → delete the anon row (no dup).

create or replace function public.transfer_anonymous_identity(
  p_old_user_id uuid,
  p_new_user_id uuid,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_is_anon boolean;
  v_members     integer;
begin
  select is_anonymous into v_old_is_anon
  from auth.users where id = p_old_user_id;

  if v_old_is_anon is null then
    raise exception 'old user not found' using errcode = 'P0001';
  end if;
  if not v_old_is_anon then
    raise exception 'can only transfer from an anonymous identity' using errcode = 'P0001';
  end if;
  if p_old_user_id = p_new_user_id then
    raise exception 'old and new user are the same' using errcode = 'P0001';
  end if;

  -- 1. Attribution tables: point every row the anon owned at the new UID.
  update public.wishlist_items   set suggested_by   = p_new_user_id where suggested_by   = p_old_user_id;
  update public.shared_items     set created_by     = p_new_user_id where created_by     = p_old_user_id;
  update public.group_expenses   set created_by     = p_new_user_id where created_by     = p_old_user_id;
  update public.group_expenses   set paid_by        = p_new_user_id where paid_by        = p_old_user_id;
  update public.groups           set created_by     = p_new_user_id where created_by     = p_old_user_id;
  update public.invitations      set created_by     = p_new_user_id where created_by     = p_old_user_id;
  update public.journey_sessions set enabled_by     = p_new_user_id where enabled_by     = p_old_user_id;

  -- 2. Membership transfer — handle each anon membership independently:
  --    Case A: new user is NOT a member of this group → transfer anon row to new user.
  update public.group_members gm
     set user_id = p_new_user_id,
         display_name = coalesce(p_display_name, gm.display_name),
         is_anonymous = false
   where gm.user_id = p_old_user_id
     and not exists (
       select 1 from public.group_members ex
       where ex.group_id = gm.group_id and ex.user_id = p_new_user_id
     );

  --    Case B: new user IS already a member of this group → delete anon row (dedupe).
  delete from public.group_members
   where user_id = p_old_user_id
     and exists (
       select 1 from public.group_members ex
       where ex.group_id = group_members.group_id and ex.user_id = p_new_user_id
     );

  -- 3. Profile: if the new UID has no profile yet, create one from the anon's
  --    per-trip display names (most recent non-placeholder).
  insert into public.profiles (id, display_name)
  select p_new_user_id, best.latest_good
  from (
    select (array_agg(gm.display_name order by gm.joined_at desc))[1] as latest_good
    from public.group_members gm
    where gm.user_id = p_new_user_id
      and not public.is_placeholder_name(gm.display_name)
  ) best
  where not exists (select 1 from public.profiles p where p.id = p_new_user_id)
    and best.latest_good is not null
  on conflict (id) do nothing;

  -- 4. Remove the anonymous identity itself.
  delete from auth.users where id = p_old_user_id;

  select count(*) into v_members from public.group_members where user_id = p_new_user_id;

  return jsonb_build_object(
    'transferred_memberships', v_members,
    'new_user_id', p_new_user_id
  );
end;
$$;

grant execute on function public.transfer_anonymous_identity(uuid, uuid, text) to authenticated;
