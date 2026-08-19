-- Remove the stale 6-arg overload of create_expense left by CREATE OR REPLACE
-- (the new 7-arg variant with p_paid_by is the one the app calls).
-- Keeps a single clean function signature. Additive/safe cleanup.
drop function if exists public.create_expense(uuid, text, numeric, text, text, date);
