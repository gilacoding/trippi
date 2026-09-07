"""
Final Import Trip Integration Test
Tests the complete pipeline for the 5-day Bekasi-Dieng travel JSON.
"""
import asyncio, json, time
from playwright.async_api import async_playwright

URL = 'https://marki.cab/trip-planner.html'
EMAIL = 'e2e-import-final@marki.cab'
PASSWORD = 'marki123456'

BEKASI_DIENG_JSON = {
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


async def main():
    print("=== FINAL IMPORT TRIP INTEGRATION TEST ===\n")
    print("Source: Bekasi → Ciwidey → Garut → Purwokerto → Dieng")
    print("Days in source: 5")
    print("Total activities in source: 17")

    passed = 0
    failed = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        console_errors = []
        page.on('console', lambda msg: console_errors.append(f"[{msg.type}] {msg.text}"[:200]) if msg.type == 'error' else None)
        page.on('pageerror', lambda err: console_errors.append(f"[pageerror] {err}"[:200]))

        # Login
        print("\n1. Logging in...")
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

        # Trace pipeline
        print("\n2. Tracing pipeline...")
        raw_json = json.dumps(BEKASI_DIENG_JSON)
        
        trace = await page.evaluate(f'''() => {{
            const parser = window.JSONImportParser;
            const res = parser.parse(`{raw_json}`);
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
                    }})).slice(0, 20) : []
                }} : null
            }};
        }}''')
        
        if trace['valid']:
            print(f"  OK Parsed: {trace['canonical']['items_count']} items")
            passed += 1
        else:
            print(f"  FAIL: Parse failed")
            failed += 1
        
        if trace['canonical']:
            c = trace['canonical']
            print(f"  Name: {c['name']}")
            print(f"  Destination: {c['destination']}")
            print(f"  Start: {c['start']}")
            print(f"  End: {c['end']}")
            print(f"  Items: {c['items_count']}")
            for item in c['items']:
                print(f"    - {item['title']} (day:{item['dayNumber']}, date:{item['date']}, time:{item['time']})")
            
            if c['items_count'] >= 17:
                print(f"  OK: >= 17 items")
                passed += 1
            else:
                print(f"  FAIL: Expected >= 17 items")
                failed += 1

        # Import using evaluate (bypasses confirm dialog)
        print("\n3. Importing trip...")
        import_result = await page.evaluate('''() => {
            const textarea = document.getElementById('importTextarea');
            textarea.value = `''' + raw_json + '''`;
            
            const parser = window.JSONImportParser;
            const res = parser.parse(textarea.value);
            if (!res.valid || !res.canonical) return { ok: false, error: 'parse failed' };
            
            const canonical = res.canonical;
            MarkicabCanonicalAdapter.setContext({
                state: state,
                colState: colState,
                API: MarkiAPI,
                save: save,
                syncTrip: syncTrip,
                ensureAuth: ensureAuth,
                openTrip: openTrip,
                openGroup: openGroup,
                renderHome: renderHome,
                normalizeLink: normalizeLink,
                log: dbg,
                warn: function(msg){console.warn('[import]',msg);}
            });
            
            MarkicabCanonicalAdapter.ingestAndOpen(canonical).then(function() {
                document.getElementById('importModal').style.display = 'none';
            }).catch(function(e) {
                console.error('[import] failed', e);
            });
            
            return { ok: true, items: canonical.items ? canonical.items.length : 0 };
        }''')
        
        if import_result.get('ok'):
            print(f"  OK: Import initiated with {import_result.get('items', 0)} items")
            passed += 1
        else:
            print(f"  FAIL: {import_result.get('error')}")
            failed += 1
        
        await page.wait_for_timeout(5000)

        # Verify server state
        print("\n4. Verifying server state...")
        server_result = await page.evaluate('''async () => {
            const res = await window.MarkiAPI.listPersonalTrips();
            if (res.error) return { ok: false, error: res.error.message };
            const trips = res.data || [];
            const matching = trips.filter(t => t.name && t.name.includes('Bekasi') && t.name.includes('Dieng'));
            if (matching.length === 0) return { ok: false, error: 'not found', total: trips.length };
            const trip = matching[0];
            return {
                ok: true,
                server_id: trip.id,
                name: trip.name,
                items_count: trip.items ? trip.items.length : 0,
                items: trip.items ? trip.items.map(i => ({ title: i.title, date: i.date })) : []
            };
        }''')
        
        if server_result.get('ok'):
            print(f"  OK: Server has trip with {server_result['items_count']} items")
            passed += 1
            
            if server_result['items_count'] >= 17:
                print(f"  OK: >= 17 items persisted")
                passed += 1
            else:
                print(f"  FAIL: Expected >= 17 items")
                failed += 1
        else:
            print(f"  FAIL: {server_result.get('error')}")
            failed += 1

        # Verify UI
        print("\n5. Verifying UI state...")
        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(3000)
        
        trip_cards = await page.eval_on_selector_all('[data-open]', 'els => els.map(e => e.textContent)')
        found = any('Bekasi' in c and 'Dieng' in c for c in trip_cards)
        if found:
            print("  OK: Trip visible in UI")
            passed += 1
        else:
            print("  FAIL: Trip not visible")
            failed += 1

        # Open trip and verify itinerary
        print("\n6. Opening trip and verifying itinerary...")
        await page.evaluate('''() => {
            const cards = document.querySelectorAll('[data-open]');
            for (const card of cards) {
                if (card.textContent.includes('Bekasi') && card.textContent.includes('Dieng')) {
                    card.click();
                    return true;
                }
            }
            return false;
        }''')
        await page.wait_for_timeout(3000)
        
        day_tabs = await page.eval_on_selector_all('.day-tab', 'els => els.map(e => e.textContent.trim())')
        print(f"  Day tabs: {day_tabs}")
        if len(day_tabs) >= 5:
            print(f"  OK: {len(day_tabs)} day tabs")
            passed += 1
        else:
            print(f"  FAIL: Expected 5 day tabs")
            failed += 1
        
        agenda_items = await page.eval_on_selector_all('.item-title', 'els => els.map(e => e.textContent.trim())')
        print(f"  Agenda items: {agenda_items}")
        if len(agenda_items) >= 3:
            print(f"  OK: {len(agenda_items)} items on day 1")
            passed += 1
        else:
            print(f"  FAIL: Expected 3+ items")
            failed += 1

        # Lifecycle: Navigate away and back
        print("\n7. Navigating away and back...")
        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(2000)
        
        trip_cards2 = await page.eval_on_selector_all('[data-open]', 'els => els.map(e => e.textContent)')
        found2 = any('Bekasi' in c and 'Dieng' in c for c in trip_cards2)
        if found2:
            print("  OK: Trip persists after navigation")
            passed += 1
        else:
            print("  FAIL: Trip lost after navigation")
            failed += 1

        # Lifecycle: Refresh
        print("\n8. Refreshing page...")
        await page.reload(wait_until='networkidle')
        await page.wait_for_timeout(8000)
        
        trip_cards3 = await page.eval_on_selector_all('[data-open]', 'els => els.map(e => e.textContent)')
        found3 = any('Bekasi' in c and 'Dieng' in c for c in trip_cards3)
        if found3:
            print("  OK: Trip persists after refresh")
            passed += 1
        else:
            print("  FAIL: Trip lost after refresh")
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
            print(f"  OK: Server has {server_after_refresh['items_count']} items after refresh")
            passed += 1
        else:
            print(f"  FAIL: Server state lost after refresh")
            failed += 1

        # Lifecycle: Logout/Login
        print("\n9. Logging out...")
        await page.click('#logoutBtn')
        await page.wait_for_timeout(5000)
        
        print("10. Logging in again...")
        await page.evaluate(login_js)
        await page.wait_for_timeout(8000)
        
        logged_in2 = await page.is_visible('#logoutBtn')
        if logged_in2:
            print("  OK: Logged back in")
            passed += 1
        else:
            print("  FAIL: Login failed")
            failed += 1
        
        # Verify trip after re-login
        print("\n11. Verifying trip after logout/login...")
        await page.evaluate('show("homeView")')
        await page.wait_for_timeout(5000)
        
        trip_cards4 = await page.eval_on_selector_all('[data-open]', 'els => els.map(e => e.textContent)')
        found4 = any('Bekasi' in c and 'Dieng' in c for c in trip_cards4)
        if found4:
            print("  OK: Trip persists after logout/login")
            passed += 1
        else:
            print("  FAIL: Trip lost after logout/login")
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
            print(f"  OK: Server has {server_after_relogin['items_count']} items after re-login")
            print(f"  Titles: {server_after_relogin['titles'][:10]}")
            passed += 1
        else:
            print(f"  FAIL: Server state lost after re-login")
            failed += 1

        await browser.close()

        # Results
        print(f"\n=== FINAL RESULTS ===")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")

        if console_errors:
            print(f"\nConsole errors ({len(console_errors)}):")
            for e in console_errors[:5]:
                print(f"  {e}")

        if failed == 0:
            print("\n✅ ALL INTEGRATION CHECKS PASSED")
        else:
            print(f"\n❌ {failed} CHECK(S) FAILED")
        return 0 if failed == 0 else 1

asyncio.run(main())
