"""Probe: what does colState.members look like on the guest page at render time?"""
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
                name: 'RoleProbe ' + Date.now(), destination: 'X',
                start_date: '2026-09-01', end_date: '2026-09-02', display_name: 'Ras'});
            return {id: g.data.id};
        }""")
        gid = made["id"]
        inv = await op.evaluate("""async (gid) => {
            const r = await window.TrippiAPI.createInvitation(gid); return r.data;
        }""", gid)
        d = inv[0] if isinstance(inv, list) else inv
        token = d.get("token") if isinstance(d, dict) else d

        gctx = await browser.new_context()
        gp = await gctx.new_page()
        await gp.goto(f"{BASE}/trip-planner.html?gt={token}", wait_until="networkidle")
        await gp.wait_for_timeout(2000)
        await gp.evaluate("() => { const b=document.getElementById('guestJoinBtn'); if(b) b.click(); }")
        await gp.wait_for_timeout(1200)
        await gp.fill("#guestNameInput", "Budi")
        await gp.click("#guestNameSubmit")
        await gp.wait_for_timeout(8000)

        state = await gp.evaluate("""() => ({
            members: colState.members,
            uid: colState.uid,
            nameMap: colState.nameMap,
        })""")
        print("colState.members:", json.dumps(state["members"], indent=1)[:700])
        print("uid:", state["uid"])

        direct = await gp.evaluate("""async () => {
            const r = await window.TrippiAPI.getMembers(colState.group.id);
            return { error: r.error ? String(r.error.message || r.error) : null, data: r.data };
        }""")
        print("\ngetMembers from guest:", json.dumps(direct)[:600])

        await octx.close(); await gctx.close(); await browser.close()

asyncio.run(main())
