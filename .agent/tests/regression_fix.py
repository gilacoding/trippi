#!/usr/bin/env python3
"""Quick regression — verify fixes"""
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
    print("=== REGRESSION — Post Fix ===\n")
    
    owner_jwt = login(OWNER_EMAIL, OWNER_PASS)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=['--no-sandbox'])
        ctx = await browser.new_context()
        page = await ctx.new_page()
        
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        
        # Go to home
        await page.goto(BASE_URL, wait_until='networkidle')
        await page.wait_for_timeout(3000)
        
        # Check elements
        els = {
            "upcomingCount": "Upcoming count",
            "upcomingTrips": "Upcoming trips",
            "historyCount": "History count",
            "historyTrips": "History trips",
            "toGoList": "To Go List",
            "newTripBtn": "New trip button",
        }
        
        for eid, label in els.items():
            found = await page.evaluate(f'''() => !!document.getElementById("{eid}") ''')
            print(f"  {label}: {'✅' if found else '❌'}")
        
        print(f"\n  Page errors: {len(errors)}")
        for e in errors[:3]:
            print(f"    {e[:100]}")
        
        if not errors:
            print("\n  ✅ PASS — No JS errors")
        else:
            print("\n  ❌ FAIL — JS errors detected")
        
        await browser.close()
        print("\n=== COMPLETE ===")

asyncio.run(main())
