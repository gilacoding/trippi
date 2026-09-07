-- Add day_number column to agenda_items table for import day structure preservation
-- This allows imported itinerary items with dayNumber (but no explicit date)
-- to retain their day association in Supabase.

alter table if exists public.agenda_items
  add column if not exists day_number integer;

-- Index for day-based queries
create index if not exists agenda_items_day_idx on public.agenda_items(day_number);
