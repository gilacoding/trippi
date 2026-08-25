"""Does the client converge WITHOUT F5 when realtime is unavailable?

This is the founder's real question. We simulate the failure modes that realtime
cannot survive, then check whether some other path (poll / focus / reconnect)
still reconciles the client to server state.

No page reload anywhere: F5 is not allowed to be the recovery mechanism.
"""
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


async def titles_all_days(page):
    """Titles across every day tab, so a day-scoped view cannot hide an item."""
    return await page.evaluate("""() => (colState.items || []).map(i => i.title)""")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        actx = await browser.new_context()
        ap = await actx.new_page()
        await ap.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await ap.wait_for_timeout(700)
        await ap.evaluate("() => localStorage.setItem('trippi_display_name', 'Ras')")
        await login(ap)

        gid = (await ap.evaluate("""async () => {
            const g = await window.TrippiAPI.createGroup({
                name: 'Reconcile ' + Date.now(), destination: 'X',
                start_date: '2026-09-01', end_date: '2026-09-02', display_name: 'Ras'});
            return { id: g.data.id };
        }"""))["id"]

        bctx = await browser.new_context()
        bp = await bctx.new_page()
        await bp.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await bp.wait_for_timeout(700)
        await login(bp)
        await bp.evaluate("(id) => openGroup(id, false)", gid)
        await bp.wait_for_timeout(4000)
        await ap.evaluate("(id) => openGroup(id, false)", gid)
        await ap.wait_for_timeout(3000)

        print("baseline B:", await titles_all_days(bp))

        # ---- FAILURE 1: kill B's realtime entirely, then mutate from A ----
        killed = await bp.evaluate("""async () => {
            const sb = window.TrippiAPI._getSb();
            const chans = sb.getChannels();
            for (const c of chans) { await sb.removeChannel(c); }
            return sb.getChannels().length;
        }""")
        print("\nB channels after kill:", killed)

        await ap.evaluate("""async () => {
            await window.TrippiAPI.addItem({group_id: colState.group.id,
                title: 'AddedWhileOffline', date: '2026-09-01', time: '09:00'});
        }""")

        converged = False
        for i in range(8):
            await bp.wait_for_timeout(2000)
            t = await titles_all_days(bp)
            if "AddedWhileOffline" in t:
                converged = True
                print(f"  converged after ~{(i+1)*2}s WITHOUT realtime and WITHOUT F5")
                break
        if not converged:
            print("  NOT converged in 16s:", await titles_all_days(bp))
        print("RESULT realtime-dead recovery:", "PASS" if converged else "FAIL")

        # ---- FAILURE 2: hidden tab, mutate, then return focus ----
        await bp.evaluate("""() => {
            Object.defineProperty(document, 'visibilityState', {value:'hidden', configurable:true});
            Object.defineProperty(document, 'hidden', {value:true, configurable:true});
            document.dispatchEvent(new Event('visibilitychange'));
        }""")
        await bp.evaluate("""async () => {
            const sb = window.TrippiAPI._getSb();
            for (const c of sb.getChannels()) { await sb.removeChannel(c); }
        }""")
        await ap.evaluate("""async () => {
            await window.TrippiAPI.addItem({group_id: colState.group.id,
                title: 'AddedWhileHidden', date: '2026-09-01', time: '10:00'});
        }""")
        await bp.wait_for_timeout(3000)
        await bp.evaluate("""() => {
            Object.defineProperty(document, 'visibilityState', {value:'visible', configurable:true});
            Object.defineProperty(document, 'hidden', {value:false, configurable:true});
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('focus'));
        }""")

        focus_ok = False
        for i in range(6):
            await bp.wait_for_timeout(2000)
            if "AddedWhileHidden" in await titles_all_days(bp):
                focus_ok = True
                print(f"\n  reconciled ~{(i+1)*2}s after regaining focus")
                break
        if not focus_ok:
            print("\n  NOT reconciled after focus:", await titles_all_days(bp))
        print("RESULT focus/visibility recovery:", "PASS" if focus_ok else "FAIL")

        # ---- FAILURE 3: duplicate delivery must stay idempotent ----
        dup = await bp.evaluate("""async () => {
            const before = (colState.items || []).length;
            await loadShared(colState.group.id);
            await loadShared(colState.group.id);
            await loadShared(colState.group.id);
            const server = await window.TrippiAPI.getItems(colState.group.id);
            return { before, after: (colState.items || []).length,
                     server: (server.data || []).length,
                     dom: document.querySelectorAll('#groupItineraryList article.item').length };
        }""")
        print("\nrepeated refetch:", json.dumps(dup))
        print("RESULT idempotent refetch:", "PASS" if dup["after"] == dup["server"] else "FAIL")

        await actx.close(); await bctx.close(); await browser.close()

asyncio.run(main())
