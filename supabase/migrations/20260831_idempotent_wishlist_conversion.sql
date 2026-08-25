-- Idempotent wishlist conversion.
--
-- Found by the acceptance test: calling convert_wishlist_to_itinerary twice on the
-- same wishlist row created TWO agenda items. The row already records the agenda
-- item it produced (agenda_item_id), but the function never looked at it, so a
-- retry after a slow network silently duplicated the itinerary entry.
--
-- Behaviour change is limited to the retry case: if the row is already converted,
-- return the existing agenda_item_id instead of inserting again. Signature,
-- permissions and the creator-only rule are unchanged.

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
  ) then
    raise exception 'only the creator can convert wishlist to itinerary' using errcode = 'P0001';
  end if;

  -- Already converted: hand back the same agenda item, do not create another.
  if v_wishlist.agenda_item_id is not null then
    return jsonb_build_object(
      'ok', true,
      'agenda_item_id', v_wishlist.agenda_item_id,
      'already_converted', true
    );
  end if;

  insert into public.shared_items (group_id, title, note, link, date, time, created_by)
  values (v_wishlist.group_id, v_wishlist.title, v_wishlist.note, v_wishlist.link, p_date, p_time, v_uid)
  returning id into v_agenda_id;

  update public.wishlist_items
  set status = 'approved', agenda_item_id = v_agenda_id
  where id = p_wishlist_id;

  return jsonb_build_object('ok', true, 'agenda_item_id', v_agenda_id);
end;
$$;

grant execute on function public.convert_wishlist_to_itinerary(uuid, date, text) to authenticated;
