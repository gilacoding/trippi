# Stabilization Pass — Pre-existing Regression Fixes (2026-08-29)

## Guest Map Failure (guest_ui_revision.py)

**Root cause:** Test used dates `2026-08-26` / `2026-08-27` which were in the past by the time the test ran. Journey sessions with past end dates are expired, so the map container (`#crewMapContainer`) was hidden via `hideCrewMap()`.

**Fix:** Changed test dates to future dates (`2026-09-26` / `2026-09-27`).

**Lesson:** Always use future dates for journey/trip tests. Past dates cause journey session expiry.

## Guest → Account Conversion (guest_conversion.py)

**Root cause:** Two bugs compounded:
1. `wasAnon` detection called `API.getUserObject()` AFTER `signUpWithEmail()`, so it returned the NEW user (not anonymous). Transfer never fired.
2. After transfer, `get_group_identities` read `is_anonymous` from `auth.users` (stale), not from `group_members`.

**Fix:**
1. Capture anon state BEFORE signup: `var oldUser = await API.getUserObject();` then `var wasAnon = !!(oldUser && oldUser.is_anonymous);`
2. Added `is_anonymous` column to `group_members`, updated by `redeem_invitation` and `transfer_anonymous_identity`
3. `get_group_identities` now reads `gm.is_anonymous` as source of truth
4. Test now verifies via API (deterministic), not DOM (flaky)

**Lesson:** Supabase Auth creates a NEW user on `signUpWithEmail()` — the anonymous user is NOT upgraded in-place. Always capture anon state before signup.

## Gallery v1 — Storage Path Bug

**Root cause:** `storage.from('gallery').upload(storagePath, ...)` already prefixes the bucket. Including `gallery/` in `storagePath` caused Supabase to try creating `gallery/gallery/...`, failing the storage policy `split_part(name, '/', 1)::uuid` check.

**Fix:** Removed `gallery/` prefix from `storagePath`.

## Gallery v1 — Delete Policy (Gate 9)

**Root cause:** PostgREST DELETE policies silently filter rows (HTTP 200 with 0 affected rows) instead of raising errors for denied operations. A member non-creator could "delete" an owner's photo — the API returned 200 but the photo was NOT actually deleted.

**Fix:** BEFORE DELETE trigger `gallery_delete_policy_trigger` raises exception with `errcode = '42501'` when caller is neither uploader nor group creator.

**Lesson:** For security-critical DELETE operations, always use a BEFORE DELETE trigger — RLS USING clauses alone don't produce proper 403 errors.

## Migration Version Collision

**Root cause:** Writing a migration with a timestamp that already exists in `supabase_migrations.schema_migrations` causes `ERROR: duplicate key value violates unique constraint "schema_migrations_pkey" (SQLSTATE 23505)`.

**Fix:** Rename to a higher timestamp, or run `supabase migration repair --status reverted <version>` then re-push.

## Service Role 403 on Table Queries

**Root cause:** Even the service role gets `403 "permission denied for table <table>"` if table-level grants are missing.

**Fix:** `grant select, insert, update, delete on public.<table> to service_role;`
