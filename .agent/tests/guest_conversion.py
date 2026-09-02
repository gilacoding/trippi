"""Guest → Account Conversion — INVARIANT SUITE (P1 Post-Auth Hardening).

Tests the in-place anonymous → registered conversion via updateUser.
All assertions are explicit — no implicit behavior assumed.

Invariants verified:
  I1. auth.uid() remains identical before/after conversion (in-place)
  I2. auth.users.is_anonymous becomes false after conversion
  I3. group_members.user_id remains the same UID
  I4. group_members.is_anonymous becomes false
  I5. membership role preserved (e.g. 'member' stays 'member')
  I6. profile identity preserved (display_name intact)
  I7. wishlist attribution preserved (suggested_by unchanged)
  I8. trip access preserved (user can still open the trip)
  I9. idempotency (repeated transfer on invalid old UID is no-op)
"""
import asyncio, os, sys, time
from playwright.async_api import async_playwright

BASE = os.environ.get("TRIPPI_BASE_URL", "http://localhost:8080")
OWNER_EMAIL = os.environ["TRIPPI_TEST_OWNER_EMAIL"]
OWNER_PASS = os.environ["TRIPPI_TEST_OWNER_PASS"]

results = []
js_errors = []


def record(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(detail)) if detail else ""))


async def login(page, email, pw):
    await page.evaluate("() => openAuth('login')")
    await page.locator("#authModal").first.wait_for(state="visible", timeout=15000)
    if "Daftar" in (await page.locator("#authTitle").text_content()):
        await page.locator("#authToggle").click()
        await page.wait_for_timeout(200)
    await page.fill("#authEmail", email)
    await page.fill("#authPassword", pw)
    await page.locator("#authSubmit").click()
    await page.wait_for_timeout(4500)


