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
