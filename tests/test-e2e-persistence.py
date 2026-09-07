"""
E2E Persistence Test (Phase 8)
Verifies the full persistence contract:
LOGIN -> IMPORT -> VERIFY -> NAVIGATE -> REFRESH -> LOGOUT/LOGIN -> VERIFY
"""
import asyncio, json, re, time
from playwright.async_api import async_playwright

URL = 'https://marki.cab/trip-planner.html'
EMAIL = 'e2e-persist-test@marki.cab'
PASSWORD = 'marki123456'

TEST_JSON = {
    "name": "Persistence Test Trip",
    "days": [
        {"day": 1, "items": [{"name": "Day 1 Activity A"}, {"name": "Day 1 Activity B"}]},
        {"day": 2, "items": [{"name": "Day 2 Activity"}]},
        {"day": 3, "items": [{"name": "Day 3 Activity X"}, {"name": "Day 3 Activity Y"}, {"name": "Day 3 Activity Z"}]}
    ]
}


async def click_trip_card(page, trip_id):
    """Click a trip card by its data-open attribute."""
    await page.evaluate(
        '(id) => document.querySelector(`[data-open="${id}"]`).click()',
        trip_id
    )


async def main():
    print("=== E2E PERSISTENCE TEST ===\n")
    passed = 0
    failed = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        console_errors = []
        page.on('console', lambda msg: console_errors.append(f"[{msg.type}] {msg.text}"[:200]) if msg.type == 'error' else None)
        page.on('pageerror', lambda err: console_errors.append(f"[pageerror] {err}"[:200]))

        # ===== STEP 1: LOGIN =====
        print("1. Loading app...")
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(5000)

        email_js = json.dumps(EMAIL)
        pass_js = json.dumps(PASSWORD)
        login_js = "async () => { const email = %s; const password = %s; const r = await window.MarkiAPI.signInWithEmail(email, password); if (r.error) await window.MarkiAPI.signUpWithEmail(email, password); return { ok: true }; }" % (email_js, pass_js)
        result = await page.evaluate(login_js)
        await page.wait_for_timeout(8000)

        logout_visible = await page.is_visible('#logoutBtn')
        if logout_visible:
            print("   OK Logged in")
            passed += 1
        else:
            print("   FAIL Login failed")
            failed += 1
            return 1

        # ===== STEP 2: IMPORT TRIP =====
        print("\n2. Importing trip...")
        await page.click('#importTripBtn')
        await page.wait_for_timeout(800)

        await page.fill('#importTextarea', json.dumps(TEST_JSON))
        await page.wait_for_timeout(500)
        await page.click('#importSubmit')
        await page.wait_for_timeout(5000)

        modal_visible = await page.is_visible('#importModal')
        if not modal_visible:
            print("   OK Import modal closed")
            passed += 1
        else:
            print("   FAIL Import modal still open")
            failed += 1

        # ===== STEP 3: VERIFY TRIP EXISTS =====
        print("\n3. Verifying trip exists...")
        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(3000)

        trip_cards = await page.eval_on_selector_all(
            '[data-open]',
            'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))'
        )

        imported_trip = None
        for card in trip_cards:
            if 'Persistence Test' in card['text']:
                imported_trip = card
                break

        if imported_trip:
            print(f"   OK Trip found")
            passed += 1
        else:
            print("   FAIL Trip not found!")
            failed += 1

        # ===== STEP 4: VERIFY DAYS AND AGENDA =====
        print("\n4. Verifying days and agenda...")
        await click_trip_card(page, imported_trip['id'])
        await page.wait_for_timeout(3000)

        day_tabs = await page.eval_on_selector_all(
            '.day-tab',
            'els => els.map(e => e.textContent.trim())'
        )
        print(f"   Day tabs: {day_tabs}")
        if len(day_tabs) >= 3:
            print(f"   OK Found {len(day_tabs)} day tabs")
            passed += 1
        else:
            print(f"   FAIL Expected 3+ day tabs, got {len(day_tabs)}")
            failed += 1

        agenda_items = await page.eval_on_selector_all(
            '.item-title',
            'els => els.map(e => e.textContent.trim())'
        )
        print(f"   Agenda items visible: {agenda_items}")
        if len(agenda_items) >= 2:
            print(f"   OK Found {len(agenda_items)} agenda items on day 1")
            passed += 1
        else:
            print(f"   FAIL Expected 2+ agenda items, got {len(agenda_items)}")
            failed += 1

        # ===== STEP 5: NAVIGATE AWAY AND RETURN =====
        print("\n5. Navigating away...")
        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(2000)

        plan_tab = await page.query_selector('[data-nav="plan"]')
        if plan_tab:
            await plan_tab.click()
            await page.wait_for_timeout(2000)

        trip_tab = await page.query_selector('[data-nav="trip"]')
        if trip_tab:
            await trip_tab.click()
            await page.wait_for_timeout(3000)

        trip_cards2 = await page.eval_on_selector_all(
            '[data-open]',
            'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))'
        )

        imported_trip2 = None
        for card in trip_cards2:
            if 'Persistence Test' in card['text']:
                imported_trip2 = card
                break

        if imported_trip2:
            print("   OK Trip persists after navigation")
            passed += 1
        else:
            print("   FAIL Trip lost after navigation!")
            failed += 1

        # ===== STEP 6: REFRESH PAGE =====
        print("\n6. Refreshing page...")
        await page.reload(wait_until='networkidle')
        await page.wait_for_timeout(8000)

        trip_cards3 = await page.eval_on_selector_all(
            '[data-open]',
            'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))'
        )

        imported_trip3 = None
        for card in trip_cards3:
            if 'Persistence Test' in card['text']:
                imported_trip3 = card
                break

        if imported_trip3:
            print("   OK Trip persists after page refresh")
            passed += 1
        else:
            print("   FAIL Trip lost after page refresh!")
            failed += 1

        # ===== STEP 7: LOGOUT AND LOGIN =====
        print("\n7. Logging out...")
        await page.click('#logoutBtn')
        await page.wait_for_timeout(5000)

        logout_visible2 = await page.is_visible('#logoutBtn')
        if not logout_visible2:
            print("   OK Logged out")
            passed += 1
        else:
            print("   FAIL Still showing logout button")
            failed += 1

        print("\n8. Logging in again...")
        result2 = await page.evaluate(login_js)
        await page.wait_for_timeout(8000)

        logout_visible3 = await page.is_visible('#logoutBtn')
        if logout_visible3:
            print("   OK Logged back in")
            passed += 1
        else:
            print("   Login may have failed")

        # ===== STEP 9: VERIFY SAME TRIP AFTER RE-LOGIN =====
        print("\n9. Verifying trip persists after logout/login...")
        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(5000)

        trip_cards4 = await page.eval_on_selector_all(
            '[data-open]',
            'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))'
        )

        imported_trip4 = None
        for card in trip_cards4:
            if 'Persistence Test' in card['text']:
                imported_trip4 = card
                break

        if imported_trip4:
            print("   OK Trip persists after logout/login cycle")
            passed += 1
        else:
            print("   FAIL Trip lost after logout/login!")
            failed += 1

        # ===== STEP 10: VERIFY SAME DAYS AND AGENDA AFTER RE-LOGIN =====
        if imported_trip4:
            print("\n10. Verifying days and agenda after re-login...")
            await click_trip_card(page, imported_trip4['id'])
            await page.wait_for_timeout(3000)

            day_tabs2 = await page.eval_on_selector_all(
                '.day-tab',
                'els => els.map(e => e.textContent.trim())'
            )
            print(f"    Day tabs: {day_tabs2}")
            if len(day_tabs2) >= 3:
                print(f"    OK Found {len(day_tabs2)} day tabs after re-login")
                passed += 1
            else:
                print(f"    FAIL Expected 3+ day tabs, got {len(day_tabs2)}")
                failed += 1

            agenda_items2 = await page.eval_on_selector_all(
                '.item-title',
                'els => els.map(e => e.textContent.trim())'
            )
            print(f"    Agenda items: {agenda_items2}")
            if len(agenda_items2) >= 2:
                print(f"    OK Found {len(agenda_items2)} agenda items after re-login")
                passed += 1
            else:
                print(f"    FAIL Expected 2+ agenda items, got {len(agenda_items2)}")
                failed += 1
        else:
            print("\n10. SKIPPED (trip not found)")
            failed += 2

        await browser.close()

        # ===== RESULTS =====
        print(f"\n=== RESULTS ===")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")

        if console_errors:
            print(f"\nConsole errors ({len(console_errors)}):")
            for e in console_errors[:5]:
                print(f"  {e}")

        all_ok = failed == 0
        if all_ok:
            print("\nOK ALL PERSISTENCE CHECKS PASSED!")
        else:
            print(f"\nFAIL {failed} persistence check(s) failed")
        return 0 if all_ok else 1

asyncio.run(main())
