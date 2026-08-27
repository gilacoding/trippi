"""SW audit: does a tab that is already open ever pick up a new deploy?

The registration is a bare navigator.serviceWorker.register() with no update
detection, so this measures what actually happens to a LONG-LIVED tab when the
server ships new HTML/JS — the remaining candidate for "sometimes I still need F5".
"""
import asyncio, os, json, pathlib, shutil, time
from playwright.async_api import async_playwright

BASE = os.environ.get("TRIPPI_BASE_URL", "http://localhost:8080")
ROOT = pathlib.Path("D:/HERMES WORKS/TRIPPi/TRIPPY/trippi-deploy")
MARKER = ROOT / "sw_probe_marker.js"


async def main():
    # A tiny same-origin asset we can change between loads, standing in for a deploy.
    MARKER.write_text("window.__SW_PROBE_BUILD='BUILD_ONE';\n", encoding="utf-8")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context()
        page = await ctx.new_page()

        await page.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await page.wait_for_timeout(2500)

        state = await page.evaluate("""async () => {
            const reg = await navigator.serviceWorker.getRegistration();
            return {
                registered: !!reg,
                scope: reg ? reg.scope : null,
                hasController: !!navigator.serviceWorker.controller,
                active: reg && reg.active ? reg.active.state : null,
                waiting: reg && reg.waiting ? reg.waiting.state : null,
            };
        }""")
        print("after first load:", json.dumps(state))

        caches = await page.evaluate("""async () => {
            const keys = await caches.keys();
            const out = {};
            for (const k of keys) {
                const c = await caches.open(k);
                out[k] = (await c.keys()).map(r => new URL(r.url).pathname);
            }
            return out;
        }""")
        print("\ncache contents:", json.dumps(caches, indent=1))

        # Load the marker so it lands in cache under the current strategy.
        await page.evaluate("""async () => {
            const r = await fetch('./sw_probe_marker.js', {cache: 'no-store'});
            window.__firstMarker = await r.text();
        }""")
        first = await page.evaluate("() => window.__firstMarker")
        print("\nmarker v1 fetched:", first.strip())

        # ---- simulate a deploy while the tab stays open ----
        MARKER.write_text("window.__SW_PROBE_BUILD='BUILD_TWO';\n", encoding="utf-8")
        await page.wait_for_timeout(1000)

        # First read after the deploy may still be the cached copy (that is what
        # stale-while-revalidate is for), but the background refresh must land, so a
        # SECOND read has to be current — without any reload.
        second = await page.evaluate("""async () => {
            const r = await fetch('./sw_probe_marker.js');
            return await r.text();
        }""")
        await page.wait_for_timeout(1500)
        third = await page.evaluate("""async () => {
            const r = await fetch('./sw_probe_marker.js');
            return await r.text();
        }""")
        print("marker read #1 after deploy:", second.strip())
        print("marker read #2 after deploy:", third.strip())
        converged = "BUILD_TWO" in third
        print("  -> open tab converges to the new build WITHOUT reload:", converged)

        # Does the app ever ASK for an update?
        checks = await page.evaluate("""async () => {
            const reg = await navigator.serviceWorker.getRegistration();
            let waitingBefore = reg && reg.waiting ? reg.waiting.state : null;
            await reg.update();                 // what the app never does
            await new Promise(r => setTimeout(r, 1500));
            return {
                waitingBefore: waitingBefore,
                waitingAfterManualUpdate: reg.waiting ? reg.waiting.state : null,
                installing: reg.installing ? reg.installing.state : null,
            };
        }""")
        print("\nmanual reg.update() result:", json.dumps(checks))

        # Is there any updatefound / controllerchange listener in the page?
        listeners = await page.evaluate("""() => {
            const src = Array.from(document.querySelectorAll('script'))
                .map(s => s.textContent || '').join('\\n');
            return {
                has_updatefound: /updatefound/.test(src),
                has_controllerchange: /controllerchange/.test(src),
                has_reg_update: /registration\\.update\\(|reg\\.update\\(/.test(src),
                has_skipwaiting_msg: /skipWaiting|SKIP_WAITING/.test(src),
            };
        }""")
        print("update-handling code present in page:", json.dumps(listeners))

        await ctx.close()
        await browser.close()

    MARKER.unlink(missing_ok=True)

asyncio.run(main())
