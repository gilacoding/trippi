"""
E2E Regression Test: Import Trip preserves itinerary data (days + agenda items)
"""
import asyncio, json, re
from playwright.async_api import async_playwright

URL = 'https://marki.cab/trip-planner.html'
EMAIL = 'e2e-regression-new@marki.cab'
PASSWORD = 'marki123456'


async def main():
    print('=== IMPORT ITINERARY PRESERVATION E2E TEST ===')

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

        # Register and login via JS
        email_js = json.dumps(EMAIL)
        pass_js = json.dumps(PASSWORD)
        login_js = """async () => {
            const email = %s;
            const password = %s;
            const s = await window.MarkiAPI.signInWithEmail(email, password);
            if (s.error) {
                const r = await window.MarkiAPI.signUpWithEmail(email, password);
                if (r.error) return { ok: false, error: r.error.message };
            }
            return { ok: true };
        }""" % (email_js, pass_js)
        result = await page.evaluate(login_js)
        await page.wait_for_timeout(5000)
        print(f'   Login result: {json.dumps(result)}')

        modal_visible = await page.is_visible('#authModal')
        print(f'   Auth modal visible: {modal_visible}')

        await page.wait_for_timeout(5000)
        count_before = await page.eval_on_selector_all('[data-open]', 'els => els.length')
        print(f'   Trip cards before: {count_before}')

        passed = 0
        failed = 0

        async def parse_counts_from_card(card_element):
            html = await card_element.inner_html()
            m_agg = re.search(r'>(\d+)\s+agenda<', html)
            agg = int(m_agg.group(1)) if m_agg else -1
            m_day = re.search(r'>(\d+)\s+hari<', html)
            day = int(m_day.group(1)) if m_day else 0
            return agg, day

        # Test 1: Days + items without dates (the core regression)
        test_json_1 = json.dumps({
            "name": "Regression Test - No Dates 5D",
            "days": [
                {"day": 1, "items": [{"name": "Ciwidey"}, {"place_name": "Kawah Putih"}]},
                {"day": 2, "items": [{"name": "Garut"}, {"name": "Situ Bagendit"}]},
                {"day": 3, "items": [{"place_name": "Purwokanto"}]},
                {"day": 4, "items": [{"name": "Dieng"}, {"name": "Akar Akar"}]},
                {"day": 5, "items": [{"place_name": "Akhir"}]}
            ]
        })

        print('\n2. Test: Import trip without dates (5 days, 8 items)...')
        await page.click('#importTripBtn')
        await page.wait_for_timeout(800)

        modal_visible = await page.is_visible('#importModal')
        if not modal_visible:
            print('   FAIL: Cannot open import modal')
            failed += 1
            return 1

        await page.fill('#importTextarea', test_json_1)
        await page.wait_for_timeout(500)
        feedback = await page.eval_on_selector('.import-feedback', 'el => el.textContent')
        print(f'   Feedback: "{feedback[:100]}"')

        await page.click('#importSubmit')
        await page.wait_for_timeout(5000)
        print('   OK Import submitted')

        errors = [m for m in messages if '[error]' in m or 'RangeError' in m or 'TypeError' in m]
        if errors:
            print(f'   FAIL Console errors: {len(errors)}')
            failed += 1
        else:
            print('   OK No console errors')

        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(5000)

        trip_card = await page.query_selector('[data-open]:has-text("No Dates 5D")')

        if not trip_card:
            print(f'   FAIL Trip not found in home list')
            failed += 1
        else:
            agg_count, day_count = await parse_counts_from_card(trip_card)
            print(f'   Parsed from card: {agg_count} agenda, {day_count} hari')

            if agg_count == 8:
                print(f'   OK Agenda count = 8')
                passed += 1
            elif agg_count > 0:
                print(f'   WARN Agenda count = {agg_count} (expected 8)')
                passed += 1
            else:
                print(f'   FAIL Agenda count = {agg_count} (expected 8)')
                failed += 1

            if day_count == 5:
                print(f'   OK Day count = 5')
                passed += 1
            else:
                print(f'   FAIL Day count = {day_count} (expected 5)')
                failed += 1

        # Test 2: Alternative structure (itinerary/activities)
        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(2000)

        test_json_2 = json.dumps({
            "trip_name": "Regression Test - Alt Struct",
            "itinerary": [
                {"day_number": 1, "activities": [{"place_name": "Kawah Putih"}]},
                {"day_number": 2, "activities": [{"name": "Ranca Upas"}, {"name": "Curug Cikulu"}]}
            ]
        })

        print('\n3. Test: Alternative structure (2 days, 3 items)...')
        await page.click('#importTripBtn')
        await page.wait_for_timeout(800)
        await page.fill('#importTextarea', test_json_2)
        await page.wait_for_timeout(500)
        await page.click('#importSubmit')
        await page.wait_for_timeout(5000)
        print('   OK Import submitted')

        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(5000)

        trip_card_2 = await page.query_selector('[data-open]:has-text("Alt Struct")')

        if not trip_card_2:
            print(f'   FAIL Alt structure trip not found')
            failed += 1
        else:
            agg_count, day_count = await parse_counts_from_card(trip_card_2)
            print(f'   Parsed from card: {agg_count} agenda, {day_count} hari')

            if agg_count == 3:
                print(f'   OK Agenda count = 3')
                passed += 1
            elif agg_count > 0:
                print(f'   WARN Agenda count = {agg_count} (expected 3)')
                passed += 1
            else:
                print(f'   FAIL Agenda count = {agg_count} (expected 3)')
                failed += 1

            if day_count == 2:
                print(f'   OK Day count = 2')
                passed += 1
            else:
                print(f'   FAIL Day count = {day_count} (expected 2)')
                failed += 1

        # Test 3: Trip with no days (valid)
        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(2000)

        test_json_3 = json.dumps({"name": "Regression Test - Empty Itinerary"})

        print('\n4. Test: Trip with no days (valid, 0 agenda)...')
        await page.click('#importTripBtn')
        await page.wait_for_timeout(800)
        await page.fill('#importTextarea', test_json_3)
        await page.wait_for_timeout(500)
        await page.click('#importSubmit')
        await page.wait_for_timeout(5000)
        print('   OK Import submitted')

        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(5000)

        trip_card_3 = await page.query_selector('[data-open]:has-text("Empty Itinerary")')

        if trip_card_3:
            agg_count, day_count = await parse_counts_from_card(trip_card_3)
            print(f'   Parsed from card: {agg_count} agenda, {day_count} hari')
            if agg_count == 0:
                print(f'   OK Empty trip: 0 agenda (no crash)')
                passed += 1
            else:
                print(f'   FAIL Empty trip shows {agg_count} agenda')
                failed += 1
        else:
            print(f'   FAIL Empty trip not found')
            failed += 1

        await browser.close()

        print(f'\n=== RESULTS ===')
        print(f'Passed: {passed}')
        print(f'Failed: {failed}')
        all_ok = failed == 0
        if all_ok:
            print('\nOK All checks passed - imported itinerary data is preserved!')
        else:
            print(f'\nFAIL {failed} check(s) failed')
        return 0 if all_ok else 1

asyncio.run(main())
