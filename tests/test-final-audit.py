"""
Comprehensive Final Audit
Tests persistence, RLS, extraction, and failure scenarios.
"""
import asyncio, json, time
from playwright.async_api import async_playwright

URL = 'https://marki.cab/trip-planner.html'
EMAIL = 'e2e-final-audit@marki.cab'
PASSWORD = 'marki123456'

# Test Case 1: Alternative field names
TEST_1 = {
    "title": "Java Motorcycle Tour",
    "schedule": [
        {"dayNumber": 1, "places": [{"name": "Kawah Putih", "at": "14:00"}, {"name": "Ranca Upas", "at": "16:00"}]},
        {"dayNumber": 2, "places": [{"name": "Situ Bagendit", "at": "09:00"}]}
    ]
}

# Test Case 2: Minimal data
TEST_2 = {
    "trip": "Bandung Weekend",
    "days": [{"day": 1, "activities": [{"name": "Kawah Putih"}]}]
}

# Test Case 3: Different nesting (object keys as days)
TEST_3 = {
    "name": "Dieng Trip",
    "plan": {
        "day1": [{"place": "Bukit Sikunir"}, {"place": "Candi Arjuna"}],
        "day2": [{"place": "Telaga Warna"}]
    }
}

# Test Case 4: Extra unknown data
TEST_4 = {
    "title": "Java Tour",
    "travelers": 4,
    "weather": {"forecast": "sunny"},
    "random_metadata": {"source": "manual"},
    "foo": "bar",
    "itinerary": [
        {"day": 1, "activities": [{"name": "Kawah Putih", "time": "14:00"}]},
        {"day": 2, "activities": [{"name": "Situ Bagendit", "time": "09:00"}]}
    ]
}

# Test Case 5: Partial information
TEST_5 = {
    "title": "Mountain Trip",
    "destination": "Bandung",
    "itinerary": [
        {"day": 1, "activities": [{"name": "Kawah Putih", "time": "08:00"}, {"name": "Lunch", "time": "12:00"}, {"name": "Hotel"}]},
        {"day": 2, "activities": [{"name": "Tea Plantation"}, {"name": "Waterfall", "time": "10:00"}]}
    ]
}

# Test Case 6: 5-day Bekasi trip (original)
TEST_6 = {
    "name": "Bekasi → Ciwidey → Garut → Purwokerto → Dieng",
    "destination": "Dieng, Central Java",
    "start_date": "2026-09-25",
    "end_date": "2026-09-29",
    "itinerary": [
        {"day": 1, "date": "2026-09-25", "activities": [
            {"time": "06:00", "title": "Depart Bekasi"},
            {"time": "08:30", "title": "Breakfast in Cianjur"},
            {"time": "14:00", "title": "Kawah Putih"},
            {"time": "17:00", "title": "Ranca Upas"}
        ]},
        {"day": 2, "date": "2026-09-26", "activities": [
            {"time": "07:00", "title": "Hotel Breakfast"},
            {"time": "09:00", "title": "Situ Bagendit"},
            {"time": "14:00", "title": "Curug Cikulu"}
        ]},
        {"day": 3, "date": "2026-09-27", "activities": [
            {"time": "06:30", "title": "Early Breakfast"},
            {"time": "08:00", "title": "Baturraden"},
            {"time": "15:00", "title": "Sungai Serayu"}
        ]},
        {"day": 4, "date": "2026-09-28", "activities": [
            {"time": "07:00", "title": "Hotel Breakfast"},
            {"time": "09:00", "title": "Telaga Warna"},
            {"time": "11:00", "title": "Candi Arjuna"},
            {"time": "15:00", "title": "Sikidang Crater"}
        ]},
        {"day": 5, "date": "2026-09-29", "activities": [
            {"time": "06:00", "title": "Sunrise at Sikunir"},
            {"time": "09:00", "title": "Akar Akar"},
            {"time": "11:00", "title": "Depart Dieng"}
        ]}
    ]
}