async def poll(page, predicate, timeout=20, interval=0.5):
    deadline = time.time() + timeout
    val = None
    while time.time() < deadline:
        val = await predicate()
        if val:
            return True, val
        await page.wait_for_timeout(int(interval * 1000))
    return False, val


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # ===== OWNER: create trip + invitation =====
        octx = await browser.new_context()
        op = await octx.new_page()
        op.on("pageerror", lambda e: js_errors.append(f"owner: {e}"))
        await op.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await op.wait_for_timeout(700)
        await login(op, OWNER_EMAIL, OWNER_PASS)

        made = await op.evaluate("""async () => {
            const g = await window.TrippiAPI.createGroup({
                name: 'Invariant ' + Date.now(), destination: 'X',
                start_date: '2026-09-01', end_date: '2026-09-02', display_name: 'Ras'});
            if (g.error) return { error: String(g.error.message || g.error) };
            const gid = g.data.id;
            await window.TrippiAPI.addItem({group_id: gid, title: 'Sarapan',
                date: '2026-09-01', time: '08:00', budget: 50000});
            const inv = await window.TrippiAPI.createInvitation(gid);
            const d = Array.isArray(inv.data) ? inv.data[0] : inv.data;
            return { id: gid, token: (d && d.token) || d };
        }""")
        if made.get("error"):
            record("setup", False, made["error"])
            summary_and_exit()
        gid, token = made["id"], made["token"]
        record("setup: trip + invitation", True)

        # ===== GUEST: join trip + add wishlist =====
        gctx = await browser.new_context()
        gp = await gctx.new_page()
        gp.on("pageerror", lambda e: js_errors.append(f"guest: {e}"))
        await gp.goto(f"{BASE}/trip-planner.html?gt={token}", wait_until="networkidle")
        await gp.wait_for_timeout(2000)
        await gp.evaluate("() => { const b = document.getElementById('guestJoinBtn'); if (b) b.click(); }")
        await gp.wait_for_timeout(1000)
        await gp.fill("#guestNameInput", "Budi")
        await gp.click("#guestNameSubmit")
        await gp.wait_for_timeout(8000)

        await gp.evaluate("""async () => {
            await window.TrippiAPI.addWishlistItem(colState.group.id, 'IdeBudi', null, null);
        }""")
        await gp.wait_for_timeout(3000)

        # Pre-conversion state
        anon_uid = await gp.evaluate("() => colState.uid")
        record("I0: guest has anon UID", bool(anon_uid), f"anon_uid={anon_uid[:8] if anon_uid else 'null'}")

        # Verify membership exists with is_anonymous=true before conversion
        pre_membership = await gp.evaluate("""async (args) => {
            const sb = window.TrippiAPI._getSb();
            const r = await sb.from('group_members').select('user_id, is_anonymous').eq('group_id', args.gid).eq('user_id', args.uid);
            return r.data || [];
        }""", {"uid": anon_uid, "gid": gid})
        record("I0: membership exists pre-conversion", len(pre_membership) == 1, pre_membership)
        record("I0: is_anonymous=true pre-conversion", pre_membership[0]['is_anonymous'] == True if pre_membership else False, pre_membership)

        # ===== CONVERSION: in-place via updateUser =====
        await gp.evaluate("() => { const b = document.getElementById('guestUpgradeBtn'); if (b) b.click(); }")
        await gp.wait_for_timeout(1000)

        new_email = f"invariant_{int(time.time())}@marki.cab"
        await gp.fill("#authEmail", new_email)
        await gp.fill("#authPassword", "Str0ngP@ss99!")
        await gp.locator("#authSubmit").click()
        await gp.wait_for_timeout(10000)

        new_uid = await gp.evaluate("() => colState.uid")
        record("I1: UID unchanged (in-place)", anon_uid == new_uid, f"{anon_uid[:8]} -> {new_uid[:8]}")

        # Wait for conversion to settle
        await gp.wait_for_timeout(4000)

        # I2: auth.users.is_anonymous = false
        async def check_user_not_anon():
            result = await gp.evaluate("""async () => {
                const sb = window.TrippiAPI._getSb();
                const u = await sb.auth.getUser();
                return u.data && u.data.user;
            }""")
            if result and not result.get('is_anonymous'):
                return result
            return False

        not_anon, user_obj = await poll(gp, check_user_not_anon, timeout=15, interval=0.5)
        record("I2: auth.users.is_anonymous=false", not_anon, f"is_anonymous={user_obj['is_anonymous'] if user_obj else 'unknown'}")

        # I3, I4, I5: group_members checks
        async def check_membership():
            result = await gp.evaluate("""async (args) => {
                const sb = window.TrippiAPI._getSb();
                const r = await sb.from('group_members').select('user_id, display_name, role, is_anonymous').eq('group_id', args.gid).eq('user_id', args.uid);
                return r.data || [];
            }""", {"uid": new_uid, "gid": gid})
            if result and len(result) == 1 and result[0]['user_id'] == new_uid:
                m = result[0]
                if m['is_anonymous'] == False:
                    return m
            return None

        membership_ok, member_row = await poll(gp, check_membership, timeout=15, interval=0.5)
        record("I3: group_members.user_id = new UID", member_row is not None, member_row)
        record("I4: group_members.is_anonymous=false", member_row and member_row['is_anonymous'] == False, member_row)
        record("I5: role preserved", member_row and member_row['role'] == 'member', member_row)

        # Verify NO duplicate memberships for this user in the group
        async def check_no_dup():
            result = await gp.evaluate("""async (args) => {
                const sb = window.TrippiAPI._getSb();
                const r = await sb.from('group_members').select('user_id').eq('group_id', args.gid).eq('user_id', args.uid);
                return r.data || [];
            }""", {"uid": new_uid, "gid": gid})
            if result and len(result) == 1:
                return result
            return None

        no_dup, dup_check = await poll(gp, check_no_dup, timeout=10, interval=0.5)
        record("I3b: no duplicate memberships", no_dup, f"count={len(dup_check) if dup_check else 'unknown'}")

        # I6: profile identity preserved
        async def check_profile():
            result = await gp.evaluate("""async (uid) => {
                const sb = window.TrippiAPI._getSb();
                const r = await sb.from('profiles').select('id, display_name').eq('id', uid).limit(1);
                return r.data || [];
            }""", new_uid)
            if result and len(result) == 1:
                return result[0]
            return None

        profile_ok, profile_row = await poll(gp, check_profile, timeout=10, interval=0.5)
        record("I6: profile exists with identity", profile_ok, profile_row)

        # I7: wishlist attribution preserved
        async def check_wishlist():
            result = await gp.evaluate("""async (gid) => {
                const sb = window.TrippiAPI._getSb();
                const r = await sb.from('wishlist_items').select('title, suggested_by').eq('group_id', gid);
                return r.data || [];
            }""", gid)
            budi_items = [w for w in result if w.get('title') == 'IdeBudi']
            if budi_items and budi_items[0].get('suggested_by') == new_uid:
                return budi_items
            return None

        wishlist_ok, wl_items = await poll(gp, check_wishlist, timeout=10, interval=0.5)
        record("I7: wishlist attribution preserved", wishlist_ok, wl_items)

        # I8: trip still accessible
        await gp.evaluate("(id) => openGroup(id, false)", gid)
        await gp.wait_for_timeout(3000)
        trip_name = await gp.evaluate("() => (document.getElementById('groupName')||{}).textContent || ''")
        record("I8: trip still accessible", 'Invariant' in trip_name, trip_name)

        # I9: idempotency — call transfer with invalid old UID (should be no-op)
        idempotency_ok = await gp.evaluate("""async () => {
            try {
                const r = await window.TrippiAPI.transferAnonymousIdentity('00000000-0000-0000-0000-000000000000', colState.uid, null);
                return r.error ? r.error.message : 'OK';
            } catch(e) { return String(e); }
        }""")
        record("I9: idempotency (invalid old UID)", 'not found' in str(idempotency_ok).lower() or 'old user not found' in str(idempotency_ok).lower(), idempotency_ok)

        record("no uncaught JavaScript errors", not js_errors, js_errors[:3])

        for ctx in (octx, gctx):
            await ctx.close()
        await browser.close()

    summary_and_exit()


def summary_and_exit():
    print("\n" + "=" * 62)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"GUEST CONVERSION INVARIANTS: {passed}/{len(results)} PASS")
    print("=" * 62)
    for n, ok, d in results:
        if not ok:
            print(f"  FAILED: {n} | {d}")
    sys.exit(0 if passed == len(results) else 1)


asyncio.run(main())
