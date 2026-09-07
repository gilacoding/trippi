-- ============================================================
-- P1 FIX: Add missing GRANT statements for personal trip tables
-- This fixes HTTP 403 errors when accessing trips/agenda_items/expenses
-- ============================================================

-- Root cause: RLS was enabled but no GRANT was given to authenticated role
grant select, insert, update, delete on public.trips         to authenticated;
grant select, insert, update, delete on public.agenda_items  to authenticated;
grant select, insert, update, delete on public.expenses      to authenticated;
grant usage on schema public to anon, authenticated;
