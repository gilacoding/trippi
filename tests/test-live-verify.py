"""
Live verification test for date-edit bug fix.
Uses WebMCP to test marki.cab directly.
"""
import asyncio, json, time
from playwright.async_api import async_playwright

URL = 'https://marki.cab/trip-planner.html'
EMAIL = 'e2e_test@markicab.com'
PASSWORD = 'HpWvkIplUIGYxD9L'

TRIP_JSON = {
    "title": "Date Edit Test Trip",
    "destination": "Test Destination",
    "itinerary": [
        {"day": 1, "date": "2026-10-01", "activities": [
            {"name": "Activity A", "time": "08:00"},
            {"name": "Activity B", "time": "10:00"},
            {"name": "Activity C", "time": "14:00"}
        ]},
        {"day": 2, "date": "2026-10-02", "activities": [
            {"name": "Activity D", "time": "09:00"},
            {"name": "Activity E", "time": "13:00"}
        ]},
        {"day": 3, "date": "2026-10-03", "activities": [
            {"name": "Activity F", "time": "07:00"},
            {"name": "Activity G", "time": "12:00"},
            {"name": "Activity H", "time": "16:00"}
        ]}
    ]
}


async def wait_for_auth_modal(page, timeout=15000):
    """Wait for auth modal to appear."""
    start = time.time()
    while time.time() - start < timeout:
        visible = await page.evaluate('''() => {
            const modal = document.getElementById('authModal');
            return modal && modal.style.display === 'flex';
        }''')
        if visible:
            return True
        await page.wait_for_timeout(500)
    return False


async def login(page):
    """Login to Markicab."""
    print("\n1. Logging in...")
    await page.goto(URL, wait_until='networkidle')
    
    # Check if already logged in
    logged_in = await page.evaluate('''() => {
        const homeView = document.getElementById('homeView');
        return homeView && homeView.classList.contains('active');
    }''')
    
    if logged_in:
        print("   Already logged in")
        return
    
    # Wait for auth modal
    auth_visible = await wait_for_auth_modal(page)
    if not auth_visible:
        print("   ERROR: Auth modal did not appear")
        raise Exception("Auth modal not visible")
    
    await page.fill('#authEmail', EMAIL)
    await page.fill('#authPassword', PASSWORD)
    await page.click('#authSubmit')
    await page.wait_for_selector('#homeView', timeout=15000)
    print("   Login OK")


async def import_trip(page):
    """Import the trip JSON."""
    print("\n2. Importing trip...")
    
    # Navigate to home view
    await page.evaluate('''() => {
        if(typeof renderHome === 'function') renderHome();
        if(typeof show === 'function') show('homeView');
    }''')
    await page.wait_for_timeout(1000)
    
    # Click import button
    await page.click('#importTripBtn')
    await page.wait_for_selector('#importModal', state='visible', timeout=5000)
    await page.fill('#importTextarea', json.dumps(TRIP_JSON, ensure_ascii=False))
    await page.click('#importSubmit')
    await page.wait_for_timeout(3000)
    print("   Import submitted")


async def get_trip_items_count(page):
    """Get total items count from trip object."""
    count = await page.evaluate('''() => {
        const trip = (function(){
            const activeTripId = window.state?.activeTripId;
            const trips = window.state?.trips || [];
            return trips.find(t => t.id === activeTripId);
        })();
        return trip?.items?.length || 0;
    }''')
    return count


async def open_first_trip(page):
    """Open the first trip card."""
    print("\n   Opening first trip...")
    await page.click('.trip-card')
    await page.wait_for_selector('#plannerView', state='visible', timeout=5000)
    await page.wait_for_timeout(1000)


async def edit_trip_dates(page, new_start, new_end):
    """Edit trip dates."""
    print(f"\n3. Editing trip dates to {new_start} - {new_end}...")
    
    await page.click('#editTripBtn')
    await page.wait_for_selector('#newTripView', state='visible', timeout=5000)
    await page.fill('#tripStart', new_start)
    await page.fill('#tripEnd', new_end)
    await page.click('#newTripSubmit')
    await page.wait_for_timeout(2000)
    print("   Date edit submitted")


async def verify_no_console_errors(page):
    """Check for console errors."""
    errors = await page.evaluate('''() => {
        return window._consoleErrors || [];
    }''')
    return errors


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        
        # Capture console errors
        console_errors = []
        page.on('console', lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type == 'error' else None)
        
        try:
            # Step 1: Login
            await login(page)
            
            # Step 2: Import trip
            await import_trip(page)
            
            # Step 3: Open the imported trip
            await open_first_trip(page)
            
            # Step 4: Get initial item count
            initial_count = await get_trip_items_count(page)
            print(f"\n4. Initial items: {initial_count}")
            
            # Step 5: Edit start date (move forward by 1 day)
            await edit_trip_dates(page, '2026-10-02', '2026-10-03')
            after_edit_count = await get_trip_items_count(page)
            print(f"\n5. After date edit: {after_edit_count}")
            
            # Step 6: Refresh and verify
            print("\n6. Refreshing...")
            await page.reload(wait_until='networkidle')
            await page.wait_for_timeout(2000)
            
            # Re-login if needed
            logged_in = await page.evaluate('''() => {
                const homeView = document.getElementById('homeView');
                return homeView && homeView.classList.contains('active');
            }''')
            if not logged_in:
                auth_visible = await wait_for_auth_modal(page)
                if auth_visible:
                    await page.fill('#authEmail', EMAIL)
                    await page.fill('#authPassword', PASSWORD)
                    await page.click('#authSubmit')
                    await page.wait_for_selector('#homeView', timeout=15000)
            
            # Open the trip again
            await open_first_trip(page)
            after_refresh_count = await get_trip_items_count(page)
            print(f"\n7. After refresh: {after_refresh_count}")
            
            # Summary
            print("\n" + "="*60)
            print("TEST RESULTS")
            print("="*60)
            print(f"Initial items: {initial_count}")
            print(f"After date edit: {after_edit_count}")
            print(f"After refresh: {after_refresh_count}")
            
            if after_edit_count == 0:
                print("\n✗ FAIL: Items disappeared after date edit!")
            elif after_edit_count < initial_count:
                print(f"\n✗ FAIL: Some items lost ({initial_count} → {after_edit_count})")
            else:
                print("\n✓ PASS: All items preserved after date edit")
            
            if after_refresh_count == 0:
                print("✗ FAIL: Items disappeared after refresh!")
            elif after_refresh_count < initial_count:
                print(f"✗ FAIL: Some items lost after refresh ({initial_count} → {after_refresh_count})")
            else:
                print("✓ PASS: All items preserved after refresh")
            
            # Check console errors
            if console_errors:
                print(f"\nConsole errors ({len(console_errors)}):")
                for err in console_errors:
                    print(f"  {err}")
            else:
                print("\n✓ No console errors")
            
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
