-- ============================================================
-- M4.3 SECURITY CONTRACT VERIFICATION — negative cases
-- ----------------------------------------------------------
-- Tests the 8 admission-rule scenarios from m4_architecture.md §4.4
-- at the DB level. Because get_crew_locations reads auth.uid(),
-- we cannot impersonate different users inside a single session
-- via SQL. Instead this script asserts the PREDICATES structurally:
--   - RLS policy existence + correctness
--   - RPC param signatures (no p_user_id)
--   - get_crew_locations returns '[]' when ANY gate fails
--
-- The interactive runtime cases (1–8) are tested via the browser
-- Playwright harness (m43_e2e.py) using two auth identities.
-- This SQL file is the structural companion.
-- ============================================================

\set on_error_stop on
\echo '=== M4.3 Security Contract — Structural Verification ==='

-- ------------------------------------------------
-- A. location_permissions has NO trigger creating rows on join
-- ------------------------------------------------
\echo '[A] No auto-create trigger on group_members -> location_permissions'
SELECT
  t.tgname,
  t.tgrelid::regclass AS target_table,
  t.tgtype,
  (t.tgname ~* 'locperm') AS looks_auto_create  -- should be 0
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'group_members'
  AND t.tgname NOT LIKE 'pg_%'   -- exclude internal
  AND t.tgenabled = 'O';  -- only enabled triggers
-- Expected: 0 rows (no trigger creates location_permissions on membership)

-- ------------------------------------------------
-- B. get_crew_locations function body has the 4 admission checks
-- ------------------------------------------------
\echo '[B] get_crew_locations admission predicate (4 checks)'
SELECT
  (pg_get_functiondef('public.get_crew_locations'::regprocedure) ~* 'v_uid is null')           AS check_caller_authenticated,
  (pg_get_functiondef('public.get_crew_locations'::regprocedure) ~* 'v_is_member')              AS check_member,
  (pg_get_functiondef('public.get_crew_locations'::regprocedure) ~* 'v_active')                AS check_active_journey,
  (pg_get_functiondef('public.get_crew_locations'::regprocedure) ~* 'v_consent')               AS check_own_consent,
  (pg_get_functiondef('public.get_crew_locations'::regprocedure) ~* "group_id uuid")          AS takes_only_group_id,
  (pg_get_functiondef('public.get_crew_locations'::regprocedure) ~* "user_id = auth.uid()")    AS rls_uses_auth_uid,
  (pg_get_functiondef('public.get_crew_locations'::regprocedure) ~* "'\[\]'::jsonb")           AS returns_empty_denied;
-- Expected: ALL true = 1

-- ------------------------------------------------
-- C. Consent RPCs derive identity from auth.uid(), never p_user_id
-- ------------------------------------------------
\echo '[C] Consent RPCs — identity server-derived'
SELECT
  proname,
  pg_get_function_arguments(p.oid) AS args,
  NOT (pg_get_function_arguments(p.oid) ~* 'p_user_id')  AS no_user_id_param,
  (pg_get_functiondef(p.oid) ~* 'auth.uid\(\)')            AS uses_auth_uid,
  (pg_get_functiondef(p.oid) ~* 'is_group_member\|group_members.*user_id.*= .*auth.uid\|\.user_id = v_uid\|\.user_id = auth') AS membership_self_check
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('grant_location_permission', 'revoke_location_permission',
                    'explicit_deny_location_permission')
ORDER BY p.proname;
-- Expected: no_user_id_param = true, uses_auth_uid = true, membership_self_check = true

-- ------------------------------------------------
-- D. start/end_journey are owner-only (uses created_by = auth.uid check)
-- ------------------------------------------------
\echo '[D] Journey owner gating'
SELECT
  proname,
  (pg_get_functiondef(p.oid) ~* 'created_by.*<>.*auth.uid\|v_owner <> v_uid\|v_owner.*<>.*v_uid')  AS owner_gate,
  (pg_get_functiondef(p.oid) ~* 'end_date.*current_date\|end_date.*<.*current')                    AS reject_past_end_date
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('start_journey_session', 'end_journey_session')
ORDER BY p.proname;
-- Expected: owner_gate = true for both; reject_past_end_date = true for start

-- ------------------------------------------------
-- E. expires_at uses min(end_date, started_at + 24h) — NOT just now()+24h
-- ------------------------------------------------
\echo '[E] expires_at formula'
SELECT
  (pg_get_functiondef('public.start_journey_session'::regprocedure) ~* 'least')   AS uses_least,
  (pg_get_functiondef('public.start_journey_session'::regprocedure) ~* 'end_date.*23:59:59') AS bounds_to_trip_end,
  (pg_get_functiondef('public.start_journey_session'::regprocedure) ~* 'interval.*24 hour\|24.*hours') AS has_24h_cap,
  NOT (pg_get_functiondef('public.start_journey_session'::regprocedure) ~* 'now\(\)\s*\+.*24.*interval\|interval.*\\'24 hours\\'.*without.*end_date') AS not_naive_now_plus_24h_only
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'start_journey_session';
-- Expected: uses_least=true, bounds_to_trip_end=true, has_24h_cap=true

-- ------------------------------------------------
-- F. RLS row policies (the actual gate that PostgREST respects)
-- ------------------------------------------------
\echo '[F] RLS row-level gate on location_permissions'
SELECT
  policyname,
  cmd,
  pg_get_expr(t.qual, t.relid) AS using_clause
FROM pg_policy t
JOIN pg_class c ON c.oid = t.oid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'location_permissions'
  AND t.cmd = 'SELECT'
ORDER BY t.polname;
-- Expected: one SELECT policy using is_group_member(group_id)

\echo '=== Structural verification complete. Runtime cases 1-8 in m43_e2e.py ==='
