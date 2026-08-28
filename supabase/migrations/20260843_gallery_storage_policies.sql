-- Gallery v1: storage policies for private `gallery` bucket
--
-- Storage path within bucket: {group_id}/{user_id}/{filename}
-- Fine-grained access is enforced by gallery_media table RLS + app logic.
-- These storage policies ensure only authenticated users with valid paths
-- can upload/delete, and the bucket stays private (no public access).

-- Upload: authenticated users, valid gallery path (user_id matches)
drop policy if exists "gallery_storage_insert" on storage.objects;
create policy "gallery_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'gallery'
    and split_part(name, '/', 1)::uuid is not null
    and split_part(name, '/', 2)::uuid = auth.uid()
  );

-- Delete: uploader or group creator
drop policy if exists "gallery_storage_delete" on storage.objects;
create policy "gallery_storage_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'gallery'
    and (
      split_part(name, '/', 2)::uuid = auth.uid()
      or exists (
        select 1 from public.groups g
        where g.id = split_part(name, '/', 1)::uuid
          and g.created_by = auth.uid()
      )
    )
  );

-- Select (for signed URL generation): any authenticated user with gallery access
drop policy if exists "gallery_storage_select" on storage.objects;
create policy "gallery_storage_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'gallery'
    and exists (
      select 1 from public.gallery_media gm
      where gm.storage_path = name
        and public.is_group_member(gm.group_id)
    )
  );