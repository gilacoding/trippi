"""Reproduce the founder's phone -> desktop case with two separate browser contexts,
same account: does the second device hydrate the itinerary on first open?"""
import asyncio, os, json
from playwright.async_api import async_playwright

BASE = os.environ.get("TRIPPI_BASE_URL", "http://localhost:8080")
EMAIL = os.environ["TRIPPI_TEST_OWNER_EMAIL"]
PASS = os.environ["TRIPPI_TEST_OWNER_PASS"]


async def login(page):
    await page.evaluate("() => document.querySelector('#newTripBtn').click()")
    await page.wait_for_timeout(500)
    await page.locator("#authModal").first.wait_for(state="visible", timeout=15000)
    if "Daftar" in (await page.locator("#authTitle").text_content()):
        await page.locator("#authToggle").click(); await page.wait_for_timeout(200)
    await page.fill("#authEmail", EMAIL); await page.fill("#authPassword", PASS)
    await page.locator("#authSubmit").click(); await page.wait_for_timeout(4000)


async def snapshot(page, label):
    s = await page.evaluate("""async () => {
        const gid = colState.group && colState.group.id;
        const server = gid ? await window.TrippiAPI.getItems(gid) : {data: []};
        return {
            groupName: (document.getElementById('groupName') || {}).textContent || '',
            activeDate: colState.activeDate,
            groupDates: colState.group ? [colState.group.start_date, colState.group.end_date] : null,
            stateItems: (colState.items || []).length,
            stateItemDates: (colState.items || []).map(i => i.date),
            serverItems: (server.data || []).length,
            serverItemDates: (server.data || []).map(i => i.date),
            domCards: document.querySelectorAll('#groupItineraryList article.item').length,
            dayTabs: document.querySelectorAll('#groupDayTabs [data-gday]').length,
            emptyText: (document.getElementById('groupItineraryList') || {}).innerText || '',
        };
    }""")
    print(f"\n--- {label} ---")
    print(json.dumps(s, indent=1))
    return s


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # ===== DEVICE A ("phone"): create trip + add itinerary =====
        actx = await browser.new_context(viewport={"width": 390, "height": 844})
        ap = await actx.new_page()
        await ap.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await ap.wait_for_timeout(700)
        await ap.evaluate("() => localStorage.setItem('trippi_display_name', 'Ras')")
        await login(ap)

        made = await ap.evaluate("""async () => {
            const g = await window.TrippiAPI.createGroup({
                name: 'Nigeria ' + Date.now(), destination: 'Nigeria',
                start_date: '2026-08-26', end_date: '2026-08-27', display_name: 'Ras'});
            return { id: g.data.id, name: g.data.name };
        }""")
        gid = made["id"]
        await ap.evaluate("(id) => openGroup(id, false)", gid)
        await ap.wait_for_timeout(3000)
        await ap.evaluate("""async () => {
            await window.TrippiAPI.addItem({group_id: colState.group.id, title: 'hura hura',
                date: '2026-08-26', time: '17:00', budget: 150000});
            await window.TrippiAPI.addItem({group_id: colState.group.id, title: 'kemana aja',
                date: '2026-08-27', time: '08:00', budget: 500000});
        }""")
        await ap.wait_for_timeout(4000)
        await snapshot(ap, "DEVICE A (phone) after adding 2 items")

        # ===== DEVICE B ("desktop"): fresh context, same account, first open =====
        bctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        bp = await bctx.new_page()
        errs = []
        bp.on("pageerror", lambda e: errs.append(str(e)))
        await bp.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await bp.wait_for_timeout(700)
        await login(bp)

        # open the same trip for the very first time on this device
        await bp.evaluate("(id) => openGroup(id, false)", gid)
        await bp.wait_for_timeout(5000)
        s = await snapshot(bp, "DEVICE B (desktop) FIRST OPEN — no F5")
        print("\nDEVICE B js errors:", errs[:3])

        # The creator planner is day-scoped: it renders only colState.activeDate.
        # So the correct check is per-day, plus a walk over every day tab.
        walk = await bp.evaluate("""async () => {
            const out = [];
            const tabs = Array.from(document.querySelectorAll('#groupDayTabs [data-gday]'));
            for (const t of tabs) {
                t.click();
                await new Promise(r => setTimeout(r, 400));
                out.push({
                    day: t.dataset.gday,
                    dom: document.querySelectorAll('#groupItineraryList article.item').length,
                    expected: (colState.items || []).filter(i => i.date === t.dataset.gday).length,
                });
            }
            return out;
        }""")
        print("\nday-by-day on DEVICE B:", json.dumps(walk))
        per_day_ok = all(d["dom"] == d["expected"] for d in walk)
        total_dom = sum(d["dom"] for d in walk)
        hydrated = s["stateItems"] == s["serverItems"] and s["serverItems"] > 0
        print(f"\n>>> hydration(state==server): {hydrated}"
              f" | per-day render correct: {per_day_ok}"
              f" | total rendered across days: {total_dom}/{s['serverItems']}")

        await actx.close(); await bctx.close(); await browser.close()

asyncio.run(main())
