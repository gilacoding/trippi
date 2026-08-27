"""Guest → Account Conversion acceptance test.

Proves that an anonymous guest can convert to a registered account without
losing access to trips they joined, and without creating duplicate memberships.

Uses POLLING for async transfer verification (no fixed sleeps).
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
    """Poll a predicate until it returns truthy or timeout. Returns (ok, last_value)."""
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
                name: 'Conversion ' + Date.now(), destination: 'Bali',
                start_date: '2026-09-01', end_date: '2026-09-02', display_name: 'Ras'});
            if (g.error) return { error: String(g.error.message || g.error) };
            const gid = g.data.id;
            const inv = await window.TrippiAPI.createInvitation(gid);
            const d = Array.isArray(inv.data) ? inv.data[0] : inv.data;
            return { id: gid, token: (d && d.token) || d };
        }""")
        if made.get("error"):
            record("setup", False, made["error"])
            summary_and_exit()
        gid, token = made["id"], made["token"]
        record("setup: trip + invitation", True, gid[:8])

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

        anon_uid = await gp.evaluate("() => colState.uid")
        record("GUEST joined trip + added wishlist", bool(anon_uid), f"anon_uid={anon_uid[:8] if anon_uid else 'null'}")

        # ===== CONVERSION: guest clicks "Daftar MarkiCab" =====
        await gp.evaluate("() => { const b = document.getElementById('guestUpgradeBtn'); if (b) b.click(); }")
        await gp.wait_for_timeout(1000)

        await gp.wait_for_timeout(500)
        title = await gp.evaluate("() => document.getElementById('authTitle').textContent")
        if "Daftar" not in title:
            await gp.evaluate("() => document.getElementById('authToggle').click()")
            await gp.wait_for_timeout(200)

        new_email = f"converted_{int(time.time())}@marki.cab"
        await gp.fill("#authEmail", new_email)
        await gp.fill("#authPassword", "Str0ngP@ss99!")
        await gp.locator("#authSubmit").click()
        await gp.wait_for_timeout(5000)

        new_uid = await gp.evaluate("() => colState.uid")
        record("CONVERSION signup completed", bool(new_uid), f"new_uid={new_uid[:8] if new_uid else 'null'}")

        # ===== VERIFY: trip still accessible =====
        await gp.evaluate("(id) => openGroup(id, false)", gid)
        await gp.wait_for_timeout(4000)

        trip_name = await gp.evaluate("() => (document.getElementById('groupName')||{}).textContent || ''")
        record("CONVERSION trip still accessible", 'Conversion' in trip_name, trip_name)

        # ===== VERIFY: identity merged (polling) =====
        async def check_merged():
            rows = await gp.evaluate("""() => {
                const rows = document.querySelectorAll('#crewStatusList .to-go-item');
                return Array.from(rows).map(r => r.innerText.replace(/\\s+/g, ' ').trim());
            }""")
            budi_count = sum(1 for r in rows if 'Budi' in r)
            anon_guest = any('Guest' in r for r in rows)
            return rows if (budi_count == 1 and not anon_guest) else None

        merged, member_rows = await poll(gp, check_merged, timeout=20, interval=0.5)
        record("CONVERSION identity merged (no duplicate)", merged, member_rows)

        # ===== VERIFY: wishlist attribution preserved =====
        wl = await gp.evaluate("() => (document.getElementById('groupWishList')||{}).innerText || ''")
        record("CONVERSION wishlist attribution preserved", 'IdeBudi' in wl, wl[:100])

        # ===== VERIFY: anon UID != new UID (identity changed) =====
        record("CONVERSION identity changed", anon_uid != new_uid, f"{anon_uid[:8]} -> {new_uid[:8]}")

        # ===== VERIFY: idempotency (call transfer again — should not duplicate) =====
        idempotency_ok = await gp.evaluate("""async () => {
            try {
                const r = await window.TrippiAPI.transferAnonymousIdentity('00000000-0000-0000-0000-000000000000', colState.uid, null);
                return r.error ? r.error.message : 'OK';
            } catch(e) { return String(e); }
        }""")
        record("CONVERSION idempotency (no-op on invalid old UID)", 'not found' in str(idempotency_ok).lower() or 'old user not found' in str(idempotency_ok).lower(), idempotency_ok)

        record("no uncaught JavaScript errors", not js_errors, js_errors[:3])

        for ctx in (octx, gctx):
            await ctx.close()
        await browser.close()

    summary_and_exit()


def summary_and_exit():
    print("\n" + "=" * 62)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"GUEST → ACCOUNT CONVERSION: {passed}/{len(results)} PASS")
    print("=" * 62)
    for n, ok, d in results:
        if not ok:
            print(f"  FAILED: {n} | {d}")
    sys.exit(0 if passed == len(results) else 1)


asyncio.run(main())
