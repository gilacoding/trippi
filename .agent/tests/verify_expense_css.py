#!/usr/bin/env python3
"""Focused Playwright verification for expense cards V2 CSS upgrade."""
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

async def main():
    print("=== EXPENSE CARDS V2 CSS VERIFICATION ===\n")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=['--no-sandbox'])
        ctx = await browser.new_context()
        page = await ctx.new_page()
        
        errors = []
        failed_requests = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(f"CONSOLE: {m.text}") if m.type == 'error' else None)
        page.on('requestfailed', lambda r: failed_requests.append(r.url))
        
        # 1. Home loads
        await page.goto(BASE_URL, wait_until='networkidle')
        await page.wait_for_timeout(2000)
        home_ok = await page.evaluate("(function(){ return !!document.getElementById('upcomingTrips'); })")
        print(f"1. Home loads: {'PASS' if home_ok else 'FAIL'}")
        
        # 2. Login
        await page.click('button:has-text("Masuk")', timeout=5000)
        await page.wait_for_timeout(1000)
        await page.fill('input[type="email"]', OWNER_EMAIL)
        await page.fill('input[type="password"]', OWNER_PASS)
        await page.click('#authModal button:has-text("Masuk")', timeout=5000)
        await page.wait_for_timeout(3000)
        
        # 3. Create trip
        await page.click('#newTripBtn', timeout=5000)
        await page.wait_for_timeout(1500)
        await page.fill('#tripName', 'Expense Test Trip')
        await page.fill('#tripDestination', 'Bali')
        await page.fill('#tripStart', '2026-09-01')
        await page.fill('#tripEnd', '2026-09-03')
        await page.click('#newTripSubmit', timeout=5000)
        await page.wait_for_timeout(4000)
        
        # 4. Group view opens
        groupview_ok = await page.evaluate("(function(){ var gv = document.getElementById('groupView'); return gv && gv.offsetParent !== null; })")
        print(f"2. Group view opens: {'PASS' if groupview_ok else 'FAIL'}")
        
        # Navigate to Expenses tab
        await page.click('.view-tab[data-gview="expenses"]', timeout=5000)
        await page.wait_for_timeout(1500)
        
        # 5. Open add expense panel and add expense
        await page.evaluate("(function(){ var panel = document.getElementById('groupExpenseForm'); if (panel) panel.parentElement.open = true; })")
        await page.wait_for_timeout(500)
        await page.fill('#groupExpenseName', 'Makan Malam')
        await page.fill('#groupExpenseAmount', '150000')
        await page.select_option('#groupExpenseCategory', 'Makan')
        await page.click('#groupExpenseForm button[type="submit"]', timeout=5000)
        await page.wait_for_timeout(2000)
        
        # 6. Verify expense item styling
        expense_style = await page.evaluate("(function(){ var item = document.querySelector('#groupView .expense-item'); if (!item) return null; var icon = item.querySelector('.expense-icon'); var name = item.querySelector('.expense-name'); var amount = item.querySelector('.expense-amount'); return { itemExists: true, iconSize: icon ? window.getComputedStyle(icon).width : null, nameFont: name ? window.getComputedStyle(name).fontFamily : null, amountFont: amount ? window.getComputedStyle(amount).fontFamily : null, borderRadius: window.getComputedStyle(item).borderRadius }; })")
        print(f"3. Expense item rendered: {'PASS' if expense_style else 'FAIL'}")
        if expense_style:
            print(f"   - Icon width: {expense_style['iconSize']} (expected: 40px)")
            print(f"   - Name font: {expense_style['nameFont']}")
            print(f"   - Amount font: {expense_style['amountFont']}")
            print(f"   - Border radius: {expense_style['borderRadius']}")
        
        # 7. Persistence after refresh
        await page.reload(wait_until='networkidle')
        await page.wait_for_timeout(2000)
        await page.click('.view-tab[data-gview="expenses"]', timeout=5000)
        await page.wait_for_timeout(1000)
        expense_after_refresh = await page.evaluate("(function(){ return document.querySelectorAll('#groupView .expense-item').length; })")
        print(f"4. Persistence after refresh: {'PASS' if expense_after_refresh > 0 else 'FAIL'} (count: {expense_after_refresh})")
        
        # 8. Clean console - show all error types for analysis
        print(f"5. Console analysis:")
        print(f"   Total console errors: {len([e for e in errors if 'CONSOLE:' in e])}")
        print(f"   Total failed requests: {len(failed_requests)}")
        print(f"   Total page errors: {len([e for e in errors if 'CONSOLE:' not in e])}")
        
        # Categorize errors
        resource_errors = [e for e in errors if 'CONSOLE:' in e and ('404' in e or '401' in e or '403' in e)]
        js_errors = [e for e in errors if 'CONSOLE:' in e and '404' not in e and '401' not in e and '403' not in e]
        print(f"   Resource errors (404/401/403): {len(resource_errors)}")
        print(f"   JS errors (non-resource): {len(js_errors)}")
        if js_errors:
            for e in js_errors[:3]:
                print(f"     {e[:100]}")
        
        await browser.close()
        print("\n=== VERIFICATION COMPLETE ===")

asyncio.run(main())