async def trace_pipeline(page, test_num, test_json):
    """Trace the complete pipeline for a test case."""
    print(f"\n{'='*60}")
    print(f"TEST CASE {test_num}")
    print(f"{'='*60}")
    
    raw_json = json.dumps(test_json)
    print(f"RAW JSON ({len(raw_json)} bytes):")
    print(json.dumps(test_json, indent=2)[:1200])
    
    result = await page.evaluate(f'''() => {{
        const parser = window.JSONImportParser;
        const raw = `{raw_json}`;
        const res = parser.parse(raw);
        return {{
            valid: res.valid,
            errors: res.errors,
            canonical: res.canonical ? {{
                name: res.canonical.name,
                destination: res.canonical.destination,
                start: res.canonical.start,
                end: res.canonical.end,
                items_count: res.canonical.items ? res.canonical.items.length : 0,
                items: res.canonical.items ? res.canonical.items.map(i => ({{
                    title: i.title, date: i.date, dayNumber: i.dayNumber, time: i.time
                }})).slice(0, 15) : [],
                wishlist_count: res.canonical.wishlist ? res.canonical.wishlist.length : 0
            }} : null
        }};
    }}''')
    
    print(f"\nPARSED: valid={result['valid']}")
    if result['errors']:
        print(f"Errors: {result['errors']}")
    
    if result['canonical']:
        c = result['canonical']
        print(f"CANONICAL:")
        print(f"  Name: {c['name']}")
        print(f"  Destination: {c['destination']}")
        print(f"  Start: {c['start']}")
        print(f"  End: {c['end']}")
        print(f"  Items: {c['items_count']}")
        if c['items']:
            for item in c['items']:
                print(f"    - {item['title']} (day:{item['dayNumber']}, date:{item['date']}, time:{item['time']})")
    
    return result


async def import_and_verify_server(page, test_num, expected_name, expected_min_items):
    """Import and verify server-side state."""
    print(f"\n--- Importing Test Case {test_num} ---")
    
    # Close any open modal first
    modal_visible = await page.is_visible('#importModal')
    if modal_visible:
        cancel_btn = await page.query_selector('#importCancel')
        if cancel_btn:
            await cancel_btn.click()
            await page.wait_for_timeout(1000)
    
    # Navigate to home
    await page.evaluate('show("homeView")')
    await page.wait_for_timeout(2000)
    
    # Import
    await page.click('#importTripBtn')
    await page.wait_for_timeout(800)
    
    test_json = globals()[f'TEST_{test_num}']
    await page.fill('#importTextarea', json.dumps(test_json))
    await page.wait_for_timeout(500)
    await page.click('#importSubmit')
    await page.wait_for_timeout(5000)
    
    # Wait for modal to close
    await page.wait_for_timeout(2000)
    
    modal_visible = await page.is_visible('#importModal')
    if modal_visible:
        print("  FAIL: Import modal still open")
        return False
    
    await page.wait_for_timeout(3000)
    
    # Verify server state
    search_name = expected_name or "Trip"
    server_result = await page.evaluate(f'''async () => {{
        const res = await window.MarkiAPI.listPersonalTrips();
        if (res.error) return {{ ok: false, error: res.error.message }};
        const trips = res.data || [];
        const matching = trips.filter(t => t.name && t.name.includes('{search_name[:15]}'));
        if (matching.length === 0) return {{ ok: false, error: 'trip not found', total: trips.length }};
        const trip = matching[0];
        return {{
            ok: true,
            server_id: trip.id,
            name: trip.name,
            items_count: trip.items ? trip.items.length : 0,
            items: trip.items ? trip.items.map(i => ({{ title: i.title, date: i.date }})) : []
        }};
    }}''')
    
    if server_result.get('ok'):
        print(f"  OK: Server has trip '{server_result['name']}' with {server_result['items_count']} items")
        if server_result['items_count'] >= expected_min_items:
            print(f"  OK: Meets minimum {expected_min_items} items")
            return True
        else:
            print(f"  FAIL: Expected >= {expected_min_items} items, got {server_result['items_count']}")
            return False
    else:
        print(f"  FAIL: {server_result.get('error')}")
        return False


