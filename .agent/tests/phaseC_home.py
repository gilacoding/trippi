"""Fase C home check — To Go List must be gone from home, no JS errors."""
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("TRIPPI_BASE_URL", "http://localhost:8080")
EMAIL = os.environ["TRIPPI_TEST_OWNER_EMAIL"]
PASS = os.environ["TRIPPI_TEST_OWNER_PASS"]

results = []
def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(detail)) if detail else ""))

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context()
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        await page.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await page.wait_for_timeout(1200)

        home = await page.evaluate("""() => ({
            toGoSection: !!document.querySelector('section.to-go'),
            toGoList: !!document.getElementById('toGoList'),
            toGoForm: !!document.getElementById('toGoForm'),
            headingToGo: Array.from(document.querySelectorAll('#homeView h2')).some(h => h.textContent.trim() === 'To Go List'),
            upcoming: !!document.getElementById('upcomingTrips'),
        })""")
        record("home: To Go section removed", not home["toGoSection"], home["toGoSection"])
        record("home: toGoList element gone", not home["toGoList"], home["toGoList"])
        record("home: toGoForm element gone", not home["toGoForm"], home["toGoForm"])
        record("home: no 'To Go List' heading", not home["headingToGo"], home["headingToGo"])
        record("home: upcoming trips intact", home["upcoming"], home["upcoming"])

        # login then render home again (renderToGo runs inside renderHome)
        await page.evaluate("() => document.querySelector('#newTripBtn').click()")
        await page.wait_for_timeout(500)
        await page.locator("#authModal").first.wait_for(state="visible", timeout=15000)
        if "Daftar" in (await page.locator("#authTitle").text_content()):
            await page.locator("#authToggle").click(); await page.wait_for_timeout(200)
        await page.fill("#authEmail", EMAIL)
        await page.fill("#authPassword", PASS)
        await page.locator("#authSubmit").click()
        await page.wait_for_timeout(4000)
        await page.evaluate("() => renderHome()")
        await page.wait_for_timeout(800)

        fatal = [e for e in errors if "toGo" in e or "renderToGo" in e or "Cannot read properties of null" in e]
        record("home: renderHome/renderToGo no null errors", not fatal, fatal[:2])

        await ctx.close(); await browser.close()

    print("\n" + "=" * 52)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"FASE C HOME: {passed}/{len(results)} PASS")
    print("=" * 52)
    for n, ok, d in results:
        if not ok:
            print(f"  FAILED: {n} | {d}")
    sys.exit(0 if passed == len(results) else 1)

asyncio.run(main())
