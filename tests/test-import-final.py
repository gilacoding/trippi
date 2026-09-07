"""
Final Import Trip Integration Test
Traces the complete pipeline for the real 5-day Bekasi-Dieng travel JSON.
"""
import asyncio, json, re, time
from playwright.async_api import async_playwright

URL = 'https://marki.cab/trip-planner.html'
EMAIL = 'e2e-import-final@marki.cab'
PASSWORD = 'marki123456'

# Real 5-day travel JSON - Bekasi → Ciwidey → Garut → Purwokerto → Dieng → Bekasi
BEKASI_DIENG_JSON = {
    "name": "Bekasi → Ciwidey → Garut → Purwokerto → Dieng",
    "destination": "Dieng, Central Java",
    "start_date": "2026-09-25",
    "end_date": "2026-09-29",
    "travelers": 2,
    "budget_estimate": 5000000,
    "notes": "5-day motorcycle tour through southern Java",
    "itinerary": [
        {
            "day": 1,
            "date": "2026-09-25",
            "title": "Bekasi → Ciwidey",
            "route": {"from": "Bekasi", "to": "Ciwidey", "distance_km": 180, "duration_hours": 6},
            "activities": [
                {"time": "06:00", "title": "Depart Bekasi", "description": "Morning departure from Bekasi", "type": "transport"},
                {"time": "08:30", "title": "Breakfast in Cianjur", "description": "Stop for breakfast", "type": "meal"},
                {"time": "12:00", "title": "Arrive Ciwidey", "description": "Check in to hotel", "type": "accommodation"},
                {"time": "14:00", "title": "Kawah Putih", "description": "Visit the white crater", "type": "attraction"},
                {"time": "17:00", "title": "Ranca Upas", "description": "Deer conservation area", "type": "attraction"},
                {"time": "19:00", "title": "Dinner", "description": "Local Sundanese cuisine", "type": "meal"}
            ],
            "accommodation": {"name": "Ciwidey Hotel", "type": "hotel", "price": 450000},
            "meals": ["breakfast", "dinner"]
        },
        {
            "day": 2,
            "date": "2026-09-26",
            "title": "Ciwidey → Garut",
            "route": {"from": "Ciwidey", "to": "Garut", "distance_km": 120, "duration_hours": 4},
            "activities": [
                {"time": "07:00", "title": "Hotel Breakfast", "description": "Breakfast at hotel", "type": "meal"},
                {"time": "09:00", "title": "Situ Bagendit", "description": "Lake visit", "type": "attraction"},
                {"time": "12:00", "title": "Lunch in Garut", "description": "Local cuisine", "type": "meal"},
                {"time": "14:00", "title": "Curug Cikulu", "description": "Waterfall", "type": "attraction"},
                {"time": "16:00", "title": "Kebun Teh Gunung Mas", "description": "Tea plantation", "type": "attraction"},
                {"time": "19:00", "title": "Dinner", "description": "Seafood dinner", "type": "meal"}
            ],
            "accommodation": {"name": "Garut Resort", "type": "resort", "price": 350000},
            "meals": ["breakfast", "lunch", "dinner"]
        },
        {
            "day": 3,
            "date": "2026-09-27",
            "title": "Garut → Purwokerto",
            "route": {"from": "Garut", "to": "Purwokerto", "distance_km": 200, "duration_hours": 7},
            "activities": [
                {"time": "06:30", "title": "Early Breakfast", "description": "Quick breakfast", "type": "meal"},
                {"time": "08:00", "title": "Baturraden", "description": "Mountain resort", "type": "attraction"},
                {"time": "12:00", "title": "Lunch in Baturraden", "description": "Mountain view dining", "type": "meal"},
                {"time": "15:00", "title": "Sungai Serayu", "description": "River tubing", "type": "activity"},
                {"time": "18:00", "title": "Check in Purwokerto", "description": "Hotel check-in", "type": "accommodation"},
                {"time": "19:30", "title": "Dinner", "description": "Local food", "type": "meal"}
            ],
            "accommodation": {"name": "Purwokerto Hotel", "type": "hotel", "price": 400000},
            "meals": ["breakfast", "lunch", "dinner"]
        },
        {
            "day": 4,
            "date": "2026-09-28",
            "title": "Purwokerto → Dieng",
            "route": {"from": "Purwokerto", "to": "Dieng", "distance_km": 150, "duration_hours": 5},
            "activities": [
                {"time": "07:00", "title": "Hotel Breakfast", "description": "Breakfast at hotel", "type": "meal"},
                {"time": "09:00", "title": "Telaga Warna", "description": "Color lake", "type": "attraction"},
                {"time": "11:00", "title": "Candi Arjuna", "description": "Hindu temple complex", "type": "attraction"},
                {"time": "13:00", "title": "Lunch", "description": "Local food", "type": "meal"},
                {"time": "15:00", "title": "Sikidang Crater", "description": "Active crater", "type": "attraction"},
                {"time": "17:00", "title": "Check in Dieng", "description": "Homestay check-in", "type": "accommodation"},
                {"time": "19:00", "title": "Dinner", "description": "Warm local food", "type": "meal"}
            ],
            "accommodation": {"name": "Dieng Homestay", "type": "homestay", "price": 250000},
            "meals": ["breakfast", "lunch", "dinner"]
        },
        {
            "day": 5,
            "date": "2026-09-29",
            "title": "Dieng → Bekasi",
            "route": {"from": "Dieng", "to": "Bekasi", "distance_km": 350, "duration_hours": 10},
            "activities": [
                {"time": "06:00", "title": "Sunrise at Sikunir", "description": "Famous sunrise spot", "type": "attraction"},
                {"time": "08:00", "title": "Breakfast", "description": "Homestay breakfast", "type": "meal"},
                {"time": "09:00", "title": "Akar Akar", "description": "Photography spot", "type": "attraction"},
                {"time": "11:00", "title": "Depart Dieng", "description": "Start journey home", "type": "transport"},
                {"time": "13:00", "title": "Lunch in Purwokerto", "description": "Quick lunch", "type": "meal"},
                {"time": "18:00", "title": "Arrive Bekasi", "description": "Trip complete", "type": "transport"}
            ],
            "meals": ["breakfast", "lunch"]
        }
    ]
}


