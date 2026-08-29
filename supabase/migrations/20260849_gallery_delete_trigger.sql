-- Gallery v1: enforce delete policy with trigger
-- The RLS USING clause silently filters rows (200 with empty body when denied),
-- which doesn't produce a proper 403 error. This trigger explicitly raises
-- an exception (errcode 42501) when the caller lacks permission.
--
-- Root cause: PostgREST DELETE policies only filter; they don't raise errors
-- for denied rows. The trigger bridges this gap.
--
-- Policy: a permissive USING(true) policy lets all DELETE attempts reach the
-- trigger, which then enforces: uploader OR group creator ONLY.

-- Drop the restrictive DELETE policy (replaced by trigger)
drop policy if exists "gallery_delete_owner_or_creator" on public.gallery_media;
drop policy if exists "gallery_delete_all" on public.gallery_media;

-- Permissive policy: allow all DELETE attempts for authenticated users
-- The trigger below enforces the actual ownership/creator check
create policy "gallery_delete_all"
  on public.gallery_media
  for delete
  to authenticated
  using (true);

-- Trigger function: raises 42501 (insufficient_privilege) when the caller
-- is neither the uploader nor the group creator
create or replace function public.gallery_delete_policy_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not (
        old.uploader_id = auth.uid()
        or exists (
            select 1 from public.groups g
            where g.id = old.group_id
              and g.created_by = auth.uid()
        )
    ) then
        raise exception '42501: You do not have permission to delete this photo'
            using errcode = '42501';
    end if;
    return old;
end;
$$;

drop trigger if exists gallery_media_delete_policy on public.gallery_media;
create trigger gallery_media_delete_policy
    before delete on public.gallery_media
    for each row execute function public.gallery_delete_policy_trigger();