"""
Comprehensive Persistence Audit Test
Verifies actual server-side state after every lifecycle transition.
DOES NOT rely solely on UI state.
"""
import asyncio, json, re, time
from playwright.async_api import async_playwright

URL = 'https://marki.cab/trip-planner.html'
EMAIL = 'e2e-persist-audit@marki.cab'
PASSWORD = 'marki123456'

# Test data with specific content we can verify
TEST_JSON = {
    "name": "Audit Trip Alpha",
    "days": [
        {"day": 1, "items": [{"name": "Verify Agenda 1A"}, {"name": "Verify Agenda 1B"}]},
        {"day": 2, "items": [{"name": "Verify Agenda 2"}]},
        {"day": 3, "items": [{"name": "Verify Agenda 3X"}, {"name": "Verify Agenda 3Y"}]}
    ]
}

async def verify_server_state(page, label, expected_name, expected_agenda_count):
    """Verify trip exists in Supabase via RPC (not just UI)"""
    result = await page.evaluate('''async () => {
        try {
            const res = await window.MarkiAPI.listPersonalTrips();
            if (res.error) return { ok: false, error: res.error.message };
            const trips = Array.isArray(res.data) ? res.data : [];
            const matching = trips.filter(t => t.name === "Audit Trip Alpha");
            if (matching.length === 0) return { ok: false, error: 'trip not found in server', trips: trips.length };
            const trip = matching[0];
            return {
                ok: true,
                server_id: trip.id,
                name: trip.name,
                start: trip.start_date,
                end: trip.end_date,
                items_count: trip.items ? trip.items.length : 0,
                expenses_count: trip.expenses ? trip.expenses.length : 0,
                items: trip.items ? trip.items.map(i => ({ title: i.title, date: i.date })) : []
            };
        } catch(e) {
            return { ok: false, error: e.message };
        }
    }''')
    
    if result.get('ok'):
        print(f"   [{label}] OK Server has trip: id={result['server_id'][:8]}... items={result['items_count']}")
        if result['name'] != expected_name:
            print(f"   FAIL: Expected name '{expected_name}', got '{result['name']}'")
            return False
        if result['items_count'] != expected_agenda_count:
            print(f"   FAIL: Expected {expected_agenda_count} items, got {result['items_count']}")
            return False
        return True
    else:
        print(f"   [{label}] FAIL: {result.get('error')}")
        return False


