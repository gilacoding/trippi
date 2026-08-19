-- ============================================================
-- MARKICAB M3 PHASE 1 — Membership roles + permission skeleton
-- Extends the proven M2 model. Additive + reversible.
-- No existing table/RPC/RLS semantics broken; existing RPCs updated
-- only to set the new `role` column at INSERT time.
--
-- Roles (initial): owner | member   (future: co-host/guide/viewer)
-- Permission matrix becomes code via trip_permissions().
-- ============================================================

-- 1) role column on group_members
alter table public.group_members
  add column if not exists role text not null default 'member'
  check (role in ('owner','member'));

-- 2) backfill: the trip creator is the owner; everyone else is a member
update public.group_members gm
  set role = 'owner'
  from public.groups g
  where gm.group_id = g.id
    and gm.user_id = g.created_by;

-- 3) block direct role escalation via client DML.
--    A member could otherwise UPDATE their own row (gm_update_self RLS)
--    to set role='owner'. Role may only be assigned at INSERT by the
--    SECURITY DEFINER RPCs below. display_name updates remain allowed.
create or replace function public.trg_block_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'role cannot be changed directly' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_group_members_role on public.group_members;
create trigger trg_group_members_role
  before update on public.group_members
  for each row execute function public.trg_block_role_change();

-- 4) create_group: creator inserted as owner
create or replace function public.create_group(
  p_name text, p_destination text, p_start_date date, p_end_date date, p_display_name text
)
returns table (
  group_id uuid, group_name text, created_by uuid, created_at timestamptz,
  destination text, start_date date, end_date date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id   uuid;
  v_created_by uuid := auth.uid();
  v_display    text;
  v_name       text;
  v_dest       text;
begin
  if v_created_by is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;
  v_name := trim(p_name);
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

  return query
    select g.id, g.name, g.created_by, g.created_at, g.destination, g.start_date, g.end_date
    from public.groups g where g.id = v_group_id;
end;
$$;

-- 4b) create_group_from_trip: creator inserted as owner
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
      insert into public.group_expenses (group_id, created_by, name, amount, category, note, date)
      values (v_group_id, v_created_by, exp_name, exp_amount, coalesce(exp->>'category',''), coalesce(exp->>'note',''), exp_date);
      expense_count := expense_count + 1;
    end loop;
  end if;

  return query
    select g.id, g.name, g.created_by, g.created_at, g.destination, g.start_date, g.end_date,
           (1 + item_count + expense_count)::integer as member_count
    from public.groups g where g.id = v_group_id;
end;
$$;

-- 4c) join_group: joiner inserted as member
create or replace function public.join_group(p_group_id uuid, p_display_name text)
returns table (group_id uuid, user_id uuid, display_name text, joined_at timestamptz, already_joined boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id  uuid := auth.uid();
  v_display  text;
  v_already  boolean;
begin
  if v_user_id is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.groups where id = p_group_id) then
    raise exception 'group not found: %', p_group_id using errcode = 'P0001';
  end if;
  v_display := trim(p_display_name);
  if v_display is null or length(v_display) = 0 then v_display := 'Guest'; end if;
  if length(v_display) > 40 then v_display := left(v_display, 40); end if;

  select true into v_already from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = v_user_id limit 1;
  if not found then v_already := false; end if;

  if not v_already then
    insert into public.group_members (group_id, user_id, display_name, role)
    values (p_group_id, v_user_id, v_display, 'member')
    on conflict on constraint group_members_pkey do nothing;
  end if;

  return query
    select gm.group_id, gm.user_id, gm.display_name, gm.joined_at, v_already as already_joined
    from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_user_id;
end;
$$;

-- 4d) redeem_invitation: authenticated guest joins as member
-- (anon token-view path still inserts no row — guests stay outside membership)
create or replace function public.redeem_invitation(p_token uuid, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv     record;
  v_uid   uuid := auth.uid();
  payload jsonb;
begin
  select * into inv from public.invitations where token = p_token;
  if not found then raise exception 'invalid invitation' using errcode = 'P0001'; end if;
  if inv.revoked then raise exception 'invitation revoked' using errcode = 'P0001'; end if;
  if inv.expires_at < now() then raise exception 'invitation expired' using errcode = 'P0001'; end if;
  if v_uid is not null then
    insert into public.group_members (group_id, user_id, display_name, role)
      values (inv.group_id, v_uid, coalesce(nullif(trim(p_display_name), ''), 'Guest'), 'member')
      on conflict on constraint group_members_pkey do nothing;
  end if;
  payload := public.guest_payload(inv.group_id);
  payload := payload || jsonb_build_object('is_member', (v_uid is not null));
  return payload;
end;
$$;

-- 4e) leave_group: members may leave; OWNERS cannot (must delete the trip)
create or replace function public.leave_group(p_group_id uuid)
returns table (removed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count   integer;
begin
  if v_user_id is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = v_user_id and role = 'owner'
  ) then
    raise exception 'owners cannot leave; delete the trip instead' using errcode = 'P0001';
  end if;
  delete from public.group_members where group_id = p_group_id and user_id = v_user_id;
  get diagnostics v_count = row_count;
  return query select (v_count > 0) as removed;
end;
$$;

-- 5) trip_permissions — the permission matrix as code (single source of truth)
create or replace function public.trip_permissions(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_role      text;
  v_is_member boolean := false;
  v_is_owner  boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object(
      'is_member', false, 'is_owner', false, 'can_view', false,
      'can_edit', false, 'can_add_expense', false, 'can_delete', false,
      'can_invite', false, 'can_manage_members', false
    );
  end if;
  select gm.role into v_role
  from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = v_uid;
  v_is_member := v_role is not null;
  v_is_owner  := v_role = 'owner';
  return jsonb_build_object(
    'is_member',          v_is_member,
    'is_owner',           v_is_owner,
    'can_view',           v_is_member,            -- members + owner; guests use token RPCs
    'can_edit',           v_is_member,            -- owner ✅, member ✅ (configurable later)
    'can_add_expense',    v_is_member,            -- owner ✅, member ✅
    'can_delete',         v_is_owner,             -- owner only
    'can_invite',         v_is_owner,             -- owner only (creator-only sharing)
    'can_manage_members', v_is_owner              -- owner only
  );
end;
$$;

-- 6) remove_member — owner-only; cannot remove the owner
create or replace function public.remove_member(p_group_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_target_role  text;
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = v_uid and role = 'owner'
  ) then
    raise exception 'only the trip owner can manage members' using errcode = 'P0001';
  end if;
  select role into v_target_role
  from public.group_members where group_id = p_group_id and user_id = p_user_id;
  if not found then return false; end if;
  if v_target_role = 'owner' then
    raise exception 'cannot remove the trip owner' using errcode = 'P0001';
  end if;
  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
  return true;
end;
$$;

-- 7) delete_group — owner-only (cascade removes members/items/expenses)
create or replace function public.delete_group(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.groups where id = p_group_id and created_by = v_uid) then
    raise exception 'only the trip owner can delete this trip' using errcode = 'P0001';
  end if;
  delete from public.groups where id = p_group_id;
  return true;
end;
$$;