async def trace_pipeline(page):
    """Trace the complete import pipeline and report at each stage."""
    print("\n=== PIPELINE TRACE ===\n")
    
    # Stage 1: Raw JSON
    raw_json = json.dumps(BEKASI_DIENG_JSON)
    print(f"1. RAW JSON: {len(raw_json)} bytes")
    print(f"   Trip name: {BEKASI_DIENG_JSON['name']}")
    print(f"   Days in source: {len(BEKASI_DIENG_JSON['itinerary'])}")
    
    # Count total activities in source
    total_activities = sum(len(day.get('activities', [])) for day in BEKASI_DIENG_JSON['itinerary'])
    print(f"   Total activities in source: {total_activities}")
    for i, day in enumerate(BEKASI_DIENG_JSON['itinerary'], 1):
        print(f"   Day {i}: {len(day.get('activities', []))} activities")
    
    # Stage 2: Parse
    parse_result = await page.evaluate(f'''() => {{
        const parser = window.JSONImportParser;
        const result = parser.parse(`{raw_json}`);
        return {{
            valid: result.valid,
            errors: result.errors,
            canonical: result.canonical ? {{
                name: result.canonical.name,
                destination: result.canonical.destination,
                start: result.canonical.start,
                end: result.canonical.end,
                items_count: result.canonical.items ? result.canonical.items.length : 0,
                items: result.canonical.items ? result.canonical.items.map(i => ({{
                    title: i.title,
                    date: i.date,
                    dayNumber: i.dayNumber,
                    time: i.time
                }})).slice(0, 10) : []
            }} : null
        }};
    }}''')
    
    print(f"\n2. PARSED: valid={parse_result['valid']}")
    if parse_result['errors']:
        print(f"   Errors: {parse_result['errors']}")
    if parse_result['canonical']:
        c = parse_result['canonical']
        print(f"   Canonical name: {c['name']}")
        print(f"   Canonical items: {c['items_count']}")
        print(f"   First 10 items:")
        for item in c['items']:
            print(f"     - {item['title']} (day:{item['dayNumber']}, date:{item['date']})")
    
    return parse_result


