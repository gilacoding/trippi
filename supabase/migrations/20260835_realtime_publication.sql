-- P2: publish the tables the UI subscribes to.
--
-- The creator side now listens for wishlist_items and journey_sessions changes,
-- and the guest side listens for shared_items / group_expenses / wishlist_items /
-- group_members / member_locations / journey_sessions. A subscription on a table
-- that is not in the supabase_realtime publication silently never fires, which is
-- exactly the "needs F5" symptom, so add them idempotently.
--
-- REPLICA IDENTITY FULL is required for DELETE events to carry the old row, which
-- the UI needs in order to drop the removed card.

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'shared_items', 'group_expenses', 'wishlist_items',
      'group_members', 'member_locations', 'journey_sessions'
    ])
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;

    execute format('alter table public.%I replica identity full', t);
  end loop;
end
$$;
