-- Fase C: fix wishlist permissions
-- 1. Create is_group_member helper (referenced by M4 routes but never defined)
-- 2. Grant EXECUTE on all wishlist-related functions to authenticated role

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_group_member(uuid) to authenticated;

-- Ensure wishlist RPCs are accessible by authenticated (incl anonymous-auth users)
grant execute on function public.list_wishlist_items(uuid) to authenticated;
grant execute on function public.add_wishlist_item(uuid, text, text, text, double precision, double precision) to authenticated;
grant execute on function public.convert_wishlist_to_itinerary(uuid, date, text) to authenticated;
