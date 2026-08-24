create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null,
  link text,
  note text,
  lat double precision,
  lng double precision,
  suggested_by uuid references auth.users(id),
  status text not null default 'suggested'
    check (status in ('suggested', 'approved', 'rejected')),
  agenda_item_id uuid references public.shared_items(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_wishlist_group on public.wishlist_items (group_id);

alter table public.wishlist_items enable row level security;

drop policy if exists "wishlist_select_members" on public.wishlist_items cascade;
create policy "wishlist_select_members" on public.wishlist_items
  for select to authenticated
  using (is_group_member(group_id));

drop policy if exists "wishlist_insert_members" on public.wishlist_items cascade;
create policy "wishlist_insert_members" on public.wishlist_items
  for insert to authenticated
  with check (is_group_member(group_id) and suggested_by = auth.uid());

drop policy if exists "wishlist_update_owner" on public.wishlist_items cascade;
create policy "wishlist_update_owner" on public.wishlist_items
  for update to authenticated
  using (is_group_member(group_id) and exists (
    select 1 from public.group_members
    where group_id = wishlist_items.group_id and user_id = auth.uid() and role = 'owner'
  ));

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
  if not is_group_member(p_group_id) then raise exception 'not a member' using errcode = 'P0001'; end if;
  insert into public.wishlist_items (group_id, title, link, note, lat, lng, suggested_by)
  values (p_group_id, p_title, p_link, p_note, p_lat, p_lng, v_uid);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.convert_wishlist_to_itinerary(
  p_wishlist_id uuid,
  p_date date,
  p_time text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_wishlist record;
  v_agenda_id uuid;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode = 'P0001'; end if;
  select * into v_wishlist from public.wishlist_items where id = p_wishlist_id;
  if not found then raise exception 'wishlist item not found' using errcode = 'P0001'; end if;
  if not exists (
    select 1 from public.group_members
    where group_id = v_wishlist.group_id and user_id = v_uid and role = 'owner'
  ) then raise exception 'only the creator can convert wishlist to itinerary' using errcode = 'P0001'; end if;
  insert into public.shared_items (group_id, title, note, link, date, time, created_by)
  values (v_wishlist.group_id, v_wishlist.title, v_wishlist.note, v_wishlist.link, p_date, p_time, v_uid)
  returning id into v_agenda_id;
  update public.wishlist_items
  set status = 'approved', agenda_item_id = v_agenda_id
  where id = p_wishlist_id;
  return jsonb_build_object('ok', true, 'agenda_item_id', v_agenda_id);
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
  if not is_group_member(p_group_id) then raise exception 'not a member' using errcode = 'P0001'; end if;
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

grant execute on function public.add_wishlist_item(uuid, text, text, text, double precision, double precision) to authenticated;
grant execute on function public.convert_wishlist_to_itinerary(uuid, date, text) to authenticated;
grant execute on function public.list_wishlist_items(uuid) to authenticated;
grant select, insert, update on public.wishlist_items to authenticated;
