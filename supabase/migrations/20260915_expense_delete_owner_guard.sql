-- Fix: group_expenses_delete_v2 allowed ANY member to delete ANY trip expense,
-- including expenses created by other members/owners. This violates the brief's
-- "Delete own expense ✓" rule.
--
-- New policy: members can delete their OWN expenses (personal or trip).
-- Owners can delete ANY trip expense in their group (admin).
-- Personal expenses remain owner-only (enforced by delete_expense RPC + this policy).

drop policy if exists group_expenses_delete_v2 on public.group_expenses;

create policy group_expenses_delete_v3 on public.group_expenses
for delete using (
  is_group_member(group_id) and (
    created_by = auth.uid()
    or exists (
      select 1 from public.groups
      where id = group_id and created_by = auth.uid()
    )
  )
);
