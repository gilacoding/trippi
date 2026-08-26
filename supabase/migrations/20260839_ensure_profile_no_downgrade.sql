-- P0.7 part 3: ensure_profile must never downgrade an existing good name.
--
-- BUG found immediately after deploying part 2, on live data:
--   profiles.display_name for 346f783e was correctly backfilled to 'Ras', then a
--   single ensure_profile() call replaced it with 'e2e_owner_1787308237'.
--
-- Cause: the function always computed a fallback (auth metadata -> email prefix)
-- and passed it as excluded.display_name. The ON CONFLICT branch then preferred
-- excluded over the stored value, so a weak email-derived name overwrote a real
-- one on every login.
--
-- Fix: only fill the name when the stored one is missing or a placeholder, and only
-- use the email-prefix fallback on INSERT (a brand-new profile), never to replace
-- something a human already set. An explicit p_display_name from the client is
-- still honoured, because that is a deliberate rename.

create or replace function public.ensure_profile(p_display_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_explicit text;
  v_fallback text;
  v_row      public.profiles;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = 'P0001';
  end if;

  -- A placeholder supplied by the client is discarded, never stored.
  if public.is_placeholder_name(p_display_name) then
    v_explicit := null;
  else
    v_explicit := btrim(p_display_name);
  end if;

  select coalesce(
           nullif(btrim(u.raw_user_meta_data->>'name'), ''),
           nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
           nullif(split_part(coalesce(u.email, ''), '@', 1), '')
         )
    into v_fallback
  from auth.users u
  where u.id = v_uid;

  if public.is_placeholder_name(v_fallback) then
    v_fallback := null;
  end if;

  select * into v_row from public.profiles where id = v_uid;

  if v_row.id is null then
    -- New profile: explicit name wins, otherwise derive one.
    insert into public.profiles (id, display_name)
    values (v_uid, coalesce(v_explicit, v_fallback))
    returning * into v_row;
    return v_row;
  end if;

  -- Existing profile: upgrade only. An explicit rename always applies; the derived
  -- fallback is used solely to repair a missing/placeholder name.
  if v_explicit is not null then
    update public.profiles
       set display_name = v_explicit, updated_at = now()
     where id = v_uid
    returning * into v_row;
  elsif public.is_placeholder_name(v_row.display_name) and v_fallback is not null then
    update public.profiles
       set display_name = v_fallback, updated_at = now()
     where id = v_uid
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

grant execute on function public.ensure_profile(text) to authenticated;

-- Repair the row the buggy version damaged, using the same priority as the
-- original backfill (most recent non-placeholder per-trip name).
update public.profiles p
   set display_name = best.latest_good,
       updated_at = now()
from (
  select gm.user_id,
         (array_agg(gm.display_name order by gm.joined_at desc))[1] as latest_good
  from public.group_members gm
  where not public.is_placeholder_name(gm.display_name)
  group by gm.user_id
) best
where best.user_id = p.id
  and best.latest_good is not null
  and p.display_name = split_part(
        (select coalesce(u.email, '') from auth.users u where u.id = p.id), '@', 1)
  and p.display_name <> best.latest_good;
