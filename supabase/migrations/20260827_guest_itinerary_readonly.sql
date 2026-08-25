-- P0 security fix: anonymous guests must be read-only on the itinerary.
--
-- Found by the Guest Trip acceptance test: the guest UI correctly hides every
-- edit control, but RLS still allowed a joined ANONYMOUS participant to write:
--     POST   /rest/v1/shared_items  -> 201 Created
--     DELETE /rest/v1/shared_items  -> 204 No Content
-- The hidden UI was the only thing stopping it, which is not a security boundary.
--
-- Locked product rule (matches trip_permissions, which already grants can_edit
-- to owners and registered members):
--     owner            : full itinerary control
--     registered member: full itinerary control
--     anonymous guest  : SELECT only
--
-- Anonymous users are identified by the JWT claim `is_anonymous`, which Supabase
-- Anonymous Auth sets. Registered members are unaffected.

create or replace function public.is_anonymous_caller()
returns boolean
language sql
stable
as $$
  select coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'is_anonymous')::boolean,
    false
  );
$$;

grant execute on function public.is_anonymous_caller() to authenticated;

-- shared_items: keep read for every member, restrict writes to non-anonymous members.
drop policy if exists "shared_items_insert_members" on public.shared_items;
drop policy if exists "shared_items_update_members" on public.shared_items;
drop policy if exists "shared_items_delete_members" on public.shared_items;

create policy "shared_items_insert_members" on public.shared_items
  for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and not public.is_anonymous_caller()
  );

create policy "shared_items_update_members" on public.shared_items
  for update to authenticated
  using (
    public.is_group_member(group_id)
    and not public.is_anonymous_caller()
  );

create policy "shared_items_delete_members" on public.shared_items
  for delete to authenticated
  using (
    public.is_group_member(group_id)
    and not public.is_anonymous_caller()
  );
