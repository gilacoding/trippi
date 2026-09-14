-- 2026-09-13: Drop the STALE 7-arg create_expense overload left behind by
-- 20260912_expense_type.sql.
--
-- ROOT CAUSE (found by live verification, commit e1eb5fb):
-- Adding p_type via CREATE OR REPLACE with a NEW signature did not replace the
-- old 7-arg function — it left BOTH overloads live. PostgREST cannot resolve a
-- named-args call that is ambiguous between overloads, so every
-- addExpensesBatch call (the exact payload: p_group_id, p_name, p_amount,
-- p_category, p_note, p_date, p_paid_by — no p_type) failed with:
--   PGRST203 "Could not choose the best candidate function"
-- That broke the "share trip to group" copy path in trip-planner.html.
--
-- The 8-arg replacement is a strict superset (p_type DEFAULT 'trip'), so the
-- 7-arg body below is dead code for every caller.
--
-- APPLIED LIVE 2026-09-13 via Supabase Management API.
-- Verified after: batch-path RPC call with member JWT (7 named args, no
-- p_type) -> 200, row inserted with type='trip'. Full RLS matrix 15/17 -> all
-- privacy cases PASS.

DROP FUNCTION IF EXISTS public.create_expense(
  uuid, text, numeric, text, text, text, uuid
);
