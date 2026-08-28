-- Gallery v1: server-side validation for MIME type and file size
-- Client-side validation can be bypassed via REST API, so enforce at DB level

-- Add allowed MIME types and max size as a config table (or use CHECK constraints)
-- Simpler: use a trigger for validation

create or replace function public.validate_gallery_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed_mimes text[] := array['image/jpeg', 'image/png', 'image/webp'];
  v_max_size bigint := 10 * 1024 * 1024; -- 10 MB
begin
  -- MIME type validation
  if not (new.mime_type = any(v_allowed_mimes)) then
    raise exception 'Tipe file tidak diizinkan. Hanya JPEG, PNG, WebP.' using errcode = 'P0001';
  end if;

  -- File size validation
  if new.file_size > v_max_size then
    raise exception 'Ukuran file melebihi 10 MB.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists gallery_media_validate on public.gallery_media;
create trigger gallery_media_validate
  before insert or update on public.gallery_media
  for each row execute function public.validate_gallery_media();
