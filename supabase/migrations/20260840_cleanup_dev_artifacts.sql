-- P0.7 part 4: clean up development artifacts from production.
--
-- APPROVAL: Option A + snapshot audit (cleanup_snapshot_anon_memberships_20260827.csv).
--
-- CONTAINMENT PROOF (measured before writing this):
--   * 190 anonymous users hold memberships ONLY in anon-created groups
--   * memberships_in_registered_user_trips = 0  (no registered user is affected)
--   * group names are clearly dev artifacts: notifyverify, reloadverify, grant1,
--     Trip Test, PAT, REG, X, FINAL, etc.
--
-- NOTE: first deploy failed on FK wishlist_items_suggested_by_fkey. Investigation:
--   45 wishlist + 4 shared_items reference anon users in groups owned by
--   REGISTERED users, where the anon is NOT a current member (is_member=0).
--   These are orphans from leave_group not cleaning up wishlist rows. Delete
--   them first so the anon users can be removed.

-- Orphan child rows that reference anon users but live in registered-user groups.
delete from public.wishlist_items
 where suggested_by in (select id from auth.users where is_anonymous=true)
   and group_id in (select g.id from public.groups g join auth.users u on u.id=g.created_by where u.is_anonymous=false);

delete from public.shared_items
 where created_by in (select id from auth.users where is_anonymous=true)
   and group_id in (select g.id from public.groups g join auth.users u on u.id=g.created_by where u.is_anonymous=false);

delete from public.group_expenses
 where created_by in (select id from auth.users where is_anonymous=true)
   and group_id in (select g.id from public.groups g join auth.users u on u.id=g.created_by where u.is_anonymous=false);

-- Child rows of anon-created groups.
delete from public.member_locations where group_id in (
  select g.id from public.groups g join auth.users u on u.id=g.created_by
  where u.is_anonymous=true
);
delete from public.location_permissions where group_id in (
  select g.id from public.groups g join auth.users u on u.id=g.created_by
  where u.is_anonymous=true
);
delete from public.journey_sessions where group_id in (
  select g.id from public.groups g join auth.users u on u.id=g.created_by
  where u.is_anonymous=true
);
delete from public.wishlist_items where group_id in (
  select g.id from public.groups g join auth.users u on u.id=g.created_by
  where u.is_anonymous=true
);
delete from public.group_expenses where group_id in (
  select g.id from public.groups g join auth.users u on u.id=g.created_by
  where u.is_anonymous=true
);
delete from public.shared_items where group_id in (
  select g.id from public.groups g join auth.users u on u.id=g.created_by
  where u.is_anonymous=true
);
delete from public.invitations where group_id in (
  select g.id from public.groups g join auth.users u on u.id=g.created_by
  where u.is_anonymous=true
);
delete from public.group_members where group_id in (
  select g.id from public.groups g join auth.users u on u.id=g.created_by
  where u.is_anonymous=true
);

delete from public.groups where created_by in (select id from auth.users where is_anonymous=true);

delete from public.profiles where id in (select id from auth.users where is_anonymous=true);
delete from auth.users where is_anonymous=true;

delete from public.profiles where id in (
  select id from auth.users where email like 'p1probe_%' or email like 'p1sess_%' or email like 'pwtest_%'
);
delete from auth.users where email like 'p1probe_%' or email like 'p1sess_%' or email like 'pwtest_%';
