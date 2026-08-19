-- Fix M3 Phase 2 create_expense OUT param type: group_expenses.date is TEXT
-- (not date), so the RETURNS TABLE must declare `date text` to match, and
-- the body `where id` ambiguity is avoided by qualifying groups.id.
create or replace function public.create_expense(
  p_group_id uuid,
  p_name text,
  p_amount numeric,
  p_category text default '',
  p_note text default '',
  p_date text default null,
  p_paid_by uuid default null
)
returns table (
  id uuid, group_id uuid, name text, amount numeric,
  category text, note text, date text, created_by uuid, paid_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by uuid := auth.uid();
  v_paid_by     uuid := coalesce(p_paid_by, auth.uid());
begin
  if v_created_by is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.groups g where g.id = p_group_id) then
    raise exception 'group not found: %', p_group_id using errcode = 'P0001';
  end if;
  return query
    insert into public.group_expenses (group_id, name, amount, category, note, date, created_by, paid_by)
    values (p_group_id, trim(p_name), p_amount, coalesce(p_category,''), coalesce(p_note,''), p_date, v_created_by, v_paid_by)
    returning public.group_expenses.id, public.group_expenses.group_id, public.group_expenses.name,
            public.group_expenses.amount, public.group_expenses.category, public.group_expenses.note,
            public.group_expenses.date, public.group_expenses.created_by, public.group_expenses.paid_by;
end;
$$;
