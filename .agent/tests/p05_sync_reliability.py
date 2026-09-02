"""P0.5 — Trip Sync Reliability.

Contract under test:
    DB is the source of truth. realtime / poll / focus / visibility / reconnect are
    all just different roads to the SAME reconcile(), which fetches an authoritative
    snapshot and replaces state.

Hard rule: no assertion may depend on a reload. Every convergence check runs on a
live page. If the client needs F5 to show server state, that is a FAIL.
"""
import asyncio, os, sys, json
from playwright.async_api import async_playwright

BASE = os.environ.get("TRIPPI_BASE_URL", "http://localhost:8080")
EMAIL = os.environ["TRIPPI_TEST_OWNER_EMAIL"]
PASS = os.environ["TRIPPI_TEST_OWNER_PASS"]

results = []
js_errors = []


def record(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(detail)) if detail else ""))


async def login(page):
    await page.evaluate("() => document.querySelector('#newTripBtn').click()")
    await page.wait_for_timeout(500)
    await page.locator("#authModal").first.wait_for(state="visible", timeout=15000)
    if "Daftar" in (await page.locator("#authTitle").text_content()):
        await page.locator("#authToggle").click()
        await page.wait_for_timeout(200)
    await page.fill("#authEmail", EMAIL)
    await page.fill("#authPassword", PASS)
    await page.locator("#authSubmit").click()
    await page.wait_for_timeout(4000)


async def converges(page, predicate, timeout=30000):
    """Wait on a LIVE page. Never reloads — so F5 cannot rescue a failure."""
    try:
        await page.wait_for_function(predicate, timeout=timeout)
        return True
    except Exception:
        return False


async def kill_realtime(page):
    return await page.evaluate(
        """async () => {
            const sb = window.MarkiAPI._getSb();
            for (const c of sb.getChannels()) { await sb.removeChannel(c); }
            return sb.getChannels().length;
        }"""
    )


async def go_hidden(page):
    await page.evaluate(
        """() => {
            Object.defineProperty(document, 'visibilityState', {value:'hidden', configurable:true});
            Object.defineProperty(document, 'hidden', {value:true, configurable:true});
            document.dispatchEvent(new Event('visibilitychange'));
        }"""
    )


