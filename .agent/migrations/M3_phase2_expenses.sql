-- ============================================================
-- MARKICAB M3 PHASE 2 — Expense payer (small additive change)
-- Adds paid_by to group_expenses so expenses record WHO PAID
-- (data-quality foundation for future "settle balance").
-- Additive + reversible. No RLS/permission change.
-- ============================================================

-- 1) paid_by column (nullable uuid; defaults handled at insert time)
alter table public.group_expenses
  add column if not exists paid_by uuid;

-- 2) backfill: for existing rows, the person who logged it paid
update public.group_expenses
  set paid_by = created_by
  where paid_by is null;

-- 3) create_expense: accept p_paid_by (defaults to the logging user)
create or replace function public.create_expense(
  p_group_id uuid,
  p_name text,
  p_amount numeric,
  p_category text default '',
  p_note text default '',
  p_date date default null,
  p_paid_by uuid default null
)
returns table (
  id uuid, group_id uuid, name text, amount numeric,
  category text, note text, date date, created_by uuid, paid_by uuid
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
  if not exists (select 1 from public.groups where id = p_group_id) then
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

-- 4) create_group_from_trip: set paid_by on batch-inserted expenses too
create or replace function public.create_group_from_trip(
  p_trip_name text, p_destination text, p_start_date date, p_end_date date,
  p_display_name text, p_items jsonb, p_expenses jsonb
)
returns table (
  group_id uuid, group_name text, created_by uuid, created_at timestamptz,
  destination text, start_date date, end_date date, member_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id    uuid;
  v_created_by  uuid := auth.uid();
  v_display     text;
  v_name        text;
  v_dest        text;
  item          jsonb;
  exp           jsonb;
  item_count    integer := 0;
  expense_count integer := 0;
  item_title    text;
  item_date     date;
  exp_name      text;
  exp_amount    numeric;
  exp_date      date;
begin
  if v_created_by is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;
  v_name := trim(p_trip_name);
  if v_name is null or length(v_name) = 0 then raise exception 'name is required'; end if;
  if length(v_name) > 100 then raise exception 'name exceeds 100 characters'; end if;
  if p_destination is not null then
    v_dest := trim(p_destination);
    if length(v_dest) > 200 then raise exception 'destination exceeds 200 characters'; end if;
  else v_dest := null; end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise exception 'start cannot be after end date';
  end if;
  v_display := trim(p_display_name);
  if v_display is null or length(v_display) = 0 then v_display := 'Creator'; end if;
  if length(v_display) > 40 then v_display := left(v_display, 40); end if;

  insert into public.groups (name, destination, start_date, end_date, created_by)
  values (v_name, v_dest, p_start_date, p_end_date, v_created_by)
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, display_name, role)
  values (v_group_id, v_created_by, v_display, 'owner')
  on conflict on constraint group_members_pkey do nothing;

  if p_items is not null then
    if jsonb_typeof(p_items) != 'array' then raise exception 'invalid items data: expected JSON array'; end if;
    for item in select value from jsonb_array_elements(p_items)
    loop
      if jsonb_typeof(item) != 'object' then raise exception 'invalid item: expected JSON object'; end if;
      item_title := trim(item->>'title');
      if item_title is null or length(item_title) = 0 then raise exception 'item title is required'; end if;
      item_date := null;
      if (item->>'date') is not null and (item->>'date') != '' then
        begin item_date := (item->>'date')::date; exception when invalid_text_representation then raise exception 'invalid date format for item: %', item->>'date'; end;
      end if;
      if (item->>'budget') is not null and (item->>'budget') != '' then
        begin perform (item->>'budget')::integer; exception when invalid_text_representation then raise exception 'invalid budget value for item: %', item->>'budget'; end;
      end if;
      insert into public.shared_items (group_id, created_by, title, note, link, done, date, "time", budget)
      values (v_group_id, v_created_by, item_title, coalesce(item->>'note',''), coalesce(item->>'link',''),
              coalesce((item->>'done')::boolean, false), item_date, item->>'time', (item->>'budget')::integer);
      item_count := item_count + 1;
    end loop;
  end if;

  if p_expenses is not null then
    if jsonb_typeof(p_expenses) != 'array' then raise exception 'invalid expenses data: expected JSON array'; end if;
    for exp in select value from jsonb_array_elements(p_expenses)
    loop
      if jsonb_typeof(exp) != 'object' then raise exception 'invalid expense: expected JSON object'; end if;
      exp_name := trim(exp->>'name');
      if exp_name is null or length(exp_name) = 0 then raise exception 'expense name is required'; end if;
      exp_date := null;
      if (exp->>'date') is not null and (exp->>'date') != '' then
        begin exp_date := (exp->>'date')::date; exception when invalid_text_representation then raise exception 'invalid date format for expense: %', exp->>'date'; end;
      end if;
      exp_amount := null;
      if (exp->>'amount') is not null and (exp->>'amount') != '' then
        begin exp_amount := (exp->>'amount')::numeric; exception when invalid_text_representation then raise exception 'invalid amount for expense: %', exp->>'amount'; end;
      end if;
      insert into public.group_expenses (group_id, created_by, name, amount, category, note, date, paid_by)
      values (v_group_id, v_created_by, exp_name, exp_amount, coalesce(exp->>'category',''), coalesce(exp->>'note',''), exp_date, v_created_by);
      expense_count := expense_count + 1;
    end loop;
  end if;

  return query
    select g.id, g.name, g.created_by, g.created_at, g.destination, g.start_date, g.end_date,
           (1 + item_count + expense_count)::integer as member_count
    from public.groups g where g.id = v_group_id;
end;
$$;
