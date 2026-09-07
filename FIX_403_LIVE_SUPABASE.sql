-- ============================================================
-- APPLY THIS TO LIVE SUPABASE SQL EDITOR
-- Fixes HTTP 403 on trips, agenda_items, expenses tables
-- ============================================================

-- 1. GRANT access to authenticated role (fixes 403)
grant select, insert, update, delete on public.trips         to authenticated;
grant select, insert, update, delete on public.agenda_items  to authenticated;
grant select, insert, update, delete on public.expenses      to authenticated;
grant usage on schema public to anon, authenticated;

-- 2. Ensure RLS policies exist (owner-only)
-- trips: full CRUD for owner
drop policy if exists trips_owner_all on public.trips;
create policy trips_owner_all on public.trips
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- agenda_items: accessible iff parent trip is owned
drop policy if exists agenda_owner_all on public.agenda_items;
create policy agenda_owner_all on public.agenda_items
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

-- expenses: accessible iff parent trip is owned
drop policy if exists expenses_owner_all on public.expenses;
create policy expenses_owner_all on public.expenses
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

-- 3. Add day_number column if not exists
alter table if exists public.agenda_items add column if not exists day_number integer;
alter table if exists public.shared_items add column if not exists day_number integer;

-- 4. Create hydration RPC
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
  if v_uid is null then return '[]'::jsonb; end if;
  select jsonb_agg(
    jsonb_build_object(
      'id', t.id, 'name', t.name, 'destination', t.destination,
      'start_date', t.start_date, 'end_date', t.end_date, 'note', t.note,
      'local_id', t.local_id, 'created_at', t.created_at, 'updated_at', t.updated_at,
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'trip_id', a.trip_id, 'date', a.date, 'title', a.title,
        'time', a.time, 'budget', a.budget, 'link', a.link, 'note', a.note,
        'sort_idx', a.sort_idx, 'local_id', a.local_id
      ) order by a.date, a.sort_idx) from public.agenda_items a where a.trip_id = t.id), '[]'::jsonb),
      'expenses', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'trip_id', e.trip_id, 'date', e.date, 'name', e.name,
        'amount', e.amount, 'category', e.category, 'note', e.note, 'local_id', e.local_id
      ) order by e.date) from public.expenses e where e.trip_id = t.id), '[]'::jsonb)
    ) order by t.updated_at desc
  ) into v_trips
  from public.trips t where t.user_id = v_uid;
  return coalesce(v_trips, '[]'::jsonb);
end;
$$;

grant execute on function public.list_my_personal_trips() to authenticated;

-- 5. Atomic personal trip creation RPC
create or replace function public.create_personal_trip(
  p_name text, p_destination text default '',
  p_start_date date default null, p_end_date date default null,
  p_note text default '', p_items jsonb default '[]'::jsonb,
  p_expenses jsonb default '[]'::jsonb, p_local_id text default null
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
  if v_uid is null then raise exception 'unauthorized' using errcode = 'P0001'; end if;
  insert into public.trips (user_id, name, destination, start_date, end_date, note, local_id)
  values (v_uid, p_name, p_destination, p_start_date, p_end_date, p_note, p_local_id)
  returning id into v_trip_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.agenda_items (trip_id, title, date, time, budget, link, note, local_id)
    values (v_trip_id, v_item->>'title', (v_item->>'date')::date, coalesce(v_item->>'time',''),
            coalesce((v_item->>'budget')::numeric,0), coalesce(v_item->>'link',''),
            coalesce(v_item->>'note',''), v_item->>'id');
  end loop;
  for v_exp in select * from jsonb_array_elements(p_expenses) loop
    insert into public.expenses (trip_id, name, amount, category, date, note, local_id)
    values (v_trip_id, v_exp->>'name', coalesce((v_exp->>'amount')::numeric,0),
            coalesce(v_exp->>'category','Lainnya'), (v_exp->>'date')::date,
            coalesce(v_exp->>'note',''), v_exp->>'id');
  end loop;
  return jsonb_build_object('ok', true, 'trip_id', v_trip_id);
end;
$$;

grant execute on function public.create_personal_trip(text,text,date,date,text,jsonb,jsonb,text) to authenticated;
