-- Add day_number column to shared_items table for day-structure preservation
-- This allows imported trip items to retain their day association.

alter table if exists public.shared_items
  add column if not exists day_number integer;

create index if not exists shared_items_day_idx on public.shared_items(day_number);
