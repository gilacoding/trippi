# P0.4 — Deployment Status Report

## BLOCKER: Supabase Management API Permission Denied

**Error:** `403 error code: 1010` when trying to execute SQL via Management API.

**Cause:** The `SUPABASE_ACCESS_TOKEN` may be expired or lack DDL permissions on this legacy Supabase project.

**Founder action required:** Run the SQL migration manually in Supabase Dashboard SQL Editor.

---

## SQL to Run

File: `.agent/migrations/P0_4_wishlist_items_clean.sql`

Copy-paste the entire file into Supabase Dashboard → SQL Editor → Run.

---

## What This Migration Does

1. Creates `wishlist_items` table
2. Adds RLS policies (select/insert/update)
3. Creates 3 RPCs:
   - `add_wishlist_item` — any member can suggest
   - `convert_wishlist_to_itinerary` — owner only
   - `list_wishlist_items` — read wishlist

---

## After SQL Runs

The frontend code is NOT yet updated. Next steps:

1. Update `trippi-api.js` to expose new RPCs
2. Update `trip-planner.html` to render wishlist UI
3. Add "Add to Itin" conversion flow
4. Test end-to-end

---

## Status Summary

| Task | Status |
|---|---|
| Audit: current wishlist | ✅ Complete |
| Audit: journey backend | ✅ Complete |
| Propose: wishlist data model | ✅ Complete |
| SQL migration written | ✅ Ready to run |
| SQL migration deployed | ❌ BLOCKED (403) |
| Frontend implementation | ⏳ Pending SQL |
| Journey Mode audit | ✅ Complete |

---

## Additional GPT-4 Mini Advice Received

**Q: PostGIS or lat/lng?**
A: Use lat/lng floats (PostGIS not available in project)

**Q: RPC or client-side for convert?**
A: Server-side RPC (ensures data integrity)

**Q: Edge cases?**
- Member leaves group after suggesting → keep suggestion visible
- Duplicate suggestions → allow (different users, different intent)
- Rejected items → keep with status='rejected' for history

---

**Next:** Founder runs SQL migration, then Hermes continues with frontend implementation.
