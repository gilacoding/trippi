-- GRANT access to authenticated role
grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.agenda_items to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant usage on schema public to anon, authenticated;

-- Verify grants
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
