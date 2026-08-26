-- P0.7 part 2: backfill canonical names + auto-create on login.
--
-- Backfill priority, exactly as approved:
--   1. most recent NON-PLACEHOLDER group_members.display_name
--   2. auth.users.raw_user_meta_data name / full_name
--   3. email prefix
--   4. NULL   (never a placeholder — 'Creator' must not survive as a name)
--
-- Dry-run verified on live data before writing this file:
--   346f783e  'Creator|Owner|Ras|TestOwner'            -> 'Ras'
--   b1fba969  'Creator|Gilang'                          -> 'Gilang'
--   cc1fc73f  'Creator|rider'                           -> 'rider'
--   39dad615  'Browser E2E Member|E2E Member|M|Member'  -> 'E2E Test Member'
--
-- Only registered users get a profile. Anonymous guests intentionally do NOT:
-- their name lives in group_members.display_name for the trip they joined, which
-- keeps the guest flow untouched.

-- Single source for the placeholder blacklist, so the resolver and the backfill
-- can never disagree about what counts as a real name.
create or replace function public.is_placeholder_name(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name is null
      or btrim(p_name) = ''
      or lower(btrim(p_name)) in (
           'creator','owner','guest','testowner','member','anggota',
           'kamu','user','anonymous','tanpa nama','o','m','x'
         );
$$;

grant execute on function public.is_placeholder_name(text) to authenticated;

insert into public.profiles (id, display_name)
select u.id,
       coalesce(
         best.latest_good,
         nullif(btrim(u.raw_user_meta_data->>'name'), ''),
         nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
         nullif(split_part(coalesce(u.email, ''), '@', 1), '')
       )
from auth.users u
left join (
  select gm.user_id,
         (array_agg(gm.display_name order by gm.joined_at desc))[1] as latest_good
  from public.group_members gm
  where not public.is_placeholder_name(gm.display_name)
  group by gm.user_id
) best on best.user_id = u.id
where u.is_anonymous = false
on conflict (id) do nothing;

-- Ensure a profile exists for the caller, and opportunistically fill a blank name.
-- Called by the client right after sign-in. SECURITY DEFINER so it can read
-- auth.users metadata, but it only ever touches the CALLER's own row.
create or replace function public.ensure_profile(p_display_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
  v_row  public.profiles;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = 'P0001';
  end if;

  -- A placeholder passed in by the client is discarded, not stored.
  if public.is_placeholder_name(p_display_name) then
    v_name := null;
  else
    v_name := btrim(p_display_name);
  end if;

  if v_name is null then
    select coalesce(
             nullif(btrim(u.raw_user_meta_data->>'name'), ''),
             nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
             nullif(split_part(coalesce(u.email, ''), '@', 1), '')
           )
      into v_name
    from auth.users u
    where u.id = v_uid;
  end if;

  insert into public.profiles (id, display_name)
  values (v_uid, v_name)
  on conflict (id) do update
    set display_name = coalesce(
          nullif(btrim(excluded.display_name), ''),
          public.profiles.display_name
        ),
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.ensure_profile(text) to authenticated;

-- Read the canonical names for one trip's roster in a single round trip.
-- Scoped to a group the caller belongs to; returns names only, never emails.
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
             -- profile name wins; the per-trip snapshot is the fallback; a
             -- placeholder resolves to null so the UI can decide what to show.
             'name', coalesce(
                       case when public.is_placeholder_name(p.display_name)
                            then null else p.display_name end,
                       case when public.is_placeholder_name(gm.display_name)
                            then null else gm.display_name end
                     ),
             'is_anonymous', coalesce(u.is_anonymous, false),
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