async def main():
    print("=== FINAL IMPORT TRIP INTEGRATION TEST ===\n")
    print("Source: Bekasi → Ciwidey → Garut → Purwokerto → Dieng → Bekasi")
    print(f"Days in source: 5")
    print(f"Total activities in source: 30")
    
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

        # ===== LOGIN =====
        print("\n1. Logging in...")
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

        # ===== TRACE PIPELINE =====
        parse_result = await trace_pipeline(page)
        
        if parse_result['valid']:
            passed += 1
        else:
            failed += 1
            print("   FAIL: Parse failed")
        
        # Check canonical items count
        if parse_result['canonical'] and parse_result['canonical']['items_count'] >= 30:
            print(f"\n   OK Canonical has {parse_result['canonical']['items_count']} items (>= 30 expected)")
            passed += 1
        else:
            items_count = parse_result['canonical']['items_count'] if parse_result['canonical'] else 0
            print(f"\n   FAIL: Expected >= 30 items, got {items_count}")
            failed += 1
        
        # ===== IMPORT =====
        print("\n3. Importing trip...")
        await page.click('#importTripBtn')
        await page.wait_for_timeout(800)
        await page.fill('#importTextarea', json.dumps(BEKASI_DIENG_JSON))
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
        
        # Wait for sync
        await page.wait_for_timeout(3000)

        # ===== VERIFY UI =====
        print("\n4. Verifying UI state...")
        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(3000)

        trip_cards = await page.eval_on_selector_all(
            '[data-open]',
            'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))'
        )

        imported_trip = None
        for card in trip_cards:
            if 'Bekasi' in card['text'] and 'Dieng' in card['text']:
                imported_trip = card
                break

        if imported_trip:
            print(f"   OK Trip visible in UI")
            print(f"   Card text: {imported_trip['text'][:200]}")
            passed += 1
        else:
            print("   FAIL Trip not visible in UI")
            for c in trip_cards[:5]:
                print(f"     Found: {c['text'][:100]}")
            failed += 1

        # ===== VERIFY SERVER STATE =====
        print("\n5. Verifying server-side state...")
        server_result = await page.evaluate('''async () => {
            const res = await window.MarkiAPI.listPersonalTrips();
            if (res.error) return { ok: false, error: res.error.message };
            const trips = res.data || [];
            const matching = trips.filter(t => t.name && t.name.includes('Bekasi') && t.name.includes('Dieng'));
            if (matching.length === 0) return { ok: false, error: 'trip not found', trips: trips.length };
            const trip = matching[0];
            return {
                ok: true,
                server_id: trip.id,
                name: trip.name,
                items_count: trip.items ? trip.items.length : 0,
                items: trip.items ? trip.items.map(i => ({ title: i.title, date: i.date })).slice(0, 15) : []
            };
        }''')
        
        if server_result.get('ok'):
            print(f"   OK Server has trip: id={server_result['server_id'][:8]}...")
            print(f"   Items: {server_result['items_count']}")
            print(f"   First 15 items:")
            for item in server_result['items']:
                print(f"     - {item['title']} ({item['date']})")
            passed += 1
            
            if server_result['items_count'] >= 30:
                print(f"   OK Server has >= 30 items")
                passed += 1
            else:
                print(f"   FAIL: Expected >= 30 items, got {server_result['items_count']}")
                failed += 1
        else:
            print(f"   FAIL: {server_result.get('error')}")
            failed += 1

        # ===== OPEN AND VERIFY ITINERARY =====
        print("\n6. Opening trip and verifying itinerary...")
        trip_id = imported_trip['id']
        await page.evaluate("(id) => document.querySelector(`[data-open=\"${id}\"]`).click()", trip_id)
        await page.wait_for_timeout(3000)

        day_tabs = await page.eval_on_selector_all('.day-tab', 'els => els.map(e => e.textContent.trim())')
        print(f"   Day tabs: {day_tabs}")
        if len(day_tabs) >= 5:
            print(f"   OK Found {len(day_tabs)} day tabs")
            passed += 1
        else:
            print(f"   FAIL Expected 5 day tabs, got {len(day_tabs)}")
            failed += 1

        agenda_items = await page.eval_on_selector_all('.item-title', 'els => els.map(e => e.textContent.trim())')
        print(f"   Agenda items visible on day 1: {agenda_items}")
        if len(agenda_items) >= 5:
            print(f"   OK Found {len(agenda_items)} agenda items on day 1")
            passed += 1
        else:
            print(f"   FAIL Expected 5+ agenda items, got {len(agenda_items)}")
            failed += 1

        # ===== LIFECYCLE: NAVIGATE AWAY AND BACK =====
        print("\n7. Navigating away and back...")
        plan_tab = await page.query_selector('[data-nav="plan"]')
        if plan_tab:
            await plan_tab.click()
            await page.wait_for_timeout(2000)
        trip_tab = await page.query_selector('[data-nav="trip"]')
        if trip_tab:
            await trip_tab.click()
            await page.wait_for_timeout(3000)

        trip_cards2 = await page.eval_on_selector_all('[data-open]', 'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))')
        still_exists = any('Bekasi' in c['text'] and 'Dieng' in c['text'] for c in trip_cards2)
        if still_exists:
            print("   OK Trip persists after navigation")
            passed += 1
        else:
            print("   FAIL Trip lost after navigation")
            failed += 1

        # ===== LIFECYCLE: REFRESH =====
        print("\n8. Refreshing page...")
        await page.reload(wait_until='networkidle')
        await page.wait_for_timeout(8000)

        trip_cards3 = await page.eval_on_selector_all('[data-open]', 'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))')
        still_exists3 = any('Bekasi' in c['text'] and 'Dieng' in c['text'] for c in trip_cards3)
        if still_exists3:
            print("   OK Trip persists after page refresh")
            passed += 1
        else:
            print("   FAIL Trip lost after page refresh")
            failed += 1

        # ===== VERIFY SERVER STATE AFTER REFRESH =====
        print("\n9. Verifying server state after refresh...")
        server_result2 = await page.evaluate('''async () => {
            const res = await window.MarkiAPI.listPersonalTrips();
            if (res.error) return { ok: false, error: res.error.message };
            const trips = res.data || [];
            const matching = trips.filter(t => t.name && t.name.includes('Bekasi') && t.name.includes('Dieng'));
            if (matching.length === 0) return { ok: false, error: 'trip not found' };
            const trip = matching[0];
            return {
                ok: true,
                items_count: trip.items ? trip.items.length : 0,
                items: trip.items ? trip.items.map(i => ({ title: i.title, date: i.date })).slice(0, 10) : []
            };
        }''')
        
        if server_result2.get('ok') and server_result2['items_count'] >= 30:
            print(f"   OK Server has {server_result2['items_count']} items after refresh")
            passed += 1
        else:
            print(f"   FAIL: Server state lost after refresh")
            failed += 1

        # ===== LIFECYCLE: LOGOUT/LOGIN =====
        print("\n10. Logging out...")
        await page.click('#logoutBtn')
        await page.wait_for_timeout(5000)

        print("11. Logging in again...")
        await page.evaluate(login_js)
        await page.wait_for_timeout(8000)

        logged_in2 = await page.is_visible('#logoutBtn')
        if logged_in2:
            print("   OK Logged back in")
            passed += 1
        else:
            print("   FAIL Login failed")
            failed += 1

        # ===== VERIFY TRIP AFTER RE-LOGIN =====
        print("\n12. Verifying trip after logout/login...")
        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(5000)

        trip_cards4 = await page.eval_on_selector_all('[data-open]', 'els => els.map(e => ({ id: e.dataset.open, text: e.textContent }))')
        still_exists4 = any('Bekasi' in c['text'] and 'Dieng' in c['text'] for c in trip_cards4)
        if still_exists4:
            print("   OK Trip persists after logout/login")
            passed += 1
        else:
            print("   FAIL Trip lost after logout/login")
            failed += 1

        # ===== VERIFY SERVER STATE AFTER RE-LOGIN =====
        print("\n13. Verifying server state after re-login...")
        server_result3 = await page.evaluate("""async () => {
            const res = await window.MarkiAPI.listPersonalTrips();
            if (res.error) return { ok: false, error: res.error.message };
            const trips = res.data || [];
            const matching = trips.filter(t => t.name && t.name.includes('Bekasi') && t.name.includes('Dieng'));
            if (matching.length === 0) return { ok: false, error: 'trip not found' };
            const trip = matching[0];
            return {
                ok: true,
                items_count: trip.items ? trip.items.length : 0,
                items: trip.items ? trip.items.map(i => ({ title: i.title, date: i.date })) : []
            };
        }""")
        
        if server_result3.get('ok'):
            print(f"   OK Server has {server_result3['items_count']} items after re-login")
            print(f"   All items:")
            for item in server_result3['items']:
                print(f"     - {item['title']} ({item['date']})")
            passed += 1
            
            if server_result3['items_count'] >= 30:
                print(f"   OK All 30+ items preserved")
                passed += 1
            else:
                print(f"   FAIL: Expected >= 30 items, got {server_result3['items_count']}")
                failed += 1
        else:
            print(f"   FAIL: {server_result3.get('error')}")
            failed += 1

        # ===== OPEN AND VERIFY SAME ITINERARY =====
        print("\n14. Opening trip and verifying same itinerary after re-login...")
        for card in trip_cards4:
            if 'Bekasi' in card['text'] and 'Dieng' in card['text']:
                trip_id_re = card['id']
                await page.evaluate("(id) => document.querySelector(`[data-open=\"${id}\"]`).click()", trip_id_re)
                break
        await page.wait_for_timeout(3000)

        day_tabs2 = await page.eval_on_selector_all('.day-tab', 'els => els.map(e => e.textContent.trim())')
        if len(day_tabs2) >= 5:
            print(f"   OK Found {len(day_tabs2)} day tabs")
            passed += 1
        else:
            print(f"   FAIL Expected 5 day tabs, got {len(day_tabs2)}")
            failed += 1

        agenda_items2 = await page.eval_on_selector_all('.item-title', 'els => els.map(e => e.textContent.trim())')
        if len(agenda_items2) >= 5:
            print(f"   OK Found {len(agenda_items2)} agenda items on day 1")
            passed += 1
        else:
            print(f"   FAIL Expected 5+ agenda items, got {len(agenda_items2)}")
            failed += 1

        await browser.close()

        # ===== RESULTS =====
        print(f"\n=== FINAL RESULTS ===")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        
        if console_errors:
            print(f"\nConsole errors ({len(console_errors)}):")
            for e in console_errors[:10]:
                print(f"  {e}")

        if failed == 0:
            print("\n✅ ALL INTEGRATION CHECKS PASSED")
            print("The 5-day Bekasi-Dieng trip imports correctly with all 30 activities")
        else:
            print(f"\n❌ {failed} CHECK(S) FAILED")
        return 0 if failed == 0 else 1

asyncio.run(main())
