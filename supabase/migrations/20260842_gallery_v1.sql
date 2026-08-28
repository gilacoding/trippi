-- Gallery v1: gallery_media table, indexes, RLS policies
--
-- Storage: private bucket `gallery` (10MB, JPEG/PNG/WebP only)
-- Access: signed URLs only (1 hour expiry)
-- Path: gallery/{group_id}/{user_id}/{YYYYMMDD}_{random8}.{ext}

-- ── Table ─────────────────────────────────────────────────────
create table if not exists public.gallery_media (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete set null,
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null,
  width int,
  height int,
  caption text default '',
  created_at timestamptz default now()
);

-- ── Indexes ───────────────────────────────────────────────────
create index if not exists idx_gallery_media_group
  on public.gallery_media(group_id);
create index if not exists idx_gallery_media_uploader
  on public.gallery_media(uploader_id);

-- ── Row Level Security ─────────────────────────────────────────
alter table public.gallery_media enable row level security;

-- Drop any pre-existing policies to keep migration idempotent
drop policy if exists "gallery_select_members" on public.gallery_media;
drop policy if exists "gallery_insert_members" on public.gallery_media;
drop policy if exists "gallery_update_owner_or_creator" on public.gallery_media;
drop policy if exists "gallery_delete_owner_or_creator" on public.gallery_media;

-- SELECT: any group member can view photos
create policy "gallery_select_members"
  on public.gallery_media
  for select
  to authenticated
  using (public.is_group_member(group_id));

-- INSERT: group members (not anonymous) can upload; must own the upload
create policy "gallery_insert_members"
  on public.gallery_media
  for insert
  to authenticated
  with check (
    public.is_group_member(group_id)
    and not public.is_anonymous_caller()
    and uploader_id = auth.uid()
  );

-- UPDATE: uploader can update own; group creator can update any
create policy "gallery_update_owner_or_creator"
  on public.gallery_media
  for update
  to authenticated
  using (
    uploader_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = gallery_media.group_id
        and g.created_by = auth.uid()
    )
  );

-- DELETE: uploader can delete own; group creator can delete any
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

-- ── Realtime ──────────────────────────────────────────────────
-- Gallery new uploads appear without refresh via realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.gallery_media;
    exception when duplicate_object then null; end;
  end if;
end $$;