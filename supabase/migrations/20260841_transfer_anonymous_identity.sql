-- P0.7 part 5: account linking — transfer anonymous identity to a new registered account.
--
-- EVIDENCE that this is needed (measured by guest_conversion.py):
--   After a guest converts to a registered account, BOTH identities remain as members
--   of the same trip — one human carries two identities in one group:
--     anon_uuid  'Budi' Guest
--     new_uuid   'converted_xxx' Crew Member
--   The anon membership, wishlist suggestions, shared-item and expense attributions
--   should all migrate to the new UID, and the anon identity should be removed.
--
-- The transfer runs in a single transaction. It is idempotent: if the old UID has no
-- rows left to transfer, it is simply deleted.

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
  -- Guard: the source MUST be an anonymous user, otherwise we would let a
  -- registered user overwrite someone else's data.
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

  -- 2. Membership: replace the anon row with the new UID. Keep the earliest
  --    joined_at so tenure is preserved. If the new UID is already a member of
  --    the same group (e.g. re-login), just drop the anon row.
  with existing as (
    select group_id, joined_at
    from public.group_members
    where user_id = p_new_user_id
  ), merged as (
    update public.group_members gm
       set user_id = p_new_user_id,
           display_name = coalesce(p_display_name, gm.display_name),
           role = case when e.group_id is null then gm.role
                       else (select role from public.group_members where user_id = p_new_user_id and group_id = gm.group_id limit 1)
                  end,
           joined_at = least(gm.joined_at, coalesce(e.joined_at, gm.joined_at))
      from existing e
     where gm.user_id = p_old_user_id
       and gm.group_id = e.group_id
    returning gm.group_id
  ), deleted as (
    delete from public.group_members
     where user_id = p_old_user_id
       and group_id not in (select group_id from merged)
    returning group_id
  )
  select count(*) into v_members from public.group_members where user_id = p_new_user_id;

  -- 3. Profile: if the new UID has no profile yet, create one from the anon's
  --    per-trip display names (most recent non-placeholder). The client will
  --    upsert its own profile immediately after, so this is just a safety net.
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

  -- 4. Remove the anonymous identity itself. Cascades to auth.identities,
  --    auth.sessions, etc. The anon has no profile row to delete (never created).
  delete from auth.users where id = p_old_user_id;

  return jsonb_build_object(
    'transferred_memberships', v_members,
    'new_user_id', p_new_user_id
  );
end;
$$;

grant execute on function public.transfer_anonymous_identity(uuid, uuid, text) to authenticated;
