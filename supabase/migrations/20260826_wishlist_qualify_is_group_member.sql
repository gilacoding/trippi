-- Fase C fix: qualify is_group_member() calls with the public schema.
--
-- Root cause: add_wishlist_item / list_wishlist_items are defined with
-- `set search_path = ''` (correct hardening) but call `is_group_member(...)`
-- unqualified, so resolution fails at runtime with
-- "function is_group_member(uuid) does not exist" (SQLSTATE 42883).
-- The helper itself is fine — calling it directly returns a boolean.
-- Same issue applies to the RLS policies on wishlist_items.
--
-- Only the call sites change; signatures, semantics and grants stay identical.

create or replace function public.add_wishlist_item(
  p_group_id uuid,
  p_title text,
  p_link text default null,
  p_note text default null,
  p_lat double precision default null,
  p_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthorized' using errcode = 'P0001'; end if;
  if not public.is_group_member(p_group_id) then raise exception 'not a member' using errcode = 'P0001'; end if;
  insert into public.wishlist_items (group_id, title, link, note, lat, lng, suggested_by)
  values (p_group_id, p_title, p_link, p_note, p_lat, p_lng, v_uid);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.list_wishlist_items(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthorized' using errcode = 'P0001'; end if;
  if not public.is_group_member(p_group_id) then raise exception 'not a member' using errcode = 'P0001'; end if;
  return (
    select jsonb_agg(row_to_json(t) order by t.created_at)
    from (
      select id, title, link, note, lat, lng, suggested_by, status, agenda_item_id, created_at
      from public.wishlist_items
      where group_id = p_group_id
    ) t
  );
end;
$$;

-- RLS policies: same unqualified-call problem.
drop policy if exists "wishlist_select_members" on public.wishlist_items;
create policy "wishlist_select_members" on public.wishlist_items
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "wishlist_insert_members" on public.wishlist_items;
create policy "wishlist_insert_members" on public.wishlist_items
  for insert to authenticated
  with check (public.is_group_member(group_id) and suggested_by = auth.uid());

drop policy if exists "wishlist_update_owner" on public.wishlist_items;
create policy "wishlist_update_owner" on public.wishlist_items
  for update to authenticated
  using (public.is_group_member(group_id) and exists (
    select 1 from public.group_members
    where group_id = wishlist_items.group_id and user_id = auth.uid() and role = 'owner'
  ));

grant execute on function public.add_wishlist_item(uuid, text, text, text, double precision, double precision) to authenticated;
grant execute on function public.list_wishlist_items(uuid) to authenticated;
