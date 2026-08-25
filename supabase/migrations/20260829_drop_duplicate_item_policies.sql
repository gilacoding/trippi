-- P0 security fix, part 2: remove the redundant permissive policies that
-- defeated part 1.
--
-- Postgres ORs permissive policies together, so the anonymous-guest restriction
-- added in 20260827 had no effect: shared_items carried THREE overlapping sets of
-- write policies from earlier migrations, and the older ones only checked
-- membership:
--     items_insert_member / items_update_member / items_delete_member
--     shared_items_insert_member / _update_member / _delete_member      <- older
--     shared_items_insert_members / _update_members / _delete_members   <- 20260827
-- A joined anonymous guest satisfied the older ones, so INSERT returned 201 and
-- DELETE returned 204 even after the fix.
--
-- Keep exactly ONE policy per command: membership AND not anonymous.
-- SELECT is intentionally left permissive for every member (guests must read).

drop policy if exists "items_insert_member"         on public.shared_items;
drop policy if exists "items_update_member"         on public.shared_items;
drop policy if exists "items_delete_member"         on public.shared_items;
drop policy if exists "shared_items_insert_member"  on public.shared_items;
drop policy if exists "shared_items_update_member"  on public.shared_items;
drop policy if exists "shared_items_delete_member"  on public.shared_items;

-- Collapse the duplicated SELECT policies into one (same effect, less surface).
drop policy if exists "group members can read shared_items" on public.shared_items;
drop policy if exists "members can read shared_items"       on public.shared_items;
drop policy if exists "items_select_member"                 on public.shared_items;

drop policy if exists "shared_items_select_member" on public.shared_items;
create policy "shared_items_select_member" on public.shared_items
  for select to authenticated
  using (public.is_group_member(group_id));
