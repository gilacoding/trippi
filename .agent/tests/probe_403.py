"""Capture the exact request that returns 403 during anonymous guest join."""
import asyncio, os, json
from playwright.async_api import async_playwright

BASE = os.environ.get("TRIPPI_BASE_URL", "http://localhost:8080")
OWNER_EMAIL = os.environ["TRIPPI_TEST_OWNER_EMAIL"]
OWNER_PASS = os.environ["TRIPPI_TEST_OWNER_PASS"]


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # --- owner creates an invitation ---
        octx = await browser.new_context()
        op = await octx.new_page()
        await op.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await op.wait_for_timeout(700)
        await op.evaluate("() => document.querySelector('#newTripBtn').click()")
        await op.wait_for_timeout(500)
        await op.locator("#authModal").first.wait_for(state="visible", timeout=15000)
        if "Daftar" in (await op.locator("#authTitle").text_content()):
            await op.locator("#authToggle").click(); await op.wait_for_timeout(200)
        await op.fill("#authEmail", OWNER_EMAIL)
        await op.fill("#authPassword", OWNER_PASS)
        await op.locator("#authSubmit").click()
        await op.wait_for_timeout(3500)

        inv = await op.evaluate("""async () => {
            const gs = await window.TrippiAPI.listMyGroups();
            const g = (gs.data || [])[0];
            if (!g) return { err: 'no group' };
            const r = await window.TrippiAPI.createInvitation
                ? await window.TrippiAPI.createInvitation(g.id)
                : { error: 'no createInvitation' };
            return { group: g.id, data: r.data, error: r.error ? String(r.error.message || r.error) : null };
        }""")
        print("invitation:", json.dumps(inv)[:300])

        token = None
        d = inv.get("data")
        if isinstance(d, list) and d:
            d = d[0]
        if isinstance(d, dict):
            token = d.get("token") or d.get("invitation_token")
        elif isinstance(d, str):
            token = d
        if not token:
            print("Could not obtain invitation token; aborting.")
            await browser.close(); return

        # --- guest opens link and joins, recording every network failure ---
        gctx = await browser.new_context()
        gp = await gctx.new_page()

        failures = []

        async def on_response(resp):
            if resp.status >= 400:
                body = ""
                try:
                    body = (await resp.text())[:300]
                except Exception:
                    pass
                failures.append({"status": resp.status, "url": resp.url, "body": body})

        gp.on("response", lambda r: asyncio.create_task(on_response(r)))

        await gp.goto(f"{BASE}/trip-planner.html?gt={token}", wait_until="networkidle")
        await gp.wait_for_timeout(2000)
        # reveal the name form first
        await gp.evaluate("() => { const b=document.getElementById('guestJoinBtn'); if(b) b.click(); }")
        await gp.wait_for_timeout(1200)
        await gp.fill("#guestNameInput", "ProbeGuest")
        await gp.click("#guestNameSubmit")
        await gp.wait_for_timeout(6000)

        print("\n=== HTTP >=400 DURING GUEST JOIN ===")
        for f in failures:
            print(f"{f['status']}  {f['url']}")
            if f["body"]:
                print(f"       body: {f['body']}")

        state = await gp.evaluate("""() => ({
            joined: !!(document.getElementById('guestJoinedView') &&
                       getComputedStyle(document.getElementById('guestJoinedView')).display !== 'none'),
            preview: !!(document.getElementById('guestPreview') &&
                        getComputedStyle(document.getElementById('guestPreview')).display !== 'none'),
        })""")
        print("\nfinal view state:", state)

        await browser.close()

asyncio.run(main())
