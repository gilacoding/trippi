-- Fix: delete_expense RPC (SECURITY DEFINER) only blocked deleting OTHER users'
-- personal expenses. Trip expenses had NO guard — any member could delete any
-- trip expense. Add: trip expenses can only be deleted by their creator or the
-- group owner.

create or replace function public.delete_expense(p_expense_id uuid)
returns table(deleted_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
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

  -- Trip expenses: only creator or group owner can delete
  if v_type = 'trip' and v_creator is distinct from v_uid and not exists (
    select 1 from public.groups
    where id = v_group_id and created_by = v_uid
  ) then
    raise exception 'trip expenses can only be deleted by their creator or the group owner'
      using ERRCODE = 'P0001';
  end if;

  delete from public.group_expenses
  where id = p_expense_id
  returning id into v_deleted;

  return query select v_deleted as deleted_id;
end;
$function$;
