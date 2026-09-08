"""
Test: Changing trip dates must NOT delete itinerary items.
This test traces the complete date-change pipeline to find where items disappear.
"""
import asyncio, json, time
from playwright.async_api import async_playwright

URL = 'https://marki.cab/trip-planner.html'
EMAIL = 'e2e_test@markicab.com'
PASSWORD = 'HpWvkIplUIGYxD9L'

# 5-day Bekasi-Dieng travel plan
TRIP_JSON = {
    "title": "Bekasi → Ciwidey → Garut → Purwokerto → Dieng",
    "destination": "Jawa Tengah & Jawa Barat",
    "itinerary": [
        {
            "day": 1,
            "date": "2026-09-25",
            "activities": [
                {"name": "Depart Bekasi", "time": "06:00"},
                {"name": "Breakfast in Cianjur", "time": "08:30"},
                {"name": "Kawah Putih", "time": "14:00"},
                {"name": "Ranca Upas", "time": "16:30"},
                {"name": "Check-in Hotel", "time": "18:00"},
                {"name": "Dinner", "time": "19:30"}
            ]
        },
        {
            "day": 2,
            "date": "2026-09-26",
            "activities": [
                {"name": "Hotel Breakfast", "time": "08:00"},
                {"name": "Situ Bagendit", "time": "10:00"},
                {"name": "Curug Cikulu", "time": "13:00"},
                {"name": "Kebun Teh", "time": "15:30"},
                {"name": "Check-in Hotel", "time": "18:00"},
                {"name": "Dinner", "time": "19:30"}
            ]
        },
        {
            "day": 3,
            "date": "2026-09-27",
            "activities": [
                {"name": "Early Breakfast", "time": "07:00"},
                {"name": "Baturraden", "time": "09:30"},
                {"name": "Sungai Serayu", "time": "14:00"},
                {"name": "Curug Cikulu", "time": "16:00"},
                {"name": "Check-in Hotel", "time": "18:00"},
                {"name": "Dinner", "time": "19:30"}
            ]
        },
        {
            "day": 4,
            "date": "2026-09-28",
            "activities": [
                {"name": "Hotel Breakfast", "time": "08:00"},
                {"name": "Telaga Warna", "time": "10:00"},
                {"name": "Candi Arjuna", "time": "13:00"},
                {"name": "Sikidang Crater", "time": "15:00"},
                {"name": "Check-in Dieng", "time": "17:30"},
                {"name": "Dinner", "time": "19:30"},
                {"name": "Night Walk", "time": "21:00"}
            ]
        },
        {
            "day": 5,
            "date": "2026-09-29",
            "activities": [
                {"name": "Sunrise at Sikunir", "time": "04:30"},
                {"name": "Akar Akar", "time": "09:00"},
                {"name": "Depart Dieng", "time": "13:00"},
                {"name": "Lunch on the way", "time": "14:30"},
                {"name": "Arrive Bekasi", "time": "18:00"},
                {"name": "Trip Ends", "time": "18:30"}
            ]
        }
    ]
}


async def login(page):
    """Login to Markicab."""
    print("\n1. Logging in...")
    await page.goto(URL, wait_until='networkidle')
    
    # Wait for auth modal to appear
    await page.wait_for_selector('#authEmail', timeout=10000)
    await page.fill('#authEmail', EMAIL)
    await page.fill('#authPassword', PASSWORD)
    await page.click('#authSubmit')
    
    # Wait for home view (auth modal should close automatically)
    await page.wait_for_selector('#homeView', timeout=15000)
    
    # If auth modal is still visible, close it manually
    auth_modal_visible = await page.evaluate('''() => {
        const modal = document.getElementById('authModal');
        return modal && modal.style.display === 'flex';
    }''')
    
    if auth_modal_visible:
        print("   Closing auth modal manually...")
        await page.evaluate('closeAuth()')
        await page.wait_for_timeout(500)
    
    print("   Login OK")


async def import_trip(page):
    """Import the trip JSON."""
    print("\n2. Importing trip...")
    await page.click('#importTripBtn')
    await page.wait_for_selector('#importModal', state='visible', timeout=5000)
    await page.fill('#importTextarea', json.dumps(TRIP_JSON, ensure_ascii=False))
    await page.click('#importSubmit')
    await page.wait_for_timeout(3000)
    print("   Import submitted")


async def verify_items_in_ui(page, expected_count, label):
    """Verify items are visible in the UI."""
    print(f"\n{label}: Verifying {expected_count} items in UI...")
    
    # Get trip info from UI
    trip_info = await page.evaluate('''() => {
        const placeTotal = document.querySelector('#placeTotal');
        const dayTotal = document.querySelector('#dayTotal');
        return {
            placeTotal: placeTotal ? placeTotal.textContent : 'N/A',
            dayTotal: dayTotal ? dayTotal.textContent : 'N/A'
        };
    }''')
    print(f"   UI shows: placeTotal={trip_info['placeTotal']}, dayTotal={trip_info['dayTotal']}")
    
    # Count items across all days
    total_items = 0
    day_tabs = await page.query_selector_all('.day-tab')
    for i, tab in enumerate(day_tabs):
        await tab.click()
        await page.wait_for_timeout(500)
        items = await page.query_selector_all('#itineraryList .item')
        total_items += len(items)
        print(f"   Day {i+1}: {len(items)} items")
    
    print(f"   Total items across all days: {total_items}")
    return total_items


async def edit_trip_dates(page, new_start, new_end):
    """Edit trip dates."""
    print(f"\nEditing trip dates to {new_start} - {new_end}...")
    
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


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        
        console_errors = []
        page.on('console', lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type == 'error' else None)
        
        try:
            # Step 1: Login
            await login(page)
            
            # Step 2: Import trip
            await import_trip(page)
            
            # Step 3: Verify items in UI
            initial_count = await verify_items_in_ui(page, 35, "3. After import")
            
            # Step 4: Edit trip dates (extend by 2 days)
            await edit_trip_dates(page, '2026-09-25', '2026-10-01')
            
            # Step 5: Verify items still in UI
            after_edit_count = await verify_items_in_ui(page, 35, "5. After date edit")
            
            # Step 6: Hard refresh
            print("\n6. Hard refreshing...")
            await page.reload(wait_until='networkidle')
            await page.wait_for_timeout(2000)
            
            # Step 7: Verify items still in UI after refresh
            after_refresh_count = await verify_items_in_ui(page, 35, "7. After refresh")
            
            # Summary
            print("\n" + "="*60)
            print("SUMMARY")
            print("="*60)
            print(f"Initial items: {initial_count}")
            print(f"After date edit: {after_edit_count}")
            print(f"After refresh: {after_refresh_count}")
            
            if after_edit_count == 0:
                print("\nBUG CONFIRMED: Items disappeared after date edit!")
            elif after_edit_count < initial_count:
                print(f"\nBUG: Some items lost after date edit ({initial_count - after_edit_count} items)")
            else:
                print("\nOK: All items preserved after date edit")
            
            if after_refresh_count == 0:
                print("BUG CONFIRMED: Items disappeared after refresh!")
            elif after_refresh_count < initial_count:
                print(f"BUG: Some items lost after refresh ({initial_count - after_refresh_count} items)")
            else:
                print("OK: All items preserved after refresh")
            
            if console_errors:
                print(f"\nConsole errors ({len(console_errors)}):")
                for err in console_errors[:10]:
                    print(f"  {err}")
            
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
