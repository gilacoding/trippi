-- ============================================================
-- M3 Phase 2 — remove stale create_expense overload (p_date date)
-- There were TWO overloads of public.create_expense that differed only by
-- p_date type (date vs text). PostgREST could not pick one → ambiguous
-- function call error on expense create.
--
-- Source-of-truth: group_expenses.date column is `text` (M2 schema),
-- so the canonical overload is the `p_date text` version. This drops the
-- stale `date`-typed variant (and a possible 6-arg no-paid_by variant).
-- After this, exactly ONE create_expense(uuid,text,numeric,text,text,text,uuid)
-- remains. No logic change.
-- ============================================================

-- stale overload: p_date date + p_paid_by (the ambiguous one)
drop function if exists public.create_expense(uuid, text, numeric, text, text, date, uuid);
-- earlier 6-arg version without paid_by, if present
drop function if exists public.create_expense(uuid, text, numeric, text, text, date);
-- 7-arg without paid_by variant, if present
drop function if exists public.create_expense(uuid, text, numeric, text, text, text);

-- PostgREST schema cache: refresh so it sees the single resolved function.
-- (The reload NOTIFY is run separately via SQL editor / apply_migration caller
--  to ensure the cache propagates.)
