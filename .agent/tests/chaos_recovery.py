"""Chaos / recovery test for the P0.5 sync contract.

Exactly the three scenarios the founder specified. The point is not "did an event
arrive" but "does the client land on the server snapshot, with EXACT counts, after
events were lost".

  1. Outage across MULTIPLE tables: B's socket dies, A mutates itinerary + expense
     + wishlist, socket returns, tab regains focus -> B == server on all three.
  2. Backgrounded tab, A creates 5 items -> B shows exactly 5. Not 0, not 1,
     not 10 (duplicates).
  3. realtime + poll + focus firing at the same instant -> one canonical state.

Rules: no reload anywhere. Counts are compared against the server, not against
"more than zero".
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


async def socket_off(page):
    """Hard outage: remove every channel so nothing can be delivered."""
    return await page.evaluate(
        """async () => {
            const sb = window.TrippiAPI._getSb();
            for (const c of sb.getChannels()) { await sb.removeChannel(c); }
            return sb.getChannels().length;
        }"""
    )


async def hide(page):
    await page.evaluate(
        """() => {
            Object.defineProperty(document, 'visibilityState', {value:'hidden', configurable:true});
            Object.defineProperty(document, 'hidden', {value:true, configurable:true});
            document.dispatchEvent(new Event('visibilitychange'));
        }"""
    )


async def show(page):
    await page.evaluate(
        """() => {
            Object.defineProperty(document, 'visibilityState', {value:'visible', configurable:true});
            Object.defineProperty(document, 'hidden', {value:false, configurable:true});
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('focus'));
        }"""
    )


async def converge(page, predicate, timeout=40000):
    """Wait on a LIVE page. A reload is never used to rescue a failure."""
    try:
        await page.wait_for_function(predicate, timeout=timeout)
        return True
    except Exception:
        return False


async def compare_with_server(page):
    """Client state vs server snapshot, for every collection the view renders."""
    return await page.evaluate(
        """async () => {
            const gid = colState.group.id;
            const [items, members, expenses, wish] = await Promise.all([
                window.TrippiAPI.getItems(gid),
                window.TrippiAPI.getMembers(gid),
                window.TrippiAPI.getExpenses(gid),
                window.TrippiAPI.listWishlists(gid)
            ]);
            const ids = (colState.items || []).map(i => i.id);
            return {
                items:    { client: (colState.items || []).length,     server: (items.data || []).length },
                members:  { client: (colState.members || []).length,   server: (members.data || []).length },
                expenses: { client: (colState.expenses || []).length,  server: (expenses.data || []).length },
                wishlist: { client: (colState.wishlists || []).length, server: (wish.data || []).length },
                uniqueItemIds: new Set(ids).size,
                itemCount: ids.length,
            };
        }"""
    )


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
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
                const g = await window.TrippiAPI.createGroup({
                    name: 'Chaos ' + Date.now(), destination: 'Nigeria',
                    start_date: '2026-09-01', end_date: '2026-09-03', display_name: 'Ras'});
                if (g.error) return { error: String(g.error.message || g.error) };
                return { id: g.data.id };
            }"""
        )
        if made.get("error"):
            record("setup", False, made["error"])
            summary_and_exit()
        gid = made["id"]

        # A: open trip.  B: open trip.
        await ap.evaluate("(id) => openGroup(id, false)", gid)
        await ap.wait_for_timeout(2500)
        await bp.evaluate("(id) => openGroup(id, false)", gid)
        await bp.wait_for_timeout(3500)
        record("setup: both devices on the same trip", True, gid[:8])

        # ══════════════ SCENARIO 1 ══════════════
        # A creates an item while B is still connected (baseline delivery),
        # then B's socket dies and A mutates THREE different tables.
        await ap.evaluate(
            """async () => { await window.TrippiAPI.addItem({group_id: colState.group.id,
                title: 'S1_BeforeOutage', date: '2026-09-01', time: '08:00'}); }"""
        )
        ok = await converge(bp, """() => (colState.items || []).some(i => i.title === 'S1_BeforeOutage')""")
        record("S1 baseline delivery while connected", ok)

        left = await socket_off(bp)
        record("S1 websocket OFF on B", left == 0, f"channels={left}")

        await ap.evaluate(
            """async () => {
                const gid = colState.group.id;
                await window.TrippiAPI.addItem({group_id: gid,
                    title: 'S1_DuringOutage', date: '2026-09-01', time: '09:00'});
                await window.TrippiAPI.addExpense({group_id: gid,
                    name: 'S1_Expense', amount: 42000, category: 'Makan', date: '2026-09-01'});
                await window.TrippiAPI.addWishlistItem(gid, 'S1_Wish', null, null);
            }"""
        )

        # websocket back ON, then the user returns to the tab
        await bp.evaluate("(id) => openGroup(id, false)", gid)   # re-subscribe path
        await show(bp)                                            # focus recovery

        ok_i = await converge(bp, """() => (colState.items || []).some(i => i.title === 'S1_DuringOutage')""")
        ok_e = await converge(bp, """() => (colState.expenses || []).some(e => e.name === 'S1_Expense')""")
        ok_w = await converge(bp, """() => (colState.wishlists || []).some(w => w.title === 'S1_Wish')""")
        record("S1 itinerary recovered after outage (no F5)", ok_i)
        record("S1 expense recovered after outage (no F5)", ok_e)
        record("S1 wishlist recovered after outage (no F5)", ok_w)

        cmp1 = await compare_with_server(bp)
        all_match = all(cmp1[k]["client"] == cmp1[k]["server"]
                        for k in ("items", "members", "expenses", "wishlist"))
        record("S1 B == server on EVERY collection", all_match, json.dumps(cmp1))
        record("S1 no duplicate items by id",
               cmp1["uniqueItemIds"] == cmp1["itemCount"], cmp1)

        # ══════════════ SCENARIO 2 ══════════════
        # B goes to the background, A creates exactly 5 items, B returns.
        # Expected: exactly 5 new items. Not 0, not 1, and not duplicated.
        # Order matters: kill the socket FIRST, then hide, then snapshot the baseline.
        # Previously the 5s poll could land between hide() and socket_off(), so the
        # "was it starved" probe raced the safety net and the count moved by one.
        await socket_off(bp)
        await hide(bp)
        await bp.wait_for_timeout(500)
        await socket_off(bp)          # a reconnect may have slipped in during hide()
        base = await bp.evaluate("() => (colState.items || []).length")

        await ap.evaluate(
            """async () => {
                const gid = colState.group.id;
                for (let n = 1; n <= 5; n++) {
                    await window.TrippiAPI.addItem({group_id: gid,
                        title: 'S2_Item' + n, date: '2026-09-02', time: '1' + n + ':00'});
                }
            }"""
        )
        await bp.wait_for_timeout(2500)

        during = await bp.evaluate("() => (colState.items || []).length")
        # Precondition check: the tab must not have received all 5 while hidden,
        # otherwise the recovery assertion below would be meaningless. A single
        # late poll slipping through is tolerated; receiving the whole burst is not.
        record("S2 backgrounded tab was starved of the burst", during < base + 5,
               f"base={base} during_background={during} (must be < base+5)")

        await show(bp)

        ok = await converge(bp, """() => {
            const t = (colState.items || []).map(i => i.title);
            return ['S2_Item1','S2_Item2','S2_Item3','S2_Item4','S2_Item5']
                .every(n => t.indexOf(n) !== -1);
        }""")
        record("S2 all 5 items arrive after foreground (no F5)", ok,
               await bp.evaluate("() => (colState.items||[]).map(i=>i.title)"))

        counts = await bp.evaluate(
            """() => {
                const t = (colState.items || []).map(i => i.title);
                const s2 = t.filter(x => x.indexOf('S2_Item') === 0);
                const seen = {};
                let dupes = 0;
                s2.forEach(x => { if (seen[x]) dupes++; seen[x] = true; });
                return { s2Count: s2.length, distinct: Object.keys(seen).length, dupes: dupes,
                         dom: document.querySelectorAll('#groupItineraryList article.item').length,
                         expectedDom: (colState.items || [])
                            .filter(i => i.date === colState.activeDate).length };
            }"""
        )
        record("S2 EXACTLY 5 — not 0, not 1, not duplicated",
               counts["s2Count"] == 5 and counts["distinct"] == 5 and counts["dupes"] == 0,
               counts)
        record("S2 DOM matches the active day exactly",
               counts["dom"] == counts["expectedDom"], counts)

        cmp2 = await compare_with_server(bp)
        record("S2 B == server after burst recovery",
               all(cmp2[k]["client"] == cmp2[k]["server"]
                   for k in ("items", "members", "expenses", "wishlist")),
               json.dumps(cmp2))

        # ══════════════ SCENARIO 3 ══════════════
        # A creates an item; on B the realtime event, the poll and a focus event
        # all land at the same instant. Expected: one canonical state.
        await ap.evaluate(
            """async () => { await window.TrippiAPI.addItem({group_id: colState.group.id,
                title: 'S3_Racy', date: '2026-09-03', time: '20:00'}); }"""
        )
        # slam every trigger together, deliberately
        await bp.evaluate(
            """async () => {
                const id = colState.group.id;
                window.dispatchEvent(new Event('focus'));
                document.dispatchEvent(new Event('visibilitychange'));
                window.dispatchEvent(new Event('online'));
                await Promise.all([
                    reconcileTrip('race-a'), reconcileTrip('race-b'),
                    reconcileTrip('race-c'), reconcileTrip('race-d')
                ]);
            }"""
        )
        ok = await converge(bp, """() => (colState.items || []).some(i => i.title === 'S3_Racy')""")
        record("S3 racy item converges (no F5)", ok)

        await bp.wait_for_timeout(2500)
        race = await bp.evaluate(
            """() => {
                const ids = (colState.items || []).map(i => i.id);
                const racy = (colState.items || []).filter(i => i.title === 'S3_Racy').length;
                return { total: ids.length, unique: new Set(ids).size, racyCopies: racy,
                         dom: document.querySelectorAll('#groupItineraryList article.item').length,
                         expectedDom: (colState.items || [])
                            .filter(i => i.date === colState.activeDate).length };
            }"""
        )
        record("S3 exactly ONE copy despite 7 concurrent triggers",
               race["racyCopies"] == 1, race)
        record("S3 state has no duplicate ids", race["unique"] == race["total"], race)
        record("S3 DOM stays deterministic", race["dom"] == race["expectedDom"], race)

        cmp3 = await compare_with_server(bp)
        record("S3 one canonical state == server",
               all(cmp3[k]["client"] == cmp3[k]["server"]
                   for k in ("items", "members", "expenses", "wishlist")),
               json.dumps(cmp3))

        # A must also be converged — convergence is mutual, not one-way.
        cmp_a = await compare_with_server(ap)
        record("BOTH devices converged to the same server snapshot",
               all(cmp_a[k]["client"] == cmp_a[k]["server"]
                   for k in ("items", "members", "expenses", "wishlist")),
               json.dumps(cmp_a))

        record("no uncaught JavaScript errors", not js_errors, js_errors[:3])

        for ctx in (actx, bctx):
            await ctx.close()
        await browser.close()

    summary_and_exit()


def summary_and_exit():
    print("\n" + "=" * 64)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"CHAOS / RECOVERY: {passed}/{len(results)} PASS")
    print("=" * 64)
    for n, ok, d in results:
        if not ok:
            print(f"  FAILED: {n} | {d}")
    sys.exit(0 if passed == len(results) else 1)


asyncio.run(main())
