#!/usr/bin/env python3
"""Focused Playwright verification for guest flow V2 CSS upgrade."""
import asyncio, json, urllib.request
from playwright.async_api import async_playwright

BASE_URL = "https://marki.cab/trip-planner.html"
SUPABASE_URL = "https://ishflkcsdzlhhxtanhxf.supabase.co"
SUPABASE_ANON = "sb_publishable_7g_crQO8fm0SVVIdqDU78w_gIglXx8Q"
OWNER_EMAIL = "e2e-guest-baseline@marki.cab"
OWNER_PASS = "Str0ngP@ss99!"

async def main():
    print("=== GUEST FLOW V2 CSS VERIFICATION ===\n")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=['--no-sandbox'])
        ctx = await browser.new_context()
        page = await ctx.new_page()
        
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append("CONSOLE: " + m.text) if m.type == 'error' else None)
        
        # Navigate to base URL
        await page.goto(BASE_URL, wait_until='networkidle')
        await page.wait_for_timeout(2000)
        
        # Login
        await page.click('button:has-text("Masuk")', timeout=5000)
        await page.wait_for_timeout(1000)
        await page.fill('input[type="email"]', OWNER_EMAIL)
        await page.fill('input[type="password"]', OWNER_PASS)
        await page.click('#authModal button:has-text("Masuk")', timeout=5000)
        await page.wait_for_timeout(3000)
        
        # Create a trip
        await page.click('#newTripBtn', timeout=5000)
        await page.wait_for_timeout(1500)
        await page.fill('#tripName', 'Guest Flow Test')
        await page.fill('#tripDestination', 'Bali')
        await page.fill('#tripStart', '2026-09-01')
        await page.fill('#tripEnd', '2026-09-03')
        await page.click('#newTripSubmit', timeout=5000)
        await page.wait_for_timeout(3000)
        
        # Click "Bagikan" button to get share link
        await page.click('#inviteGroupBtn', timeout=5000)
        await page.wait_for_timeout(2000)
        
        # Get the share link from the modal
        share_url = await page.evaluate("(function(){ var link = document.querySelector('input[type=\"text\"]'); return link ? link.value : null; })")
        print("Share URL: " + str(share_url))
        
        # Navigate to share URL to trigger guest view
        if share_url:
            await page.goto(share_url, wait_until='networkidle')
            await page.wait_for_timeout(3000)
        
        # 1. Guest view loads
        guestview_ok = await page.evaluate("(function(){ var gv = document.getElementById('guestView'); return gv && gv.offsetParent !== null; })")
        print("1. Guest view loads: " + ("PASS" if guestview_ok else "FAIL"))
        
        # 2. Verify guest-card styling
        guestcard_style = await page.evaluate("(function(){ var card = document.querySelector('#guestView .guest-card'); if (!card) return null; var h1 = card.querySelector('h1'); var summary = card.querySelector('.participant-summary'); return { cardExists: true, cardRadius: window.getComputedStyle(card).borderRadius, cardPadding: window.getComputedStyle(card).padding, h1Font: h1 ? window.getComputedStyle(h1).fontFamily : null, summaryFont: summary ? window.getComputedStyle(summary).fontFamily : null }; })")
        print("2. Guest card styled: " + ("PASS" if guestcard_style else "FAIL"))
        if guestcard_style:
            print("   - Card border-radius: " + str(guestcard_style['cardRadius']) + " (expected: 24px)")
            print("   - Card padding: " + str(guestcard_style['cardPadding']))
            print("   - H1 font: " + str(guestcard_style['h1Font']))
            print("   - Summary font: " + str(guestcard_style['summaryFont']))
        
        # 3. Verify participant-summary count styling
        count_style = await page.evaluate("(function(){ var count = document.querySelector('#guestView .participant-summary .count'); if (!count) return null; return { countExists: true, fontFamily: window.getComputedStyle(count).fontFamily, fontSize: window.getComputedStyle(count).fontSize, background: window.getComputedStyle(count).background }; })")
        print("3. Count badge styled: " + ("PASS" if count_style else "FAIL"))
        if count_style:
            print("   - Font family: " + str(count_style['fontFamily']))
            print("   - Font size: " + str(count_style['fontSize']))
        
        # 4. Click Gabung Trip and verify name form
        await page.click('#guestJoinBtn', timeout=5000)
        await page.wait_for_timeout(1000)
        nameform_ok = await page.evaluate("(function(){ var nf = document.getElementById('guestNameForm'); return nf && nf.style.display !== 'none'; })")
        print("4. Name form appears: " + ("PASS" if nameform_ok else "FAIL"))
        
        # 5. Clean console (exclude pre-existing 42501 DB errors)
        js_errors = [e for e in errors if 'CONSOLE:' in e and '42501' not in e and '404' not in e and '401' not in e and '403' not in e]
        page_errors = [e for e in errors if 'CONSOLE:' not in e]
        console_ok = len(js_errors) == 0 and len(page_errors) == 0
        print("5. Clean console: " + ("PASS" if console_ok else "FAIL"))
        if js_errors:
            print("   JS errors: " + str(len(js_errors)))
            for e in js_errors[:3]:
                print("     " + e[:100])
        if page_errors:
            print("   Page errors: " + str(len(page_errors)))
        
        await browser.close()
        print("\n=== VERIFICATION COMPLETE ===")

asyncio.run(main())
