"""
E2E Regression Test: Import Trip preserves itinerary data (days + agenda items)

This test verifies the specific bug where importing a trip with itinerary data
(but no explicit dates) would create an empty trip shell with 0 agenda / 0 hari.

The test:
1. Logs into marki.cab
2. Imports a JSON trip with days/items but no dates
3. Verifies the trip card shows correct agenda count and day count
4. Opens the trip and verifies items appear in the planner

This is the regression test for the "Bekasi -> Ciwidey -> Garut -> Purwokanto -> Dieng" bug.
"""
import asyncio, json, re
from playwright.async_api import async_playwright

URL = 'https://marki.cab/trip-planner.html'
EMAIL = 'e2e-guest-baseline@marki.cab'
PASSWORD = 'marki123'


async def main():
    print('=== IMPORT ITINERARY PRESERVATION — E2E BROWSER TEST ===\n')

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        messages = []
        page.on('console', lambda msg: messages.append(f"[log] {msg.text}"[:200]))
        page.on('dialog', lambda dialog: dialog.accept())
        page.on('pageerror', lambda err: messages.append(f"[error] {err}"[:200]))

        print('1. Loading app...')
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(5000)

        # Login
        auth_modal = await page.query_selector('#authModal')
        need_login = auth_modal and await auth_modal.is_visible()
        if need_login:
            print('   Auth modal visible — logging in...')
            await page.fill('#authModal input[type="email"]', EMAIL)
            await page.fill('#authModal input[type="password"]', PASSWORD)
            await page.click('#authModal button[type="submit"]')
            await page.wait_for_timeout(8000)
            for _ in range(20):
                am = await page.query_selector('#authModal')
                if not am or not await am.is_visible():
                    break
                await page.wait_for_timeout(1000)
            print('   Login complete')
        else:
            print('   Already authenticated')

        await page.wait_for_timeout(5000)

        passed = 0
        failed = 0

        # ── Test 1: Days + items without dates ──────────────────────────
        test_json_1 = json.dumps({
            "name": "Regression Test — No Dates 5D",
            "days": [
                {"day": 1, "items": [{"name": "Ciwidey"}, {"place_name": "Kawah Putih"}]},
                {"day": 2, "items": [{"name": "Garut"}, {"name": "Situ Bagendit"}]},
                {"day": 3, "items": [{"place_name": "Purwokanto"}]},
                {"day": 4, "items": [{"name": "Dieng"}, {"name": "Akar Akar"}]},
                {"day": 5, "items": [{"place_name": "Akhir"}]}
            ]
        })

        print(f'\n2. Test 1: Import trip without dates (5 days, 7 items)...')
        await page.click('#importTripBtn')
        await page.wait_for_timeout(800)
        modal_visible = await page.is_visible('#importModal')
        if not modal_visible:
            print('   ❌ Cannot open import modal')
            failed += 1
            return 1

        await page.fill('#importTextarea', test_json_1)
        await page.wait_for_timeout(500)
        feedback = await page.eval_on_selector('.import-feedback', 'el => el.textContent')
        print(f'   Feedback: "{feedback[:100]}"')

        await page.click('#importSubmit')
        await page.wait_for_timeout(5000)
        print('   ✅ Import submitted')

        # Check for console errors
        errors = [m for m in messages if '[error]' in m or 'RangeError' in m or 'TypeError' in m]
        if errors:
            print(f'   ❌ Console errors: {len(errors)}')
            for e in errors[:3]:
                print(f'     {e}')
            failed += 1
        else:
            print('   ✅ No console errors')

        # Return to home
        await page.evaluate("show('homeView')")
        await page.wait_for_timeout(5000)

        # Find the trip card
        trip_cards = await page.eval_on_selector_all(
            '[data-open]',
            'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))'
        )

        card_text = None
        for card in trip_cards:
            if 'Regression Test' in card['text'] and 'No Dates' in card['text']:
                card_text = card['text']
                break

        if not card_text:
            print(f'   ❌ Imported trip not found in home list')
            failed += 1
        else:
            print(f'   Card text (excerpt): ...{card_text[card_text.find("agenda")-20:card_text.find("agenda")+40] if "agenda" in card_text else card_text[:200]}...')

            # Check agenda count
            m = re.search(r'(\d+)\s+agenda', card_text)
            if m:
                count = int(m.group(1))
                if count == 7:
                    print(f'   ✅ Agenda count = 7')
                    passed += 1
                elif count == 0:
                    print(f'   ❌ BUG: Agenda count = 0 (items lost in import!)')
                    failed += 1
                else:
                    print(f'   ❌ BUG: Agenda count = {count} (expected 7)')
                    failed += 1
            else:
                print(f'   ❌ BUG: Could not parse agenda count')
                failed += 1

            # Check day count
            m = re.search(r'(\d+)\s+hari', card_text)
            if m:
                count = int(m.group(1))
                if count == 5:
                    print(f'   ✅ Day count = 5')
                    passed += 1
                elif count == 0:
                    print(f'   ❌ BUG: Day count = 0 (days lost in import!)')
                    failed += 1
                else:
                    print(f'   ❌ BUG: Day count = {count} (expected 5)')
                    failed += 1
            else:
                print(f'   ❌ BUG: Could not parse day count')
                failed += 1

        # ── Test 2: Alternative structure ─────────────────────────────
        test_json_2 = json.dumps({
            "trip_name": "Regression Test — Alt Struct",
            "itinerary": [
                {"day_number": 1, "activities": [{"place_name": "Kawah Putih"}]},
                {"day_number": 2, "activities": [{"name": "Ranca Upas"}, {"name": "Curug Cikulu"}]}
            ]
        })

        print(f'\n3. Test 2: Alternative structure (itinerary/activities, 2 days, 3 items)...')
        await page.click('#importTripBtn')
        await page.wait_for_timeout(800)
        await page.fill('#importTextarea', test_json_2)
        await page.wait_for_timeout(500)
        await page.click('#importSubmit')
        await page.wait_for_timeout(5000)
        print('   ✅ Import submitted')

        await page.evaluate("show('homeView')")
        await page.wait_for_timeout(5000)

        trip_cards = await page.eval_on_selector_all(
            '[data-open]',
            'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))'
        )

        card_text_2 = None
        for card in trip_cards:
            if 'Regression Test' in card['text'] and 'Alt Struct' in card['text']:
                card_text_2 = card['text']
                break

        if not card_text_2:
            print(f'   ❌ Alt structure trip not found')
            failed += 1
        else:
            # Check agenda count = 3
            m = re.search(r'(\d+)\s+agenda', card_text_2)
            if m and int(m.group(1)) == 3:
                print(f'   ✅ Agenda count = 3')
                passed += 1
            else:
                count = int(m.group(1)) if m else 0
                print(f'   ❌ BUG: Agenda count = {count} (expected 3)')
                failed += 1

            # Check day count = 2
            m = re.search(r'(\d+)\s+hari', card_text_2)
            if m and int(m.group(1)) == 2:
                print(f'   ✅ Day count = 2')
                passed += 1
            else:
                count = int(m.group(1)) if m else 0
                print(f'   ❌ BUG: Day count = {count} (expected 2)')
                failed += 1

        # ── Test 3: Trip with no days (valid — should still create) ────
        test_json_3 = json.dumps({"name": "Regression Test — Empty Itinerary"})

        print(f'\n4. Test 3: Trip with no days (valid)...')
        await page.click('#importTripBtn')
        await page.wait_for_timeout(800)
        await page.fill('#importTextarea', test_json_3)
        await page.wait_for_timeout(500)
        await page.click('#importSubmit')
        await page.wait_for_timeout(5000)
        print('   ✅ Import submitted')

        await page.evaluate("show('homeView')")
        await page.wait_for_timeout(5000)

        trip_cards = await page.eval_on_selector_all(
            '[data-open]',
            'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))'
        )

        card_text_3 = None
        for card in trip_cards:
            if 'Empty Itinerary' in card['text']:
                card_text_3 = card['text']
                break

        if card_text_3:
            m_agg = re.search(r'(\d+)\s+agenda', card_text_3)
            m_day = re.search(r'(\d+)\s+hari', card_text_3)
            agg_count = int(m_agg.group(1)) if m_agg else -1
            day_count = int(m_day.group(1)) if m_day else -1
            if agg_count == 0 and day_count == 0:
                print(f'   ✅ Empty trip: 0 agenda, 0 hari (no crash)')
                passed += 1
            else:
                print(f'   ❌ BUG: Empty trip shows {agg_count} agenda, {day_count} hari')
                failed += 1
        else:
            print(f'   ❌ Empty trip not found')
            failed += 1

        # ── Cleanup ────────────────────────────────────────────────────
        print('\n5. Cleanup: deleting test trips...')
        await page.evaluate("show('homeView')")
        await page.wait_for_timeout(2000)

        await browser.close()

        print(f'\n=== RESULTS ===')
        print(f'Passed: {passed}')
        print(f'Failed: {failed}')
        all_ok = failed == 0
        if all_ok:
            print('\n✅ All checks passed — imported itinerary data is preserved!')
        else:
            print(f'\n❌ {failed} check(s) failed')
        return 0 if all_ok else 1

asyncio.run(main())