async def go_visible(page):
    await page.evaluate(
        """() => {
            Object.defineProperty(document, 'visibilityState', {value:'visible', configurable:true});
            Object.defineProperty(document, 'hidden', {value:false, configurable:true});
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('focus'));
        }"""
    )


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # Device A = "phone", Device B = "desktop": two contexts, one account.
        actx = await browser.new_context(viewport={"width": 390, "height": 844})
        bctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        ap, bp = await actx.new_page(), await bctx.new_page()
        ap.on("pageerror", lambda e: js_errors.append(f"A: {e}"))
        bp.on("pageerror", lambda e: js_errors.append(f"B: {e}"))

        for pg in (ap, bp):
            await pg.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
            await pg.wait_for_timeout(700)
        await ap.evaluate("() => localStorage.setItem('trippi_display_name', 'Ras')")
        await login(ap)
        await login(bp)

        made = await ap.evaluate(
            """async () => {
                const g = await window.MarkiAPI.createGroup({
                    name: 'Sync ' + Date.now(), destination: 'Nigeria',
                    start_date: '2026-09-01', end_date: '2026-09-02', display_name: 'Ras'});
                if (g.error) return { error: String(g.error.message || g.error) };
                return { id: g.data.id };
            }"""
        )
        if made.get("error"):
            record("setup", False, made["error"])
            summary_and_exit()
        gid = made["id"]

        await ap.evaluate("(id) => openGroup(id, false)", gid)
        await ap.wait_for_timeout(3000)

        # A adds an item BEFORE B ever opens the trip -> tests initial hydration
        await ap.evaluate(
            """async () => { await window.MarkiAPI.addItem({group_id: colState.group.id,
                title: 'BeforeBOpened', date: '2026-09-01', time: '08:00', budget: 1000}); }"""
        )
        await ap.wait_for_timeout(3000)

        await bp.evaluate("(id) => openGroup(id, false)", gid)
        ok = await converges(bp, """() => (colState.items || []).some(i => i.title === 'BeforeBOpened')""")
        record("HYDRATION second device sees pre-existing itinerary on first open", ok,
               await bp.evaluate("() => (colState.items||[]).map(i => i.title)"))

        hydrated = await bp.evaluate(
            """async () => {
                const s = await window.MarkiAPI.getItems(colState.group.id);
                return { state: (colState.items || []).length, server: (s.data || []).length };
            }"""
        )
        record("HYDRATION state matches server exactly",
               hydrated["state"] == hydrated["server"] and hydrated["server"] > 0, hydrated)

        # ---------- both directions, live ----------
        await ap.evaluate(
            """async () => { await window.MarkiAPI.addItem({group_id: colState.group.id,
                title: 'FromPhone', date: '2026-09-01', time: '09:00'}); }"""
        )
        ok = await converges(bp, """() => (colState.items || []).some(i => i.title === 'FromPhone')""")
        record("MULTI-DEVICE phone itinerary -> desktop (no F5)", ok)

        await bp.evaluate(
            """async () => { await window.MarkiAPI.addItem({group_id: colState.group.id,
                title: 'FromDesktop', date: '2026-09-02', time: '10:00'}); }"""
        )
        ok = await converges(ap, """() => (colState.items || []).some(i => i.title === 'FromDesktop')""")
        record("MULTI-DEVICE desktop itinerary -> phone (no F5)", ok)

        await ap.evaluate(
            """async () => { await window.MarkiAPI.addExpense({group_id: colState.group.id,
                name: 'BensinPhone', amount: 50000, category: 'Transport', date: '2026-09-01'}); }"""
        )
        ok = await converges(bp, """() => (colState.expenses || []).some(e => e.name === 'BensinPhone')""")
        record("MULTI-DEVICE phone expense -> desktop (no F5)", ok)

        await bp.evaluate(
            """async () => { await window.MarkiAPI.addExpense({group_id: colState.group.id,
                name: 'HotelDesktop', amount: 300000, category: 'Hotel', date: '2026-09-02'}); }"""
        )
        ok = await converges(ap, """() => (colState.expenses || []).some(e => e.name === 'HotelDesktop')""")
        record("MULTI-DEVICE desktop expense -> phone (no F5)", ok)

        await ap.evaluate(
            """async () => { await window.MarkiAPI.addWishlistItem(
                colState.group.id, 'WishPhone', null, null); }"""
        )
        ok = await converges(bp, """() => (colState.wishlists || []).some(w => w.title === 'WishPhone')""")
        record("MULTI-DEVICE phone wishlist -> desktop (no F5)", ok)

        await bp.evaluate(
            """async () => { await window.MarkiAPI.addWishlistItem(
                colState.group.id, 'WishDesktop', null, null); }"""
        )
        ok = await converges(ap, """() => (colState.wishlists || []).some(w => w.title === 'WishDesktop')""")
        record("MULTI-DEVICE desktop wishlist -> phone (no F5)", ok)

        await ap.evaluate(
            """async () => {
                const items = await window.MarkiAPI.getItems(colState.group.id);
                const t = (items.data || []).find(i => i.title === 'FromDesktop');
                if (t) await window.MarkiAPI.deleteItem(t.id);
            }"""
        )
        ok = await converges(bp, """() => !(colState.items || []).some(i => i.title === 'FromDesktop')""")
        record("MULTI-DEVICE deletion propagates (no F5)", ok)

        # ══════════════ FAILURE SIMULATION ══════════════
        # 1. realtime completely dead on B
        left = await kill_realtime(bp)
        record("FAILURE realtime torn down on desktop", left == 0, f"channels={left}")
        await ap.evaluate(
            """async () => { await window.MarkiAPI.addItem({group_id: colState.group.id,
                title: 'WhileSocketDead', date: '2026-09-01', time: '11:00'}); }"""
        )
        ok = await converges(bp, """() => (colState.items || []).some(i => i.title === 'WhileSocketDead')""")
        record("FAILURE converges with NO realtime (poll safety net, no F5)", ok,
               await bp.evaluate("() => (colState.items||[]).map(i => i.title)"))

        # 2. hidden tab (mobile background) + dead socket, then return
        await go_hidden(bp)
        await kill_realtime(bp)
        await ap.evaluate(
            """async () => { await window.MarkiAPI.addItem({group_id: colState.group.id,
                title: 'WhileBackgrounded', date: '2026-09-01', time: '12:00'}); }"""
        )
        await bp.wait_for_timeout(2500)
        await go_visible(bp)
        ok = await converges(bp, """() => (colState.items || []).some(i => i.title === 'WhileBackgrounded')""")
        record("FAILURE recovers after background -> focus (no F5)", ok)

        # 3. reconnect: re-subscribing must reconcile what was missed
        await kill_realtime(bp)
        await ap.evaluate(
            """async () => { await window.MarkiAPI.addItem({group_id: colState.group.id,
                title: 'MissedDuringOutage', date: '2026-09-02', time: '13:00'}); }"""
        )
        await bp.wait_for_timeout(1500)
        await bp.evaluate("(id) => openGroup(id, false)", gid)   # re-open == reconnect path
        ok = await converges(bp, """() => (colState.items || []).some(i => i.title === 'MissedDuringOutage')""")
        record("FAILURE reconnect/re-open reconciles missed events (no F5)", ok)

        # 4. duplicate delivery: fire the same reconcile many times over
        dup = await bp.evaluate(
            """async () => {
                await Promise.all([
                    reconcileTrip('dup1'), reconcileTrip('dup2'), reconcileTrip('dup3'),
                    reconcileTrip('dup4'), reconcileTrip('dup5')
                ]);
                await new Promise(r => setTimeout(r, 1200));
                const s = await window.MarkiAPI.getItems(colState.group.id);
                const titles = (colState.items || []).map(i => i.title);
                const ids = (colState.items || []).map(i => i.id);
                return {
                    state: titles.length,
                    server: (s.data || []).length,
                    uniqueIds: new Set(ids).size,
                    dom: document.querySelectorAll('#groupItineraryList article.item').length,
                    expectedDom: (colState.items || []).filter(i => i.date === colState.activeDate).length,
                };
            }"""
        )
        record("IDEMPOTENT 5 concurrent reconciles -> state equals server",
               dup["state"] == dup["server"], dup)
        record("IDEMPOTENT no duplicate rows by primary key",
               dup["uniqueIds"] == dup["state"], dup)
        record("IDEMPOTENT DOM matches the active day exactly",
               dup["dom"] == dup["expectedDom"], dup)

        # 5. simultaneous edits from both devices
        await asyncio.gather(
            ap.evaluate("""async () => { await window.MarkiAPI.addItem({group_id: colState.group.id,
                title: 'SimulPhone', date: '2026-09-01', time: '14:00'}); }"""),
            bp.evaluate("""async () => { await window.MarkiAPI.addItem({group_id: colState.group.id,
                title: 'SimulDesktop', date: '2026-09-01', time: '15:00'}); }"""),
        )
        ok_a = await converges(ap, """() => (colState.items || []).some(i => i.title === 'SimulDesktop')""")
        ok_b = await converges(bp, """() => (colState.items || []).some(i => i.title === 'SimulPhone')""")
        record("FAILURE simultaneous edits converge on both devices", ok_a and ok_b,
               f"A_sees_B={ok_a} B_sees_A={ok_b}")

        final = await bp.evaluate(
            """async () => {
                const s = await window.MarkiAPI.getItems(colState.group.id);
                const ids = (colState.items || []).map(i => i.id);
                return { state: ids.length, unique: new Set(ids).size, server: (s.data || []).length };
            }"""
        )
        record("FINAL state equals server with no duplicates",
               final["state"] == final["server"] and final["unique"] == final["state"], final)

        # 6. member join must reach both sides live
        inv = await ap.evaluate(
            """async () => {
                const r = await window.MarkiAPI.createInvitation(colState.group.id);
                const d = Array.isArray(r.data) ? r.data[0] : r.data;
                return (d && d.token) || d;
            }"""
        )
        gctx = await browser.new_context()
        gp2 = await gctx.new_page()
        await gp2.goto(f"{BASE}/trip-planner.html?gt={inv}", wait_until="networkidle")
        await gp2.wait_for_timeout(2000)
        await gp2.evaluate("() => { const b = document.getElementById('guestJoinBtn'); if (b) b.click(); }")
        await gp2.wait_for_timeout(1000)
        await gp2.fill("#guestNameInput", "Juna")
        await gp2.click("#guestNameSubmit")

        ok_a = await converges(ap, """() => (colState.members || []).some(m => m.display_name === 'Juna')""")
        ok_b = await converges(bp, """() => (colState.members || []).some(m => m.display_name === 'Juna')""")
        record("MULTI-DEVICE guest join -> both devices (no F5)", ok_a and ok_b,
               f"A={ok_a} B={ok_b}")

        # 7. guest side must reconcile with its own socket dead
        await kill_realtime(gp2)
        await ap.evaluate(
            """async () => { await window.MarkiAPI.addItem({group_id: colState.group.id,
                title: 'GuestOfflineCatchup', date: '2026-09-01', time: '16:00'}); }"""
        )
        ok = await converges(gp2, """() => Array.from(
            document.querySelectorAll('#guestItineraryList .item-title'))
            .some(t => t.textContent.trim() === 'GuestOfflineCatchup')""")
        record("FAILURE guest converges with NO realtime (no F5)", ok)

        record("no uncaught JavaScript errors", not js_errors, js_errors[:3])

        for ctx in (actx, bctx, gctx):
            await ctx.close()
        await browser.close()

    summary_and_exit()


def summary_and_exit():
    print("\n" + "=" * 64)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"P0.5 TRIP SYNC RELIABILITY: {passed}/{len(results)} PASS")
    print("=" * 64)
    for n, ok, d in results:
        if not ok:
            print(f"  FAILED: {n} | {d}")
    sys.exit(0 if passed == len(results) else 1)


asyncio.run(main())
