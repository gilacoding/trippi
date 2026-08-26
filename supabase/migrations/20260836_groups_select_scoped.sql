-- P0.6 security patch: stop leaking trip metadata from public.groups.
--
-- AUDIT FINDING (read from pg_policies via `supabase db query --linked`):
--     groups_select_authenticated | SELECT | {authenticated} | USING (true)
-- Every logged-in principal — including an anonymous guest that has joined no
-- trip at all — could read all 303 rows: name, destination, dates, created_by.
-- Verified live: a brand-new anonymous JWT got `206 content-range 0-1/303`.
--
-- The sibling tables were already correct, which is why itinerary/expenses/
-- members/journey/locations never leaked:
--     group_members : gm_select_members_in_group -> is_group_member(group_id)
--     groups UPDATE : groups_update_creator      -> created_by = auth.uid()
--     groups DELETE : groups_delete_creator      -> created_by = auth.uid()
-- Only the SELECT policy on the parent table was permissive.
--
-- WHY THIS DOES NOT BREAK THE GUEST FLOW (checked before writing this):
--   * get_guest_trip, guest_payload, redeem_invitation, list_my_groups and
--     trip_permissions are all SECURITY DEFINER (prosecdef = true), so they
--     bypass RLS and are unaffected.
--   * API.getGroup() does not touch the table — it calls list_my_groups().
--   * API.updateGroup() writes through the UPDATE policy, which is unchanged;
--     its .select() returns the row because the creator satisfies the new
--     SELECT policy via created_by.
--
-- Scope is deliberately narrow: SELECT only. No RPC signature changes, no
-- SECURITY DEFINER removed, no anon GRANT revoked (deferred to P2 per approval).

drop policy if exists "groups_select_authenticated" on public.groups;

create policy "groups_select_members_or_creator"
  on public.groups
  for select
  to authenticated
  using (
    public.is_group_member(id)
    or created_by = (select auth.uid())
  );
