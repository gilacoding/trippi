-- Avatars storage: private bucket for profile photos
-- Path: {user_id}/{timestamp}_{random8}.ext
-- Access: signed URLs only (1 hour expiry)
-- Reuses the same pattern as gallery_v1.sql

-- Bucket is created via Supabase dashboard or SQL; these policies enforce access.
-- Storage policies for `avatars` bucket
drop policy if exists "avatars_storage_insert" on storage.objects;
create policy "avatars_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );

-- Select: only your own avatar
drop policy if exists "avatars_storage_select" on storage.objects;
create policy "avatars_storage_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );

-- Update: own avatar only
drop policy if exists "avatars_storage_update" on storage.objects;
create policy "avatars_storage_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );

-- Delete: own avatar only
drop policy if exists "avatars_storage_delete" on storage.objects;
create policy "avatars_storage_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );
