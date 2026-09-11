-- 2026-09-12: Expense as an isolated feature — personal vs trip.
-- Conceptual model: type = 'personal' | 'trip'. All existing rows become 'trip'
-- (behavior preserved). Privacy enforced at RLS + SECURITY DEFINER paths.

-- 1) Column
ALTER TABLE public.group_expenses
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'trip'
  CHECK (type IN ('personal','trip'));

-- 2) Collapse the 10 overlapping permissive policies to one per command.
-- SELECT: members see trip expenses + their own personal expenses ONLY.
DROP POLICY IF EXISTS "expenses_select_member"        ON public.group_expenses;
DROP POLICY IF EXISTS "group_expenses_select_member"  ON public.group_expenses;
DROP POLICY IF EXISTS "group members can read group_expenses" ON public.group_expenses;
DROP POLICY IF EXISTS "members can read group_expenses"       ON public.group_expenses;
CREATE POLICY "group_expenses_select_v2" ON public.group_expenses
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id)
         AND (type = 'trip' OR created_by = (SELECT auth.uid())));

-- UPDATE: same visibility rule; trip rows keep the existing member-writable
-- behavior, personal rows only the owner.
DROP POLICY IF EXISTS "expenses_update_member"       ON public.group_expenses;
DROP POLICY IF EXISTS "group_expenses_update_member" ON public.group_expenses;
CREATE POLICY "group_expenses_update_v2" ON public.group_expenses
  FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id)
         AND (type = 'trip' OR created_by = (SELECT auth.uid())))
  WITH CHECK (public.is_group_member(group_id));

-- DELETE: trip rows as before (any member), personal rows owner-only.
DROP POLICY IF EXISTS "expenses_delete_member"       ON public.group_expenses;
DROP POLICY IF EXISTS "group_expenses_delete_member" ON public.group_expenses;
CREATE POLICY "group_expenses_delete_v2" ON public.group_expenses
  FOR DELETE TO authenticated
  USING (public.is_group_member(group_id)
         AND (type = 'trip' OR created_by = (SELECT auth.uid())));

-- (INSERT policies left exactly as they are: members-only, type default 'trip'.)

-- 3) create_expense: gain p_type; validate it. SECURITY DEFINER bypasses RLS,
-- so this is the enforcement point for writes.
CREATE OR REPLACE FUNCTION public.create_expense(p_group_id uuid, p_name text, p_amount numeric, p_category text DEFAULT ''::text, p_note text DEFAULT ''::text, p_date text DEFAULT NULL::text, p_paid_by uuid DEFAULT NULL::uuid, p_type text DEFAULT 'trip')
 RETURNS TABLE(id uuid, group_id uuid, name text, amount numeric, category text, note text, date text, created_by uuid, paid_by uuid, type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_created_by uuid := auth.uid();
  v_paid_by     uuid := coalesce(p_paid_by, auth.uid());
begin
  if v_created_by is null then raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001'; end if;
  if p_type is null then p_type := 'trip'; end if;
  if p_type not in ('personal','trip') then
    raise exception 'invalid expense type: %', p_type using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.groups g where g.id = p_group_id) then raise exception 'group not found: %', p_group_id using errcode = 'P0001'; end if;
  -- personal rows are always paid by their owner; ignore caller-supplied payer
  if p_type = 'personal' then v_paid_by := v_created_by; end if;
  return query insert into public.group_expenses (group_id, name, amount, category, note, date, created_by, paid_by, type)
    values (p_group_id, trim(p_name), p_amount, coalesce(p_category,''), coalesce(p_note,''), p_date, v_created_by, v_paid_by, p_type)
    returning public.group_expenses.id, public.group_expenses.group_id, public.group_expenses.name, public.group_expenses.amount, public.group_expenses.category, public.group_expenses.note, public.group_expenses.date, public.group_expenses.created_by, public.group_expenses.paid_by, public.group_expenses.type;
end;
$function$;

-- 4) delete_expense: owner check ONLY for personal rows.
-- Trip-expense behavior (any member may delete) is intentionally unchanged.
CREATE OR REPLACE FUNCTION public.delete_expense(p_expense_id uuid)
 RETURNS TABLE(deleted_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid        uuid := auth.uid();
  v_group_id   uuid;
  v_type       text;
  v_creator    uuid;
  v_deleted    uuid;
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null'
      using ERRCODE = 'P0001';
  end if;

  select group_id, type, created_by into v_group_id, v_type, v_creator
  from public.group_expenses
  where id = p_expense_id;

  if not found then
    return query select null::uuid as deleted_id;
    return;
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = v_group_id and user_id = v_uid
  ) then
    raise exception 'not a group member'
      using ERRCODE = 'P0001';
  end if;

  if v_type = 'personal' and v_creator is distinct from v_uid then
    raise exception 'personal expenses can only be deleted by their owner'
      using ERRCODE = 'P0001';
  end if;

  delete from public.group_expenses
  where id = p_expense_id
  returning id into v_deleted;

  return query select v_deleted as deleted_id;
end;
$function$;

-- 5) guest_payload: SECURITY DEFINER — must explicitly filter.
-- Guests see TRIP expenses only, never anyone's personal rows.
CREATE OR REPLACE FUNCTION public.guest_payload(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  g      public.groups%rowtype;
  items  jsonb;
  exps   jsonb;
  mems   jsonb;
begin
  select * into g from public.groups where id = p_group_id;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'note', note, 'link', link, 'done', done, 'date', date, 'time', "time", 'budget', budget)), '[]'::jsonb)
    into items from public.shared_items where group_id = p_group_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'amount', amount, 'category', category, 'note', note, 'date', date)), '[]'::jsonb)
    into exps from public.group_expenses where group_id = p_group_id and type = 'trip';
  select coalesce(jsonb_agg(jsonb_build_object('display_name', display_name)), '[]'::jsonb)
    into mems from public.group_members where group_id = p_group_id;
  return jsonb_build_object('id', g.id, 'name', g.name, 'destination', g.destination, 'start_date', g.start_date, 'end_date', g.end_date, 'items', items, 'expenses', exps, 'members', mems);
end;
$function$;
