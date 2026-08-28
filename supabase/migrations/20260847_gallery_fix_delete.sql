-- Gallery v1: fix delete policy
-- Previous policy may not have been deployed correctly

drop policy if exists "gallery_delete_owner_or_creator" on public.gallery_media;

create policy "gallery_delete_owner_or_creator"
  on public.gallery_media
  for delete
  to authenticated
  using (
    uploader_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = gallery_media.group_id
        and g.created_by = auth.uid()
    )
  );
