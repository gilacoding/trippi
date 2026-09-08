"""
Regression test: Verify that editing trip dates preserves itinerary.
Tests: change start date, change end date, extend trip, shorten trip.
"""
import asyncio, json, time
from playwright.async_api import async_playwright

URL = 'https://marki.cab/trip-planner.html'
EMAIL = 'e2e_test@markicab.com'
PASSWORD = 'HpWvkIplUIGYxD9L'

TRIP_JSON = {
    "title": "Test Trip Date Edit",
    "destination": "Test Destination",
    "itinerary": [
        {"day": 1, "date": "2026-10-01", "activities": [
            {"name": "Activity 1", "time": "08:00"},
            {"name": "Activity 2", "time": "10:00"}
        ]},
        {"day": 2, "date": "2026-10-02", "activities": [
            {"name": "Activity 3", "time": "09:00"},
            {"name": "Activity 4", "time": "14:00"}
        ]},
        {"day": 3, "date": "2026-10-03", "activities": [
            {"name": "Activity 5", "time": "07:00"}
        ]}
    ]
}

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
    await page.wait_for_selector('#authEmail', timeout=10000)
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
    """Get total items count across all days."""
    count = await page.evaluate('''() => {
        const trip = (function(){
            const activeTripId = window.state?.activeTripId;
            const trips = window.state?.trips || [];
            return trips.find(t => t.id === activeTripId);
        })();
        return trip?.items?.length || 0;
    }''')
    return count


async def get_ui_place_total(page):
    """Get placeTotal from UI."""
    text = await page.evaluate('''() => {
        const el = document.querySelector('#placeTotal');
        return el ? el.textContent : 'N/A';
    }''')
    return text


async def open_first_trip(page):
    """Open the first trip card."""
    print("\n   Opening first trip...")
    await page.click('.trip-card')
    await page.wait_for_selector('#plannerView', state='visible', timeout=5000)
    await page.wait_for_timeout(1000)


async def edit_trip_dates(page, new_start, new_end):
    """Edit trip dates."""
    print(f"\n3. Editing trip dates to {new_start} - {new_end}...")
    
    # Click edit trip button
    await page.click('#editTripBtn')
    await page.wait_for_selector('#newTripView', state='visible', timeout=5000)
    
    # Clear and set new dates
    await page.fill('#tripStart', new_start)
    await page.fill('#tripEnd', new_end)
    
    # Submit
    await page.click('#newTripSubmit')
    await page.wait_for_timeout(2000)
    print("   Date edit submitted")


async def test_change_start_date(page):
    """Test: Change start date should preserve items."""
    print("\n=== TEST: Change Start Date ===")
    
    # Get initial count
    initial_count = await get_trip_items_count(page)
    print(f"   Initial items: {initial_count}")
    
    # Change start date (move forward by 1 day)
    await edit_trip_dates(page, '2026-10-02', '2026-10-03')
    
    # Get count after edit
    after_count = await get_trip_items_count(page)
    print(f"   After date edit: {after_count}")
    
    # Verify
    if after_count >= initial_count:
        print("   ✓ PASS: Items preserved after start date change")
        return True
    else:
        print(f"   ✗ FAIL: Items lost ({initial_count} → {after_count})")
        return False


async def test_change_end_date(page):
    """Test: Change end date should preserve items."""
    print("\n=== TEST: Change End Date ===")
    
    # Get initial count
    initial_count = await get_trip_items_count(page)
    print(f"   Initial items: {initial_count}")
    
    # Change end date (extend by 2 days)
    await edit_trip_dates(page, '2026-10-02', '2026-10-05')
    
    # Get count after edit
    after_count = await get_trip_items_count(page)
    print(f"   After date edit: {after_count}")
    
    # Verify
    if after_count >= initial_count:
        print("   ✓ PASS: Items preserved after end date change")
        return True
    else:
        print(f"   ✗ FAIL: Items lost ({initial_count} → {after_count})")
        return False


async def test_extend_trip(page):
    """Test: Extend trip should preserve items and add empty days."""
    print("\n=== TEST: Extend Trip ===")
    
    # Get initial count
    initial_count = await get_trip_items_count(page)
    print(f"   Initial items: {initial_count}")
    
    # Extend trip (add 3 days)
    await edit_trip_dates(page, '2026-10-02', '2026-10-08')
    
    # Get count after edit
    after_count = await get_trip_items_count(page)
    print(f"   After extend: {after_count}")
    
    # Verify
    if after_count >= initial_count:
        print("   ✓ PASS: Items preserved after extend")
        return True
    else:
        print(f"   ✗ FAIL: Items lost ({initial_count} → {after_count})")
        return False


async def test_shorten_trip(page):
    """Test: Shorten trip should preserve items."""
    print("\n=== TEST: Shorten Trip ===")
    
    # Get initial count
    initial_count = await get_trip_items_count(page)
    print(f"   Initial items: {initial_count}")
    
    # Shorten trip (remove last day)
    await edit_trip_dates(page, '2026-10-02', '2026-10-04')
    
    # Get count after edit
    after_count = await get_trip_items_count(page)
    print(f"   After shorten: {after_count}")
    
    # Verify - items should be preserved even if outside visible range
    if after_count >= initial_count:
        print("   ✓ PASS: Items preserved after shorten")
        return True
    else:
        print(f"   ✗ FAIL: Items lost ({initial_count} → {after_count})")
        return False


async def test_refresh_after_date_edit(page):
    """Test: Items should persist after refresh following date edit."""
    print("\n=== TEST: Refresh After Date Edit ===")
    
    # Get initial count
    initial_count = await get_trip_items_count(page)
    print(f"   Initial items: {initial_count}")
    
    # Change dates
    await edit_trip_dates(page, '2026-10-03', '2026-10-06')
    
    # Refresh
    print("   Refreshing...")
    await page.reload(wait_until='networkidle')
    await page.wait_for_timeout(2000)
    
    # Re-login if needed
    try:
        logged_in = await page.evaluate('''() => {
            const homeView = document.getElementById('homeView');
            return homeView && homeView.classList.contains('active');
        }''')
        if not logged_in:
            await page.wait_for_selector('#authEmail', timeout=5000)
            await page.fill('#authEmail', EMAIL)
            await page.fill('#authPassword', PASSWORD)
            await page.click('#authSubmit')
            await page.wait_for_selector('#homeView', timeout=15000)
    except:
        pass
    
    # Open the trip again
    await open_first_trip(page)
    
    # Get count after refresh
    after_count = await get_trip_items_count(page)
    print(f"   After refresh: {after_count}")
    
    # Verify
    if after_count >= initial_count:
        print("   ✓ PASS: Items preserved after refresh")
        return True
    else:
        print(f"   ✗ FAIL: Items lost ({initial_count} → {after_count})")
        return False


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        
        results = []
        
        try:
            # Step 1: Login
            await login(page)
            
            # Step 2: Import trip
            await import_trip(page)
            
            # Step 3: Open the imported trip
            await open_first_trip(page)
            
            # Run tests
            results.append(await test_change_start_date(page))
            results.append(await test_change_end_date(page))
            results.append(await test_extend_trip(page))
            results.append(await test_shorten_trip(page))
            results.append(await test_refresh_after_date_edit(page))
            
            # Summary
            print("\n" + "="*60)
            print("TEST RESULTS")
            print("="*60)
            passed = sum(results)
            total = len(results)
            print(f"Passed: {passed}/{total}")
            
            if all(results):
                print("\n✓ ALL TESTS PASSED")
            else:
                print("\n✗ SOME TESTS FAILED")
            
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
