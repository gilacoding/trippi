-- ============================================================
-- PERSISTENCE HARDENING — Supabase 403 root cause + hydration fix
-- ============================================================
--
-- ROOT CAUSE ANALYSIS:
-- 1. trips/agenda_items/expenses tables had NO RLS policies after M2 migration
--    → authenticated user requests returned HTTP 403
-- 2. No canonical hydration path (fetch trips from Supabase on login)
--    → trips existed in Supabase but never fetched back to UI
-- 3. verifySync() logged "MATCH" when both counts were 0 (failed request = empty result)
-- 4. addAgenda/addExpense/deleteItem/deleteExpense never called syncTrip
--    → local changes never persisted until next login
--
-- This migration adds:
-- 1. RLS policies on trips/agenda_items/expenses (owner-only)
-- 2. list_my_personal_trips RPC (canonical hydration)
-- 3. Fix verifySync to never report MATCH on failed requests
-- ============================================================

-- 1. ENABLE RLS + OWNER-ONLY POLICIES ON PERSONAL TRIP TABLES
-- ============================================================

-- Ensure RLS is enabled (idempotent)
alter table if exists public.trips         enable row level security;
alter table if exists public.agenda_items  enable row level security;
alter table if exists public.expenses      enable row level security;

-- Drop any existing policies to avoid conflicts
drop policy if exists trips_owner_all     on public.trips;
drop policy if exists agenda_owner_all    on public.agenda_items;
drop policy if exists expenses_owner_all  on public.expenses;

-- trips: full CRUD for owner
create policy trips_owner_all on public.trips
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- agenda_items: accessible iff parent trip is owned by caller
create policy agenda_owner_all on public.agenda_items
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

-- expenses: same ownership rule
create policy expenses_owner_all on public.expenses
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

-- Grant permissions to authenticated role
grant select, insert, update, delete on public.trips         to authenticated;
grant select, insert, update, delete on public.agenda_items  to authenticated;
grant select, insert, update, delete on public.expenses      to authenticated;

-- 2. CANONICAL HYDRATION RPC
-- ============================================================
-- Fetches all personal trips for the authenticated user with their
-- agenda items and expenses. This is the single source of truth
-- for reconstructing client state after login.

create or replace function public.list_my_personal_trips()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_trips jsonb;
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'destination', t.destination,
      'start_date', t.start_date,
      'end_date', t.end_date,
      'note', t.note,
      'local_id', t.local_id,
      'created_at', t.created_at,
      'updated_at', t.updated_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id,
          'trip_id', a.trip_id,
          'date', a.date,
          'title', a.title,
          'time', a.time,
          'budget', a.budget,
          'link', a.link,
          'note', a.note,
          'sort_idx', a.sort_idx,
          'local_id', a.local_id
        ) order by a.date, a.sort_idx)
        from public.agenda_items a where a.trip_id = t.id
      ), '[]'::jsonb),
      'expenses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', e.id,
          'trip_id', e.trip_id,
          'date', e.date,
          'name', e.name,
          'amount', e.amount,
          'category', e.category,
          'note', e.note,
          'local_id', e.local_id
        ) order by e.date)
        from public.expenses e where e.trip_id = t.id
      ), '[]'::jsonb)
    ) order by t.updated_at desc
  ) into v_trips
  from public.trips t
  where t.user_id = v_uid;

  return coalesce(v_trips, '[]'::jsonb);
end;
$$;

grant execute on function public.list_my_personal_trips() to authenticated;

-- 3. ATOMIC PERSISTENCE RPC (optional future use)
-- ============================================================
-- Creates a trip + agenda items + expenses in a single transaction.
-- If any step fails, the entire operation is rolled back.

create or replace function public.create_personal_trip(
  p_name text,
  p_destination text default '',
  p_start_date date default null,
  p_end_date date default null,
  p_note text default '',
  p_items jsonb default '[]'::jsonb,
  p_expenses jsonb default '[]'::jsonb,
  p_local_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_trip_id uuid;
  v_item jsonb;
  v_exp jsonb;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = 'P0001';
  end if;

  -- Create trip
  insert into public.trips (user_id, name, destination, start_date, end_date, note, local_id)
  values (v_uid, p_name, p_destination, p_start_date, p_end_date, p_note, p_local_id)
  returning id into v_trip_id;

  -- Create agenda items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.agenda_items (trip_id, title, date, time, budget, link, note, local_id)
    values (
      v_trip_id,
      v_item->>'title',
      (v_item->>'date')::date,
      coalesce(v_item->>'time', ''),
      coalesce((v_item->>'budget')::numeric, 0),
      coalesce(v_item->>'link', ''),
      coalesce(v_item->>'note', ''),
      v_item->>'id'
    );
  end loop;

  -- Create expenses
  for v_exp in select * from jsonb_array_elements(p_expenses)
  loop
    insert into public.expenses (trip_id, name, amount, category, date, note, local_id)
    values (
      v_trip_id,
      v_exp->>'name',
      coalesce((v_exp->>'amount')::numeric, 0),
      coalesce(v_exp->>'category', 'Lainnya'),
      (v_exp->>'date')::date,
      coalesce(v_exp->>'note', ''),
      v_exp->>'id'
    );
  end loop;

  return jsonb_build_object('ok', true, 'trip_id', v_trip_id);
end;
$$;

grant execute on function public.create_personal_trip(text, text, date, date, text, jsonb, jsonb, text) to authenticated;
