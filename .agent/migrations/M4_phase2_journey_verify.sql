-- ============================================================
-- M4.3 SECURITY CONTRACT VERIFICATION — structural assertions
-- ----------------------------------------------------------
-- Run in Supabase Dashboard SQL Editor (pure SQL, no psql meta-commands).
-- Since get_crew_locations reads auth.uid(), we cannot impersonate
-- different users in one session. This file asserts the PREDICATES
-- structurally; the runtime scenarios 1-8 are tested via the Node
-- harness in M4_3_DB_VERIFY.js (with separate JWTs per identity).
-- ============================================================

-- ── CHECK 1: Tables exist, member_locations absent ──
select
  (to_regclass('public.journey_sessions') is not null)    as journey_sessions_exists,
  (to_regclass('public.location_permissions') is not null) as location_permissions_exists,
  (to_regclass('public.member_locations') is null)         as member_locations_absent;  -- M4.3 must NOT create

-- ── CHECK 2: Partial unique index (one active per group) ──
select
  indexname,
  indexdef
from pg_indexes
where tablename = 'journey_sessions'
  and indexname = 'uniq_active_journey_per_group';

-- ── CHECK 3: All 6 RPCs exist, owned by postgres, SECURITY DEFINER ──
select
  p.proname        as func,
  r.rolname        as owner,
  (p.prosecdef = true)  as is_security_definer,
  pg_get_function_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_roles   r on r.oid = p.proowner
where n.nspname = 'public'
  and p.proname = any (array[
    'start_journey_session', 'end_journey_session',
    'grant_location_permission', 'revoke_location_permission',
    'explicit_deny_location_permission', 'get_crew_locations'
  ])
order by p.proname;
-- owner should be 'postgres' or a trusted role, is_security_definer = true

-- ── CHECK 4: Grants to authenticated, revokes from public ──
select
  p.proname,
  array_remove(
    array_agg(d.rolname order by d.rolname) filter (where d.rolname is not null),
    ''
  ) as grantees
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join pg_auth_members m on m.objid = p.oid and m.classid = 'pg_proc'::regclass
left join pg_roles d on d.oid = m.member
where n.nspname = 'public'
  and p.proname = any (array[
    'start_journey_session', 'end_journey_session',
    'grant_location_permission', 'revoke_location_permission',
    'explicit_deny_location_permission', 'get_crew_locations'
  ])
group by p.proname
order by p.proname;
-- grantees should contain 'authenticated' and NOT contain 'public'

-- ── CHECK 5: No caller-supplied p_user_id param ──
select
  p.proname          as func,
  pg_get_function_arguments(p.oid) as args,
  (pg_get_function_arguments(p.oid) ~* 'p_user_id') as has_user_id_param  -- must be false
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('grant_location_permission','revoke_location_permission',
                    'explicit_deny_location_permission');
-- Expected: has_user_id_param = false for all

-- ── CHECK 6: RLS policies exist on new tables ──
select
  tablename,
  policyname,
  cmd,
  pg_get_expr(qual, oid) as using_clause
from pg_policies
where schemaname = 'public'
  and tablename in ('journey_sessions','location_permissions')
order by tablename, policyname;

-- ── CHECK 7: get_crew_locations body has 4-admission gate + returns [] ──
--    (checks the source text of the function definition for key predicates)
select
  -- 1. caller authenticated check
  (pg_get_functiondef('public.get_crew_locations'::regprocedure) like '%v_uid is null%')  as check_caller_authenticated,
  -- 2. member check
  (pg_get_functiondef('public.get_crew_locations'::regprocedure) like '%v_is_member%')   as check_member,
  -- 3. active journey check
  (pg_get_functiondef('public.get_crew_locations'::regprocedure) like '%v_active%')     as check_active_journey,
  -- 4. own consent check
  (pg_get_functiondef('public.get_crew_locations'::regprocedure) like '%v_consent%')     as check_own_consent,
  -- returns empty when denied
  (pg_get_functiondef('public.get_crew_locations'::regprocedure) like '%[]%jsonb%')      as returns_empty_denied
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_crew_locations';

-- ── CHECK 8: start_journey_session rejects past end_date + computes expires_at ──
select
  (pg_get_functiondef('public.start_journey_session'::regprocedure) like '%end_date < current_date%')  as reject_past_end_date,
  (pg_get_functiondef('public.start_journey_session'::regprocedure) like '%least%')                    as uses_least_for_expires,
  (pg_get_functiondef('public.start_journey_session'::regprocedure) like '%23:59:59%')                 as bounds_to_trip_end,
  (pg_get_functiondef('public.start_journey_session'::regprocedure) like '%24 hours%')               as has_24h_cap,
  (pg_get_functiondef('public.start_journey_session'::regprocedure) like '%v_owner <> v_uid%')         as owner_gate
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'start_journey_session';

-- ── CHECK 9: M1-M3 RPCs unchanged (regression baseline) ──
select
  p.proname        as rpc,
  r.rolname        as owner,
  (p.prosecdef = true) as is_security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_roles   r on r.oid = p.proowner
where n.nspname = 'public'
  and p.proname = any (array[
    'create_group', 'join_group', 'create_group_from_trip',
    'create_shared_item', 'update_shared_item', 'delete_shared_item',
    'create_expense', 'delete_expense', 'leave_group',
    'list_my_groups', 'trip_permissions',
    'create_route', 'add_waypoint', 'reorder_waypoints',
    'get_route', 'delete_waypoint'
  ])
order by p.proname;
-- All 16 should exist, all is_security_definer = true

-- ── CHECK 10: No auto-create trigger on group_members ──
select
  t.tgname,
  t.tgrelid::regclass as target_table,
  case when count(*) filter (where t.tgname like '%locperm%') > 0
       then '⚠️ has auto-create trigger (BAD)'
       else '✅ no auto-create trigger on location_permissions'
  end as result
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'group_members'
  and t.tgname not like 'pg_%'
  and t.tgenabled = 'O'
group by t.tgname, t.tgrelid;
-- Expected: '✅ no auto-create trigger on location_permissions'
