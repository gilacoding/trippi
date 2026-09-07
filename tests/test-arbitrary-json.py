"""
Arbitrary JSON Robustness Test
Verifies the importer handles different JSON structures gracefully.
DOES NOT modify the persistence layer.
"""
import asyncio, json, time
from playwright.async_api import async_playwright

URL = 'https://marki.cab/trip-planner.html'
EMAIL = 'e2e-robust-test@marki.cab'
PASSWORD = 'marki123456'

# Test Case 1: Alternative field names
TEST_1 = {
    "title": "Java Motorcycle Tour",
    "schedule": [
        {
            "dayNumber": 1,
            "places": [
                {"name": "Kawah Putih", "at": "14:00"},
                {"name": "Ranca Upas", "at": "16:00"}
            ]
        },
        {
            "dayNumber": 2,
            "places": [
                {"name": "Situ Bagendit", "at": "09:00"}
            ]
        }
    ]
}

# Test Case 2: Minimal data
TEST_2 = {
    "trip": "Bandung Weekend",
    "days": [
        {
            "day": 1,
            "activities": [
                {"name": "Kawah Putih"}
            ]
        }
    ]
}

# Test Case 3: Different nesting
TEST_3 = {
    "name": "Dieng Trip",
    "plan": {
        "day1": [
            {"place": "Bukit Sikunir"},
            {"place": "Candi Arjuna"}
        ],
        "day2": [
            {"place": "Telaga Warna"}
        ]
    }
}

# Test Case 4: Extra unknown data
TEST_4 = {
    "title": "Java Tour",
    "travelers": 4,
    "weather": {"forecast": "sunny", "temp_c": 25},
    "random_metadata": {"source": "manual", "version": 1},
    "foo": "bar",
    "nested": {"deep": {"data": [1, 2, 3]}},
    "itinerary": [
        {
            "day": 1,
            "activities": [
                {"name": "Kawah Putih", "time": "14:00"},
                {"name": "Ranca Upas", "time": "16:00"}
            ]
        },
        {
            "day": 2,
            "activities": [
                {"name": "Situ Bagendit", "time": "09:00"}
            ]
        }
    ]
}

# Test Case 5: Partial information
TEST_5 = {
    "title": "Mountain Trip",
    "destination": "Bandung",
    "itinerary": [
        {
            "day": 1,
            "activities": [
                {"name": "Kawah Putih", "time": "08:00", "description": "White crater visit"},
                {"name": "Lunch", "time": "12:00"},
                {"name": "Hotel", "time": "15:00", "address": "Jl. Raya No. 1"}
            ]
        },
        {
            "day": 2,
            "activities": [
                {"name": "Tea Plantation"},
                {"name": "Waterfall", "time": "10:00"}
            ]
        }
    ]
}


async def trace_test_case(page, test_num, test_json):
    """Trace a single test case through the complete pipeline."""
    print(f"\n{'='*80}")
    print(f"TEST CASE {test_num}")
    print(f"{'='*80}")
    
    raw_json = json.dumps(test_json)
    print(f"\nRAW JSON ({len(raw_json)} bytes):")
    print(json.dumps(test_json, indent=2)[:1500])
    
    # Parse and trace
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
                    title: i.title,
                    date: i.date,
                    dayNumber: i.dayNumber,
                    time: i.time,
                    note: i.note
                }})).slice(0, 20) : [],
                wishlist_count: res.canonical.wishlist ? res.canonical.wishlist.length : 0,
                metadata: res.canonical.metadata
            }} : null
        }};
    }}''')
    
    print(f"\nPARSED: valid={result['valid']}")
    if result['errors']:
        print(f"Errors: {result['errors']}")
    
    if result['canonical']:
        c = result['canonical']
        print(f"\nCANONICAL:")
        print(f"  Name: {c['name']}")
        print(f"  Destination: {c['destination']}")
        print(f"  Start: {c['start']}")
        print(f"  End: {c['end']}")
        print(f"  Items: {c['items_count']}")
        print(f"  Wishlist: {c['wishlist_count']}")
        if c['items']:
            print(f"\n  First items:")
            for item in c['items']:
                print(f"    - {item['title']} (day:{item['dayNumber']}, date:{item['date']}, time:{item['time']})")
    
    return result


async def import_and_verify(page, test_num, test_json):
    """Import the test JSON and verify server-side persistence."""
    print(f"\n--- Importing Test Case {test_num} ---")
    
    raw_json = json.dumps(test_json)
    
    # Navigate back to home view first
    await page.evaluate('show("homeView")')
    await page.wait_for_timeout(2000)
    
    # Import
    await page.click('#importTripBtn')
    await page.wait_for_timeout(800)
    await page.fill('#importTextarea', raw_json)
    await page.wait_for_timeout(500)
    await page.click('#importSubmit')
    await page.wait_for_timeout(5000)
    
    modal_visible = await page.is_visible('#importModal')
    if modal_visible:
        print("  FAIL: Import modal still open")
        return False
    
    # Wait for sync
    await page.wait_for_timeout(3000)
    
    # Verify server state
    server_result = await page.evaluate('''async () => {
        const res = await window.MarkiAPI.listPersonalTrips();
        if (res.error) return { ok: false, error: res.error.message };
        const trips = res.data || [];
        return {
            ok: true,
            trip_count: trips.length,
            trips: trips.map(t => ({
                name: t.name,
                items_count: t.items ? t.items.length : 0
            })).slice(0, 5)
        };
    }''')
    
    if server_result.get('ok'):
        print(f"  OK: {server_result['trip_count']} trips in server")
        for t in server_result['trips']:
            print(f"    - {t['name']}: {t['items_count']} items")
        return True
    else:
        print(f"  FAIL: {server_result.get('error')}")
        return False


async def main():
    print("=== ARBITRARY JSON ROBUSTNESS TEST ===")
    
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
        result1 = await trace_test_case(page, 1, TEST_1)
        if result1['valid']:
            passed += 1
        else:
            failed += 1
        await import_and_verify(page, 1, TEST_1)

        # Test Case 2
        result2 = await trace_test_case(page, 2, TEST_2)
        if result2['valid']:
            passed += 1
        else:
            failed += 1
        await import_and_verify(page, 2, TEST_2)

        # Test Case 3
        result3 = await trace_test_case(page, 3, TEST_3)
        if result3['valid']:
            passed += 1
        else:
            failed += 1
        await import_and_verify(page, 3, TEST_3)

        # Test Case 4
        result4 = await trace_test_case(page, 4, TEST_4)
        if result4['valid']:
            passed += 1
        else:
            failed += 1
        await import_and_verify(page, 4, TEST_4)

        # Test Case 5
        result5 = await trace_test_case(page, 5, TEST_5)
        if result5['valid']:
            passed += 1
        else:
            failed += 1
        await import_and_verify(page, 5, TEST_5)

        await browser.close()

        # Results
        print(f"\n{'='*80}")
        print(f"ROBUSTNESS TEST RESULTS")
        print(f"{'='*80}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")

        if failed == 0:
            print("\n✅ ALL ROBUSTNESS CHECKS PASSED")
        else:
            print(f"\n❌ {failed} CHECK(S) FAILED")

        return 0 if failed == 0 else 1

asyncio.run(main())
