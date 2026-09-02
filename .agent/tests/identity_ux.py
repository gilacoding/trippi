"""Identity UX acceptance test.

Proves the user can control their own identity:
  - Profile modal opens with current name
  - Validation rejects placeholders and out-of-length names
  - Save updates profiles.display_name
  - Change propagates to resolveIdentity() everywhere
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


async def login(page):
    # Open auth modal directly (the app shows it on trip creation; for test we open directly)
    await page.evaluate("() => openAuth('login')")
    await page.locator("#authModal").first.wait_for(state="visible", timeout=15000)
    if "Daftar" in (await page.locator("#authTitle").text_content()):
        await page.locator("#authToggle").click()
        await page.wait_for_timeout(200)
    await page.fill("#authEmail", OWNER_EMAIL)
    await page.fill("#authPassword", OWNER_PASS)
    await page.locator("#authSubmit").click()
    await page.wait_for_timeout(4500)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        octx = await browser.new_context()
        op = await octx.new_page()
        op.on("pageerror", lambda e: js_errors.append(str(e)))
        await op.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await op.wait_for_timeout(700)
        await login(op)

        # Profile button visible
        record("UX profile button visible",
               await op.evaluate("() => getComputedStyle(document.getElementById('profileBtn')).display !== 'none'"))

        # Open profile modal
        await op.click("#profileBtn")
        await op.wait_for_timeout(500)
        record("UX profile modal opens",
               await op.evaluate("() => getComputedStyle(document.getElementById('profileModal')).display !== 'none'"))

        # Current name prefilled (wait for async populate)
        try:
            await op.wait_for_function("() => document.getElementById('profileName').value !== ''", timeout=5000)
        except Exception:
            pass
        cur = await op.evaluate("() => document.getElementById('profileName').value")
        record("UX current name prefilled", bool(cur), cur)

        # Email shown readonly
        email = await op.evaluate("() => document.getElementById('profileEmail').value")
        readonly = await op.evaluate("() => document.getElementById('profileEmail').readOnly")
        record("UX email shown readonly", bool(email) and readonly, email)

        # Account type shown
        atype = await op.evaluate("() => document.getElementById('profileAccountType').value")
        record("UX account type shown", bool(atype), atype)

        # Validation: placeholder rejected
        await op.evaluate("() => { document.getElementById('profileName').value='Guest'; }")
        await op.click("#profileSave")
        await op.wait_for_timeout(400)
        err = await op.evaluate("() => document.getElementById('profileError').textContent")
        record("UX placeholder 'Guest' rejected", 'tidak diperbolehkan' in err, err)

        # Validation: too short
        await op.evaluate("() => { document.getElementById('profileName').value='A'; }")
        await op.click("#profileSave")
        await op.wait_for_timeout(400)
        err2 = await op.evaluate("() => document.getElementById('profileError').textContent")
        record("UX too short rejected", 'terlalu minimal' in err2, err2)

        # Validation: too long
        await op.evaluate("() => { document.getElementById('profileName').value='A'.repeat(41); }")
        await op.click("#profileSave")
        await op.wait_for_timeout(400)
        err3 = await op.evaluate("() => document.getElementById('profileError').textContent")
        record("UX too long rejected", 'terlalu panjang' in err3, err3)

        # Valid rename
        await op.evaluate("() => { document.getElementById('profileName').value='Ras Banget'; }")
        await op.click("#profileSave")
        await op.wait_for_timeout(1500)
        note = await op.evaluate("() => document.getElementById('profileNote').textContent")
        record("UX valid rename saved", 'berhasil diperbarui' in note, note)

        # Profile updated in DB
        prof = await op.evaluate("""async () => {
            const r = await window.MarkiAPI.ensureProfile(null);
            return r.data && r.data.display_name;
        }""")
        record("UX profile persisted in DB", prof == "Ras Banget", prof)

        # Resolver returns new name
        ident = await op.evaluate("() => resolveIdentity(colState.uid)")
        record("UX resolver returns new name", ident["name"] == "Ras Banget", ident)

        # colState.name updated
        cname = await op.evaluate("() => colState.name")
        record("UX colState.name updated", cname == "Ras Banget", cname)

        # Close modal
        await op.click("#profileCancel")
        await op.wait_for_timeout(300)
        record("UX profile modal closes",
               await op.evaluate("() => getComputedStyle(document.getElementById('profileModal')).display === 'none'"))

        record("no uncaught JavaScript errors", not js_errors, js_errors[:3])

        await octx.close()
        await browser.close()

    print("\n" + "=" * 62)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"IDENTITY UX: {passed}/{len(results)} PASS")
    print("=" * 62)
    for n, ok, d in results:
        if not ok:
            print(f"  FAILED: {n} | {d}")
    sys.exit(0 if passed == len(results) else 1)


asyncio.run(main())
