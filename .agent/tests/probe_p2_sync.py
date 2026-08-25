"""Probe: where does the guest duplicate come from, and does anything sync without F5?"""
import asyncio, os, json
from playwright.async_api import async_playwright

BASE = os.environ.get("TRIPPI_BASE_URL", "http://localhost:8080")
OWNER_EMAIL = os.environ["TRIPPI_TEST_OWNER_EMAIL"]
OWNER_PASS = os.environ["TRIPPI_TEST_OWNER_PASS"]


async def login(page, email, pw):
    await page.evaluate("() => document.querySelector('#newTripBtn').click()")
    await page.wait_for_timeout(500)
    await page.locator("#authModal").first.wait_for(state="visible", timeout=15000)
    if "Daftar" in (await page.locator("#authTitle").text_content()):
        await page.locator("#authToggle").click(); await page.wait_for_timeout(200)
    await page.fill("#authEmail", email); await page.fill("#authPassword", pw)
    await page.locator("#authSubmit").click(); await page.wait_for_timeout(3500)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        octx = await browser.new_context()
        op = await octx.new_page()
        await op.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await op.wait_for_timeout(700)
        await op.evaluate("() => localStorage.setItem('trippi_display_name', 'Ras')")
        await login(op, OWNER_EMAIL, OWNER_PASS)

        made = await op.evaluate("""async () => {
            const g = await window.TrippiAPI.createGroup({
                name: 'P2Probe ' + Date.now(), destination: 'X',
                start_date: '2026-09-01', end_date: '2026-09-02', display_name: 'Ras'});
            const gid = g.data.id;
            await window.TrippiAPI.addItem({group_id: gid, title: 'Sarapan',
                date: '2026-09-01', time: '08:00', budget: 50000});
            const inv = await window.TrippiAPI.createInvitation(gid);
            const d = Array.isArray(inv.data) ? inv.data[0] : inv.data;
            return { id: gid, token: (d && d.token) || d };
        }""")
        gid, token = made["id"], made["token"]

        gctx = await browser.new_context()
        gp = await gctx.new_page()
        await gp.goto(f"{BASE}/trip-planner.html?gt={token}", wait_until="networkidle")
        await gp.wait_for_timeout(2000)
        await gp.evaluate("() => { const b=document.getElementById('guestJoinBtn'); if(b) b.click(); }")
        await gp.wait_for_timeout(1000)
        await gp.fill("#guestNameInput", "Juna")
        await gp.click("#guestNameSubmit")
        await gp.wait_for_timeout(8000)

        dup = await gp.evaluate("""async () => {
            const r = await window.TrippiAPI.getGuestTrip(new URLSearchParams(location.search).get('gt'));
            const el = document.getElementById('guestItineraryList');
            return {
                dbItems: (r.data && r.data.items || []).length,
                domCards: el ? el.querySelectorAll('article.item').length : -1,
                titles: el ? Array.from(el.querySelectorAll('.item-title')).map(t => t.textContent.trim()) : [],
                guestChannels: window.TrippiAPI._getSb().getChannels().map(c => c.topic),
            };
        }""")
        print("GUEST after join:", json.dumps(dup, indent=1))

        # does a creator mutation reach the guest WITHOUT F5?
        await op.evaluate("(id) => openGroup(id, false)", gid)
        await op.wait_for_timeout(2500)
        await op.evaluate("""async () => {
            await window.TrippiAPI.addItem({group_id: colState.group.id, title: 'ItemBaru',
                date: '2026-09-01', time: '10:00', budget: 1000});
        }""")
        await gp.wait_for_timeout(9000)

        sync = await gp.evaluate("""() => {
            const el = document.getElementById('guestItineraryList');
            return {
                domCards: el ? el.querySelectorAll('article.item').length : -1,
                titles: el ? Array.from(el.querySelectorAll('.item-title')).map(t => t.textContent.trim()) : [],
            };
        }""")
        print("\nGUEST 9s after creator added 'ItemBaru' (no F5):", json.dumps(sync))

        await gp.reload(wait_until="networkidle")
        await gp.wait_for_timeout(7000)
        after = await gp.evaluate("""() => {
            const el = document.getElementById('guestItineraryList');
            return {
                domCards: el ? el.querySelectorAll('article.item').length : -1,
                titles: el ? Array.from(el.querySelectorAll('.item-title')).map(t => t.textContent.trim()) : [],
            };
        }""")
        print("GUEST after F5:", json.dumps(after))

        await octx.close(); await gctx.close(); await browser.close()

asyncio.run(main())
