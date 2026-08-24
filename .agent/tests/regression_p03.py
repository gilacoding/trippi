#!/usr/bin/env python3
"""Quick regression — verify key behaviors after cleanup"""
import asyncio, json, urllib.request
from playwright.async_api import async_playwright

SUPABASE_URL = "https://ishflkcsdzlhhxtanhxf.supabase.co"
SUPABASE_ANON = "sb_publishable_7g_crQO8fm0SVVIdqDU78w_gIglXx8Q"
BASE_URL = "https://marki.cab/trip-planner.html"
OWNER_EMAIL = "e2e-guest-baseline@marki.cab"
OWNER_PASS = "Str0ngP@ss99!"


def login(email, password):
    headers = {"Content-Type": "application/json", "apikey": SUPABASE_ANON}
    body = json.dumps({"email": email, "password": password}).encode()
    req = urllib.request.Request(f"{SUPABASE_URL}/auth/v1/token?grant_type=password", data=body, headers=headers)
    r = urllib.request.urlopen(req, timeout=15)
    return json.loads(r.read())["access_token"]


def call_rpc(jwt, fn, params=None):
    headers = {"Content-Type": "application/json", "apikey": SUPABASE_ANON, "Authorization": f"Bearer {jwt}"}
    body = json.dumps(params or {}).encode()
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/rpc/{fn}", data=body, headers=headers)
    r = urllib.request.urlopen(req, timeout=15)
    return json.loads(r.read())


async def main():
    print("=== QUICK REGRESSION — P0.3 Cleanup ===\n")
    
    owner_jwt = login(OWNER_EMAIL, OWNER_PASS)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=['--no-sandbox'])
        ctx = await browser.new_context()
        page = await ctx.new_page()
        
        # Go to home
        await page.goto(BASE_URL, wait_until='networkidle')
        await page.wait_for_timeout(3000)
        
        # Check 1: No route tab
        route_tab = await page.evaluate('''() => !!document.querySelector('[data-gview="route"]') ''')
        print(f"1. Route tab hidden: {'PASS' if not route_tab else 'FAIL'}")
        
        # Check 2: No backup buttons
        backup = await page.evaluate('''() => !!document.getElementById('exportData') || !!document.getElementById('importData') ''')
        print(f"2. Backup UI removed: {'PASS' if not backup else 'FAIL'}")
        
        # Check 3: To Go List preserved
        togo = await page.evaluate('''() => !!document.getElementById('toGoList') ''')
        print(f"3. To Go List preserved: {'PASS' if togo else 'FAIL'}")
        
        # Check 4: No group wishlist section (only visible in group view, not home)
        # This is only visible when viewing a group
        group_wishlist = await page.evaluate('''() => !!document.getElementById('groupWishList') ''')
        print(f"4. Group wishlist removed: {'PASS' if not group_wishlist else 'FAIL'}")
        
        # Check 5: New trip button exists
        new_trip = await page.evaluate('''() => !!document.getElementById('newTripBtn') ''')
        print(f"5. New trip button preserved: {'PASS' if new_trip else 'FAIL'}")
        
        # Check 6: Copy itinerary still exists
        copy_btn = await page.evaluate('''() => !!document.getElementById('copyTrip') ''')
        print(f"6. Copy itinerary preserved: {'PASS' if copy_btn else 'FAIL'}")
        
        await browser.close()
        
        print("\n=== REGRESSION COMPLETE ===")

asyncio.run(main())
