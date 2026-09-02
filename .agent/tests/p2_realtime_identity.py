"""P2 — Realtime, Identity & UI Consolidation acceptance test.

The hard rule from the brief: F5 must NOT be part of any accepted flow. Every
sync assertion here waits on a live page and never reloads.

Covered:
  Realtime  creator->guest and guest->creator propagation without a refresh
  Idempotency  one mutation = one card; repeated events and re-subscribe stay at one
  Identity  display name vs role vs status kept separate, no literal placeholders
  Crew  a single roster on both sides, creator keeps management controls
  Map  valid coordinates produce labelled markers, none invented when absent
"""
import asyncio, os, sys
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
    await page.evaluate("() => document.querySelector('#newTripBtn').click()")
    await page.wait_for_timeout(500)
    await page.locator("#authModal").first.wait_for(state="visible", timeout=15000)
    if "Daftar" in (await page.locator("#authTitle").text_content()):
        await page.locator("#authToggle").click()
        await page.wait_for_timeout(200)
    await page.fill("#authEmail", email)
    await page.fill("#authPassword", pw)
    await page.locator("#authSubmit").click()
    await page.wait_for_timeout(3500)


async def open_tab(page, label):
    await page.evaluate(
        """(label) => document.querySelectorAll('.view-tab')
            .forEach(t => { if (t.textContent.trim() === label) t.click(); })""",
        label,
    )
    await page.wait_for_timeout(2000)


async def wait_for(page, expr, timeout=25000):
    """Poll a JS predicate on a LIVE page — never reloads, so F5 can't mask a failure."""
    try:
        await page.wait_for_function(expr, timeout=timeout)
        return True
    except Exception:
        return False


async def guest_titles(page):
    return await page.evaluate(
        """() => Array.from(document.querySelectorAll('#guestItineraryList .item-title'))
            .map(t => t.textContent.trim())"""
    )


