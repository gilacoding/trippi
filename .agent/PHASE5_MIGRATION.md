# Phase 5 — Local-save → Supabase Source-of-Truth Migration

**Status:** AUDIT COMPLETE ✅ · DESIGN READY · Implementation PENDING approval (data-loss risk)
**Date:** 2026-08-18 · Autonomous mode

---

## 1. Audit findings (read-only, verified by grep)

**Persistence surfaces in `trippi-deploy`:**
| Mechanism | Keys | Contents | Location |
|---|---|---|---|
| `localStorage` | `trippi_personal_planner_v2` | **ALL personal trips** (`state.trips` = name/dest/dates/items/ expenses) + `state.toGo` wishlist | trip-planner.html:175,188-189 |
| `localStorage` | `trippi_personal_planner_v1` (legacy) | one-time migration source → v2 | trip-planner.html:176,189 |
| `localStorage` | `trippi_display_name` | display name (preferences) | trip-planner.html:184-185 |
| `sessionStorage` / `indexedDB` / cookies | — | **none** | grep: 0 matches |

**Conclusion:** The ONLY persistence is `localStorage`. There is **no server-side store for personal trip data.**

## 2. The dual-world problem

The app runs **two disconnected data worlds**:
- **Personal world (localStorage):** `state.trips` + `state.toGo`. This is what the user sees on Home and edits in the planner (`addAgenda`/`deleteItem`/`editInline` all write `state.trips` → `save()` → localStorage). **Device/browser-bound, lost on switch.**
- **Group/collaborative world (Supabase):** created via `createGroupDirectly` → RPCs `create_group`/`join_group`/`create_shared_item`/`create_expense`/etc. (the Phase-2/4 RPCs, now 10/10 routable).

**Disconnect evidence:**
- `addOrUpdateTrip` on CREATE calls `createGroupDirectly` (Supabase group) — so a "trip" becomes a "group" only at creation.
- But `addAgenda`/`deleteItem`/`editInline` write to `state.trips` (local), NOT to the group's Supabase items. So after creating a trip-as-group, agenda edits are local-only and never reach Supabase.
- The group is a **separate shareable snapshot**, not the live personal planner. Personal data and shared data diverge.

## 3. Goal

Make **Supabase the single source of truth** for trip data (personal + shared), with `localStorage` demoted to:
- **cache** (fast render) + **offline draft** (optimistic), never the authority.
- **preferences** (`trippi_display_name`) stay local — they're not app data.

## 4. Safe migration strategy (non-destructive)

> Rule (per founder roadmap): *add migration/cleanup logic BEFORE removing any existing local persistence.* Never delete localStorage source until Supabase backfill is verified.

**Phase A — Backfill (read + write, no delete):**
1. On auth, for the logged-in user, read `localStorage[STOR_KEY]` personal trips.
2. For each personal trip NOT yet in Supabase (match by a new `local_id` we stamp), insert into a **new `trips` table** (personal, `user_id` = auth.uid()) with child `agenda_items` + `expenses` tables.
3. Stamp `synced_at` + `supabase_trip_id` back into the local object (so we don't double-insert).
4. Keep writing to localStorage too (dual-write) during transition.

**Phase B — Source-of-truth switch:**
5. After backfill verified (local count == Supabase count for the user), flip reads to Supabase; localStorage becomes cache only.
6. Writes go to Supabase (optimistic local cache update for UX).
7. Only after a stabilization period, stop dual-writing and demote localStorage to cache/prefs.

**Phase C — Cleanup:** remove legacy `v1` key; keep `v2` as cache until Phase B stable.

## 5. Schema needed (NEW tables — additive, no change to existing RPCs/tables)
- `trips` (id uuid pk, user_id uuid fk auth.users, name, destination, start, end, note, created_at, updated_at, local_id text unique)
- `agenda_items` (id, trip_id fk, date, title, time, budget, link, note, order_idx)
- `expenses` (id, trip_id fk, date, name, amount, category, note)
- RLS: owner-only (`auth.uid() = user_id`) on `trips`; cascade to children.
- These are **new**, separate from the existing `groups`/`shared_items`/`expenses(group)` collaborative tables — no conflict.

## 6. Risk & guardrails
- **Data loss is the #1 risk.** Mitigation: never delete local source until backfill count-verified; keep dual-write; provide a "revert to local" kill-switch.
- **Anon users:** personal trips require auth. Until logged in, keep localStorage as the working store (don't force auth to plan). Backfill on first login.
- **Conflict resolution:** last-write-wins by `updated_at`; flag manual conflicts rather than silent drop.
- **No change to the 10 collaborative RPCs** (frozen/posture). New tables are additive.

## 7. Recommended implementation order (autonomous)
1. ✅ Audit (this doc).
2. Create `trips`/`agenda_items`/`expenses` tables + RLS (additive migration).
3. Add backfill logic (Phase A) guarded behind a feature flag.
4. Verify backfill count-matches in a test account; dual-write.
5. Flip source-of-truth (Phase B) after verification.
6. Cleanup (Phase C).

## 8. Decision needed from founder
- Approve creating the 3 new tables + RLS (additive, no existing change)?
- Approve the dual-write-then-switch approach (vs. a hard cutover)?
- Personal trips require login — acceptable, or keep a local-only "draft before login" mode?

**No code/database changes have been made for Phase 5 yet. This is analysis + design only.**
