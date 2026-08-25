"""Probe: why is the creator's map empty even though coordinates exist?"""
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
        ctx = await browser.new_context(
            permissions=["geolocation"], geolocation={"latitude": -6.2088, "longitude": 106.8456})
        page = await ctx.new_page()
        await page.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await page.wait_for_timeout(700)
        await page.evaluate("() => localStorage.setItem('trippi_display_name', 'Ras')")
        await login(page, OWNER_EMAIL, OWNER_PASS)

        gid = (await page.evaluate("""async () => {
            const g = await window.TrippiAPI.createGroup({
                name: 'MapUI ' + Date.now(), destination: 'X',
                start_date: '2026-09-01', end_date: '2026-09-02', display_name: 'Ras'});
            return { id: g.data.id };
        }"""))["id"]

        await page.evaluate("(id) => openGroup(id, false)", gid)
        await page.wait_for_timeout(2500)
        await page.evaluate("""() => document.querySelectorAll('.view-tab')
            .forEach(t => { if (t.textContent.trim() === 'Journey Mode') t.click(); })""")
        await page.wait_for_timeout(2000)
        await page.evaluate("() => { const b=document.getElementById('startJourneyBtn'); if(b) b.click(); }")
        await page.wait_for_timeout(4000)
        await page.evaluate("""() => document.querySelectorAll('.view-tab')
            .forEach(t => { if (t.textContent.trim() === 'Journey Mode') t.click(); })""")
        await page.wait_for_timeout(2000)
        await page.evaluate("() => { const b=document.getElementById('shareLocationBtn'); if(b) b.click(); }")
        await page.wait_for_timeout(6000)

        state = await page.evaluate("""async () => {
            const res = await window.TrippiAPI.getCrewLocations();
            const rows = res.data || [];
            const map = document.getElementById('crewMap');
            const empty = document.getElementById('crewEmpty');
            const cont = document.getElementById('crewMapContainer');
            return {
                apiRows: rows.length,
                sample: rows[0] || null,
                latType: rows[0] ? typeof rows[0].latitude : null,
                plottable: rows.filter(m => typeof m.latitude === 'number' && typeof m.longitude === 'number').length,
                stateRows: (colState.crewLocations || []).length,
                containerDisplay: cont ? getComputedStyle(cont).display : null,
                mapDisplay: map ? getComputedStyle(map).display : null,
                mapInlineDisplay: map ? map.style.display : null,
                mapChildren: map ? map.children.length : -1,
                pins: document.querySelectorAll('#crewMap .crew-pin').length,
                emptyShown: empty ? getComputedStyle(empty).display !== 'none' : null,
                emptyText: empty ? empty.textContent.trim() : null,
                crewRows: Array.from(document.querySelectorAll('#crewStatusList .to-go-item'))
                    .map(r => r.innerText.replace(/\\s+/g,' ').trim()),
            };
        }""")
        print(json.dumps(state, indent=1))

        await page.evaluate("async () => { await loadCrewMap(); }")
        await page.wait_for_timeout(2500)
        after = await page.evaluate("""() => ({
            pins: document.querySelectorAll('#crewMap .crew-pin').length,
            mapDisplay: getComputedStyle(document.getElementById('crewMap')).display,
        })""")
        print("\nafter explicit loadCrewMap():", json.dumps(after))

        await page.evaluate("() => { const b=document.getElementById('endJourneyBtn'); if(b) b.click(); }")
        await page.wait_for_timeout(2000)
        await ctx.close(); await browser.close()

asyncio.run(main())