async def crew_rows(page):
    return await page.evaluate(
        """() => Array.from(document.querySelectorAll('#crewStatusList .to-go-item'))
            .map(r => r.innerText.replace(/\\s+/g, ' ').trim())"""
    )


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        octx = await browser.new_context(
            permissions=["geolocation"], geolocation={"latitude": -6.2088, "longitude": 106.8456}
        )
        op = await octx.new_page()
        op.on("pageerror", lambda e: js_errors.append(f"creator: {e}"))
        await op.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await op.wait_for_timeout(700)
        await op.evaluate("() => localStorage.setItem('trippi_display_name', 'Ras')")
        await login(op, OWNER_EMAIL, OWNER_PASS)

        made = await op.evaluate(
            """async () => {
                const g = await window.MarkiAPI.createGroup({
                    name: 'P2 ' + Date.now(), destination: 'Bandung',
                    start_date: '2026-09-01', end_date: '2026-09-03', display_name: 'Ras'});
                if (g.error) return { error: String(g.error.message || g.error) };
                const gid = g.data.id;
                await window.MarkiAPI.addItem({group_id: gid, title: 'Sarapan',
                    date: '2026-09-01', time: '08:00', budget: 50000});
                const inv = await window.MarkiAPI.createInvitation(gid);
                const d = Array.isArray(inv.data) ? inv.data[0] : inv.data;
                return { id: gid, token: (d && d.token) || d };
            }"""
        )
        if made.get("error"):
            record("setup", False, made["error"])
            summary_and_exit()
        gid, token = made["id"], made["token"]
        record("setup: trip + invitation", bool(gid and token))

        await op.evaluate("(id) => openGroup(id, false)", gid)
        await op.wait_for_timeout(2500)

        # guest joins and stays on the page for the whole test — no reloads
        gctx = await browser.new_context(
            permissions=["geolocation"], geolocation={"latitude": -6.2100, "longitude": 106.8300}
        )
        gp = await gctx.new_page()
        gp.on("pageerror", lambda e: js_errors.append(f"guest: {e}"))
        await gp.goto(f"{BASE}/trip-planner.html?gt={token}", wait_until="networkidle")
        await gp.wait_for_timeout(2000)
        await gp.evaluate("() => { const b = document.getElementById('guestJoinBtn'); if (b) b.click(); }")
        await gp.wait_for_timeout(1000)
        await gp.fill("#guestNameInput", "Juna")
        await gp.click("#guestNameSubmit")
        await gp.wait_for_timeout(8000)

        subs = await gp.evaluate(
            "() => window.MarkiAPI._getSb().getChannels().map(c => c.topic)"
        )
        record("guest is actually subscribed to realtime",
               any("guest:" in s for s in subs), subs)

        # ---------- creator -> guest, no F5 ----------
        base_titles = await guest_titles(gp)
        record("guest sees the initial itinerary", "Sarapan" in base_titles, base_titles)

        await op.evaluate(
            """async () => { await window.MarkiAPI.addItem({group_id: colState.group.id,
                title: 'ItemRealtime', date: '2026-09-01', time: '10:00', budget: 1000}); }"""
        )
        ok = await wait_for(gp, """() => Array.from(
            document.querySelectorAll('#guestItineraryList .item-title'))
            .some(t => t.textContent.trim() === 'ItemRealtime')""")
        record("REALTIME creator itinerary -> guest without F5", ok, await guest_titles(gp))

        # one DB row must equal one card
        counts = await gp.evaluate(
            """() => {
                const titles = Array.from(document.querySelectorAll('#guestItineraryList .item-title'))
                    .map(t => t.textContent.trim());
                return { total: titles.length, realtime: titles.filter(t => t === 'ItemRealtime').length };
            }"""
        )
        record("IDEMPOTENT one mutation -> one card", counts["realtime"] == 1, counts)

        # deletion must propagate too
        await op.evaluate(
            """async () => {
                const items = await window.MarkiAPI.getItems(colState.group.id);
                const t = (items.data || []).find(i => i.title === 'ItemRealtime');
                if (t) await window.MarkiAPI.deleteItem(t.id);
            }"""
        )
        ok = await wait_for(gp, """() => !Array.from(
            document.querySelectorAll('#guestItineraryList .item-title'))
            .some(t => t.textContent.trim() === 'ItemRealtime')""")
        record("REALTIME creator deletion -> guest without F5", ok, await guest_titles(gp))

        # ---------- guest -> creator, no F5 ----------
        await gp.evaluate("() => { const p = document.getElementById('guestWishlistPanel'); if (p) p.open = true; }")
        await gp.wait_for_timeout(400)
        await gp.fill("#guestWishlistTitle", "IdeGuest")
        await gp.click("#guestWishlistForm button[type='submit']")
        await gp.wait_for_timeout(3000)

        await open_tab(op, "Wishlist")
        ok = await wait_for(op, """() => {
            const el = document.getElementById('groupWishList');
            return !!el && el.innerText.indexOf('IdeGuest') !== -1;
        }""")
        record("REALTIME guest wishlist -> creator without F5", ok,
               await op.evaluate("() => (document.getElementById('groupWishList')||{}).innerText || ''"))

        # creator converts it; the guest must see the new agenda item live
        await op.evaluate(
            """async () => {
                const r = await window.MarkiAPI.listWishlists(colState.group.id);
                const t = (r.data || []).find(w => w.title === 'IdeGuest' && w.status === 'suggested');
                if (t) await window.MarkiAPI.convertWishlistToItinerary(t.id, '2026-09-02', '11:00');
            }"""
        )
        ok = await wait_for(gp, """() => Array.from(
            document.querySelectorAll('#guestItineraryList .item-title'))
            .some(t => t.textContent.trim() === 'IdeGuest')""")
        record("REALTIME conversion -> guest itinerary without F5", ok, await guest_titles(gp))

        conv_count = await gp.evaluate(
            """() => Array.from(document.querySelectorAll('#guestItineraryList .item-title'))
                .filter(t => t.textContent.trim() === 'IdeGuest').length"""
        )
        record("IDEMPOTENT conversion -> exactly one card", conv_count == 1, f"count={conv_count}")

        # expense propagation
        await op.evaluate(
            """async () => { await window.MarkiAPI.addExpense({group_id: colState.group.id,
                name: 'MakanSiang', amount: 75000, category: 'Makan', date: '2026-09-01'}); }"""
        )
        ok = await wait_for(gp, """() => {
            const el = document.getElementById('guestExpenses');
            return !!el && /catatan pengeluaran/.test(el.innerText);
        }""")
        record("REALTIME creator expense -> guest without F5", ok,
               await gp.evaluate("() => (document.getElementById('guestExpenses')||{}).innerText || ''"))

        # ---------- identity + Crew consolidation ----------
        await open_tab(op, "Journey Mode")
        await op.evaluate("() => { const b = document.getElementById('startJourneyBtn'); if (b) b.click(); }")
        await op.wait_for_timeout(4000)
        await open_tab(op, "Journey Mode")
        await op.evaluate("() => { const b = document.getElementById('shareLocationBtn'); if (b) b.click(); }")
        await op.wait_for_timeout(5000)

        c_rows = await crew_rows(op)
        record("IDENTITY creator shows account name, not 'Creator'",
               any("Ras" in r for r in c_rows) and not any(r.split(" ")[1:2] == ["Creator"] for r in c_rows),
               c_rows)
        record("IDENTITY role and status are separate metadata",
               any("Trip Creator ·" in r for r in c_rows), c_rows)

        single = await op.evaluate(
            """() => ({
                anggotaSection: !!document.querySelector('section.members'),
                legacyList: !!document.getElementById('memberList'),
                crewList: !!document.getElementById('crewStatusList'),
                crewCount: document.querySelectorAll('#crewStatusList .to-go-item').length,
            })"""
        )
        record("CREW creator has no second roster",
               not single["anggotaSection"] and not single["legacyList"], single)
        record("CREW is the single roster on the creator side", single["crewList"], single)

        dup_rows = len(c_rows) != len(set(c_rows))
        record("CREW no duplicate rows", not dup_rows, c_rows)

        # ---------- map ----------
        mp = await op.evaluate(
            """() => {
                const map = document.getElementById('crewMap');
                const empty = document.getElementById('crewEmpty');
                return {
                    apiHasCoords: (colState.crewLocations || []).filter(
                        m => typeof m.latitude === 'number').length,
                    mapVisible: !!map && getComputedStyle(map).display !== 'none',
                    pins: document.querySelectorAll('#crewMap .crew-pin').length,
                    labels: Array.from(document.querySelectorAll('#crewMap .crew-pin b'))
                        .map(b => b.textContent.trim()),
                    emptyShown: !!empty && getComputedStyle(empty).display !== 'none',
                };
            }"""
        )
        record("MAP coordinates produce a visible marker",
               mp["apiHasCoords"] == 0 or (mp["mapVisible"] and mp["pins"] > 0), mp)
        record("MAP marker carries the canonical name",
               mp["apiHasCoords"] == 0 or any("Ras" in l for l in mp["labels"]), mp["labels"])
        record("MAP no invented marker without coordinates",
               mp["pins"] <= mp["apiHasCoords"], mp)

        # ---------- re-subscribe must not duplicate ----------
        before = await gp.evaluate(
            """() => ({
                itin: document.querySelectorAll('#guestItineraryList article.item').length,
                wish: document.querySelectorAll('#guestWishList .to-go-item').length,
            })"""
        )
        await gp.evaluate("async () => { await initGuestRealtime(); await initGuestRealtime(); }")
        await gp.wait_for_timeout(4000)
        after = await gp.evaluate(
            """() => ({
                itin: document.querySelectorAll('#guestItineraryList article.item').length,
                wish: document.querySelectorAll('#guestWishList .to-go-item').length,
                channels: window.MarkiAPI._getSb().getChannels()
                    .filter(c => c.topic.indexOf('guest:') !== -1).length,
            })"""
        )
        record("IDEMPOTENT re-subscribe keeps item counts",
               before["itin"] == after["itin"] and before["wish"] == after["wish"],
               f"{before} -> {after}")
        record("IDEMPOTENT re-subscribe leaves ONE guest channel",
               after["channels"] <= 1, f"channels={after['channels']}")

        # ---------- guest leaving updates the creator's Crew live ----------
        await gp.evaluate("() => { window.confirm = () => true; }")
        await gp.evaluate("() => { const b = document.getElementById('guestLeaveBtn'); if (b) b.click(); }")
        ok = await wait_for(op, """() => !Array.from(
            document.querySelectorAll('#crewStatusList .to-go-item'))
            .some(r => r.innerText.indexOf('Juna') !== -1)""", timeout=30000)
        record("REALTIME guest leaving -> creator Crew without F5", ok, await crew_rows(op))

        await op.evaluate("() => { const b = document.getElementById('endJourneyBtn'); if (b) b.click(); }")
        await op.wait_for_timeout(2500)

        record("no uncaught JavaScript errors", not js_errors, js_errors[:3])

        for ctx in (octx, gctx):
            await ctx.close()
        await browser.close()

    summary_and_exit()


def summary_and_exit():
    print("\n" + "=" * 62)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"P2 REALTIME/IDENTITY/UI: {passed}/{len(results)} PASS")
    print("=" * 62)
    for n, ok, d in results:
        if not ok:
            print(f"  FAILED: {n} | {d}")
    sys.exit(0 if passed == len(results) else 1)


asyncio.run(main())
