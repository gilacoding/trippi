-- Fix: grant DELETE privilege to authenticated role for gallery_media
-- Previous migration 20260845 may not have been deployed correctly

grant delete on public.gallery_media to authenticated;