async def main():
    print("=== COMPREHENSIVE PERSISTENCE AUDIT ===\n")
    passed = 0
    failed = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        console_errors = []
        page.on('console', lambda msg: console_errors.append(f"[{msg.type}] {msg.text}"[:200]) if msg.type == 'error' else None)
        page.on('pageerror', lambda err: console_errors.append(f"[pageerror] {err}"[:200]))
        page.on('dialog', lambda dialog: dialog.accept())

        # ===== STEP 1: LOGIN =====
        print("1. Loading and logging in...")
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(5000)

        email_js = json.dumps(EMAIL)
        pass_js = json.dumps(PASSWORD)
        login_js = "async () => { const email = %s; const password = %s; const r = await window.MarkiAPI.signInWithEmail(email, password); if (r.error) await window.MarkiAPI.signUpWithEmail(email, password); return { ok: true }; }" % (email_js, pass_js)
        await page.evaluate(login_js)
        await page.wait_for_timeout(8000)

        logged_in = await page.is_visible('#logoutBtn')
        if logged_in:
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

        # Wait for sync to complete
        await page.wait_for_timeout(3000)

        # ===== STEP 3: VERIFY UI STATE =====
        print("\n3. Verifying UI state...")
        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(3000)

        trip_cards = await page.eval_on_selector_all(
            '[data-open]',
            'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))'
        )

        imported_trip = None
        for card in trip_cards:
            if 'Audit Trip Alpha' in card['text']:
                imported_trip = card
                break

        if imported_trip:
            print(f"   OK Trip visible in UI")
            passed += 1
        else:
            print("   FAIL Trip not visible in UI")
            failed += 1

        # ===== STEP 4: VERIFY SERVER STATE =====
        print("\n4. Verifying server-side persistence...")
        server_ok = await verify_server_state(page, "POST-IMPORT", "Audit Trip Alpha", 5)
        if server_ok:
            passed += 1
        else:
            failed += 1

        # ===== STEP 5: OPEN AND VERIFY ITINERARY =====
        print("\n5. Opening trip and verifying itinerary...")
        trip_id = imported_trip['id']
        await page.evaluate("(id) => document.querySelector(`[data-open=\"${id}\"]`).click()", trip_id)
        await page.wait_for_timeout(3000)

        day_tabs = await page.eval_on_selector_all('.day-tab', 'els => els.map(e => e.textContent.trim())')
        print(f"   Day tabs: {day_tabs}")
        if len(day_tabs) >= 3:
            print(f"   OK Found {len(day_tabs)} day tabs")
            passed += 1
        else:
            print(f"   FAIL Expected 3 day tabs, got {len(day_tabs)}")
            failed += 1

        agenda_items = await page.eval_on_selector_all('.item-title', 'els => els.map(e => e.textContent.trim())')
        print(f"   Agenda items visible: {agenda_items}")
        if len(agenda_items) >= 2:
            print(f"   OK Found {len(agenda_items)} agenda items on day 1")
            passed += 1
        else:
            print(f"   FAIL Expected 2+ agenda items, got {len(agenda_items)}")
            failed += 1

        # ===== STEP 6: NAVIGATE AWAY AND BACK =====
        print("\n6. Navigating away and back...")
        # Navigate to Plan tab
        plan_tab = await page.query_selector('[data-nav="plan"]')
        if plan_tab:
            await plan_tab.click()
            await page.wait_for_timeout(2000)
        # Navigate back to Trip tab
        trip_tab = await page.query_selector('[data-nav="trip"]')
        if trip_tab:
            await trip_tab.click()
            await page.wait_for_timeout(3000)

        trip_cards2 = await page.eval_on_selector_all('[data-open]', 'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))')
        still_exists = any('Audit Trip Alpha' in c['text'] for c in trip_cards2)
        if still_exists:
            print("   OK Trip persists after navigation")
            passed += 1
        else:
            print("   FAIL Trip lost after navigation")
            failed += 1

        # ===== STEP 7: VERIFY SERVER STATE AFTER NAVIGATION =====
        print("\n7. Verifying server state after navigation...")
        server_ok2 = await verify_server_state(page, "POST-NAVIGATE", "Audit Trip Alpha", 5)
        if server_ok2:
            passed += 1
        else:
            failed += 1

        # ===== STEP 8: PAGE REFRESH =====
        print("\n8. Refreshing page...")
        await page.reload(wait_until='networkidle')
        await page.wait_for_timeout(8000)  # Wait for login + hydration

        trip_cards3 = await page.eval_on_selector_all('[data-open]', 'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))')
        still_exists3 = any('Audit Trip Alpha' in c['text'] for c in trip_cards3)
        if still_exists3:
            print("   OK Trip persists after page refresh")
            passed += 1
        else:
            print("   FAIL Trip lost after page refresh")
            failed += 1

        # ===== STEP 9: VERIFY SERVER STATE AFTER REFRESH =====
        print("\n9. Verifying server state after refresh...")
        server_ok3 = await verify_server_state(page, "POST-REFRESH", "Audit Trip Alpha", 5)
        if server_ok3:
            passed += 1
        else:
            failed += 1

        # ===== STEP 10: LOGOUT =====
        print("\n10. Logging out...")
        await page.click('#logoutBtn')
        await page.wait_for_timeout(5000)

        logout_visible = await page.is_visible('#logoutBtn')
        if not logout_visible:
            print("   OK Logged out")
            passed += 1
        else:
            print("   FAIL Still showing logout button")
            failed += 1

        # ===== STEP 11: LOGIN AGAIN =====
        print("\n11. Logging in again...")
        await page.evaluate(login_js)
        await page.wait_for_timeout(8000)

        logged_in2 = await page.is_visible('#logoutBtn')
        if logged_in2:
            print("   OK Logged back in")
            passed += 1
        else:
            print("   FAIL Login failed")
            failed += 1

        # ===== STEP 12: VERIFY TRIP AFTER RE-LOGIN =====
        print("\n12. Verifying trip after logout/login...")
        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(5000)

        trip_cards4 = await page.eval_on_selector_all('[data-open]', 'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))')
        still_exists4 = any('Audit Trip Alpha' in c['text'] for c in trip_cards4)
        if still_exists4:
            print("   OK Trip persists after logout/login")
            passed += 1
        else:
            print("   FAIL Trip lost after logout/login")
            failed += 1

        # ===== STEP 13: VERIFY SERVER STATE AFTER RE-LOGIN =====
        print("\n13. Verifying server state after re-login...")
        server_ok4 = await verify_server_state(page, "POST-RELOGIN", "Audit Trip Alpha", 5)
        if server_ok4:
            passed += 1
        else:
            failed += 1

        # ===== STEP 14: OPEN AND VERIFY SAME ITINERARY =====
        print("\n14. Opening trip and verifying same itinerary after re-login...")
        for card in trip_cards4:
            if 'Audit Trip Alpha' in card['text']:
                trip_id_re = card['id']
                await page.evaluate("(id) => document.querySelector(`[data-open=\"${id}\"]`).click()", trip_id_re)
                break
        await page.wait_for_timeout(3000)

        day_tabs2 = await page.eval_on_selector_all('.day-tab', 'els => els.map(e => e.textContent.trim())')
        if len(day_tabs2) >= 3:
            print(f"   OK Found {len(day_tabs2)} day tabs")
            passed += 1
        else:
            print(f"   FAIL Expected 3 day tabs, got {len(day_tabs2)}")
            failed += 1

        agenda_items2 = await page.eval_on_selector_all('.item-title', 'els => els.map(e => e.textContent.trim())')
        expected_agendas = ['Verify Agenda 1A', 'Verify Agenda 1B']
        all_present = all(a in agenda_items2 for a in expected_agendas)
        if all_present and len(agenda_items2) >= 2:
            print(f"   OK Same agenda items: {agenda_items2}")
            passed += 1
        else:
            print(f"   FAIL Agenda mismatch. Got: {agenda_items2}")
            failed += 1

        # ===== STEP 15: VERIFY SERVER ITINERARY DETAIL =====
        print("\n15. Verifying server-side itinerary detail...")
        server_detail = await page.evaluate('''async () => {
            const res = await window.MarkiAPI.listPersonalTrips();
            if (res.error) return { ok: false };
            const trips = res.data || [];
            const trip = trips.find(t => t.name === "Audit Trip Alpha");
            if (!trip) return { ok: false };
            
            // Verify all expected items exist
            const expected = ['Verify Agenda 1A', 'Verify Agenda 1B', 'Verify Agenda 2', 'Verify Agenda 3X', 'Verify Agenda 3Y'];
            const titles = trip.items ? trip.items.map(i => i.title) : [];
            const allPresent = expected.every(e => titles.includes(e));
            
            return {
                ok: allPresent,
                server_id: trip.id,
                titles: titles,
                items_count: trip.items ? trip.items.length : 0,
                days_detected: new Set(trip.items.filter(i => i.date).map(i => i.date)).size
            };
        }''')
        
        if server_detail.get('ok'):
            print(f"   OK Server has all {server_detail['items_count']} agenda items")
            print(f"   Titles: {server_detail['titles']}")
            print(f"   Days detected: {server_detail['days_detected']}")
            passed += 1
        else:
            print(f"   FAIL Server itinerary mismatch")
            failed += 1

        await browser.close()

        # ===== RESULTS =====
        print(f"\n=== AUDIT RESULTS ===")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        
        if console_errors:
            print(f"\nConsole errors ({len(console_errors)}):")
            for e in console_errors[:5]:
                print(f"  {e}")

        if failed == 0:
            print("\n✅ ALL AUDIT CHECKS PASSED")
        else:
            print(f"\n❌ {failed} AUDIT CHECK(S) FAILED")
        return 0 if failed == 0 else 1

asyncio.run(main())