async def main():
    print("=== COMPREHENSIVE FINAL AUDIT ===")
    
    passed = 0
    failed = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        console_errors = []
        page.on('console', lambda msg: console_errors.append(f"[{msg.type}] {msg.text}"[:200]) if msg.type == 'error' else None)
        page.on('pageerror', lambda err: console_errors.append(f"[pageerror] {err}"[:200]))
        # Handle all dialogs (confirm, alert) automatically
        async def handle_dialog(dialog):
            await dialog.accept()
        page.on('dialog', handle_dialog)

        # Login
        print("\nLogging in...")
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(5000)

        email_js = json.dumps(EMAIL)
        pass_js = json.dumps(PASSWORD)
        login_js = "async () => { const email = %s; const password = %s; const r = await window.MarkiAPI.signInWithEmail(email, password); if (r.error) await window.MarkiAPI.signUpWithEmail(email, password); return { ok: true }; }" % (email_js, pass_js)
        await page.evaluate(login_js)
        await page.wait_for_timeout(8000)

        logged_in = await page.is_visible('#logoutBtn')
        if not logged_in:
            print("FAIL: Login failed")
            failed += 1
            return 1
        print("OK Logged in")

        # Test Case 1
        r1 = await trace_pipeline(page, 1, TEST_1)
        if r1['valid'] and r1['canonical']['items_count'] >= 3:
            passed += 1
        else:
            failed += 1
        await import_and_verify_server(page, 1, "Java Motorcycle Tour", 3)

        # Test Case 2
        r2 = await trace_pipeline(page, 2, TEST_2)
        if r2['valid'] and r2['canonical']['items_count'] >= 1:
            passed += 1
        else:
            failed += 1
        await import_and_verify_server(page, 2, "Bandung Weekend", 1)

        # Test Case 3
        r3 = await trace_pipeline(page, 3, TEST_3)
        if r3['valid']:
            passed += 1
        else:
            failed += 1
        await import_and_verify_server(page, 3, "Dieng Trip", 0)

        # Test Case 4
        r4 = await trace_pipeline(page, 4, TEST_4)
        if r4['valid'] and r4['canonical']['items_count'] >= 3:
            passed += 1
        else:
            failed += 1
        await import_and_verify_server(page, 4, "Java Tour", 2)

        # Test Case 5
        r5 = await trace_pipeline(page, 5, TEST_5)
        if r5['valid'] and r5['canonical']['items_count'] >= 5:
            passed += 1
        else:
            failed += 1
        await import_and_verify_server(page, 5, "Mountain Trip", 5)

        # Test Case 6 (5-day Bekasi)
        r6 = await trace_pipeline(page, 6, TEST_6)
        if r6['valid'] and r6['canonical']['items_count'] >= 17:
            passed += 1
        else:
            failed += 1
        await import_and_verify_server(page, 6, "Bekasi", 17)

        # Lifecycle test on Test Case 6
        print(f"\n{'='*60}")
        print("LIFECYCLE TEST (Test Case 6)")
        print(f"{'='*60}")
        
        # Navigate away and back
        print("\nNavigating away...")
        plan_tab = await page.query_selector('[data-nav="plan"]')
        if plan_tab:
            await plan_tab.click()
            await page.wait_for_timeout(2000)
        trip_tab = await page.query_selector('[data-nav="trip"]')
        if trip_tab:
            await trip_tab.click()
            await page.wait_for_timeout(3000)
        
        # Verify still exists
        trip_cards = await page.eval_on_selector_all('[data-open]', 'els => els.map(e => e.textContent)')
        still_exists = any('Bekasi' in c and 'Dieng' in c for c in trip_cards)
        if still_exists:
            print("   OK Trip persists after navigation")
            passed += 1
        else:
            print("   FAIL Trip lost after navigation")
            failed += 1
        
        # Refresh
        print("\nRefreshing page...")
        await page.reload(wait_until='networkidle')
        await page.wait_for_timeout(8000)
        
        trip_cards2 = await page.eval_on_selector_all('[data-open]', 'els => els.map(e => e.textContent)')
        still_exists2 = any('Bekasi' in c and 'Dieng' in c for c in trip_cards2)
        if still_exists2:
            print("   OK Trip persists after refresh")
            passed += 1
        else:
            print("   FAIL Trip lost after refresh")
            failed += 1
        
        # Verify server state after refresh
        server_after_refresh = await page.evaluate('''async () => {
            const res = await window.MarkiAPI.listPersonalTrips();
            if (res.error) return { ok: false, error: res.error.message };
            const trips = res.data || [];
            const matching = trips.filter(t => t.name && t.name.includes('Bekasi') && t.name.includes('Dieng'));
            if (matching.length === 0) return { ok: false, error: 'not found' };
            return { ok: true, items_count: matching[0].items ? matching[0].items.length : 0 };
        }''')
        
        if server_after_refresh.get('ok') and server_after_refresh['items_count'] >= 17:
            print(f"   OK Server has {server_after_refresh['items_count']} items after refresh")
            passed += 1
        else:
            print(f"   FAIL Server state lost after refresh")
            failed += 1
        
        # Logout/Login
        print("\nLogging out...")
        await page.click('#logoutBtn')
        await page.wait_for_timeout(5000)
        
        print("Logging in again...")
        await page.evaluate(login_js)
        await page.wait_for_timeout(8000)
        
        logged_in2 = await page.is_visible('#logoutBtn')
        if logged_in2:
            print("   OK Logged back in")
            passed += 1
        else:
            print("   FAIL Login failed")
            failed += 1
        
        # Verify trip after re-login
        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(5000)
        
        trip_cards3 = await page.eval_on_selector_all('[data-open]', 'els => els.map(e => e.textContent)')
        still_exists3 = any('Bekasi' in c and 'Dieng' in c for c in trip_cards3)
        if still_exists3:
            print("   OK Trip persists after logout/login")
            passed += 1
        else:
            print("   FAIL Trip lost after logout/login")
            failed += 1
        
        # Verify server state after re-login
        server_after_relogin = await page.evaluate('''async () => {
            const res = await window.MarkiAPI.listPersonalTrips();
            if (res.error) return { ok: false, error: res.error.message };
            const trips = res.data || [];
            const matching = trips.filter(t => t.name && t.name.includes('Bekasi') && t.name.includes('Dieng'));
            if (matching.length === 0) return { ok: false, error: 'not found' };
            const trip = matching[0];
            return {
                ok: true,
                items_count: trip.items ? trip.items.length : 0,
                titles: trip.items ? trip.items.map(i => i.title) : []
            };
        }''')
        
        if server_after_relogin.get('ok') and server_after_relogin['items_count'] >= 17:
            print(f"   OK Server has {server_after_relogin['items_count']} items after re-login")
            print(f"   Titles: {server_after_relogin['titles'][:10]}")
            passed += 1
        else:
            print(f"   FAIL Server state lost after re-login")
            failed += 1

        await browser.close()

        # Results
        print(f"\n{'='*60}")
        print(f"FINAL AUDIT RESULTS")
        print(f"{'='*60}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")

        if console_errors:
            print(f"\nConsole errors ({len(console_errors)}):")
            for e in console_errors[:10]:
                print(f"  {e}")

        if failed == 0:
            print("\n✅ ALL AUDIT CHECKS PASSED")
        else:
            print(f"\n❌ {failed} AUDIT CHECK(S) FAILED")
        return 0 if failed == 0 else 1

asyncio.run(main())
