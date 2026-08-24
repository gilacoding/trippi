#!/usr/bin/env python3
"""Focused debug: member login + ?group= join flow."""
import asyncio, json
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:8080/trip-planner.html"
GROUP_ID = "7d6b2df4-184c-4592-948e-e7b55a874ff0"

async def debug():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=['--no-sandbox', '--window-size=1400,900'])
        ctx = await browser.new_context()
        page = await ctx.new_page()

        # Capture ALL console messages and page errors
        all_msgs = []
        page.on('console', lambda msg: all_msgs.append(f"CONSOLE[{msg.type}]: {msg.text}"))
        page.on('pageerror', lambda exc: all_msgs.append(f"PAGEERROR: {exc}"))
        
        # Navigate to the app
        await page.goto(BASE_URL, wait_until='domcontentloaded')
        await page.wait_for_timeout(3000)
        
        # Login as member
        mv = await page.is_visible('#authModal', timeout=3000)
        print(f"Auth modal visible: {mv}")
        if mv:
            await page.fill('input[type="email"]', 'e2e_member_1787308237@marki.cab')
            await page.fill('input[type="password"]', 'Str0ngP@ss99!')
            await page.click('#authModal button:has-text("Masuk")', timeout=5000)
            await page.wait_for_timeout(8000)
        
        logout = await page.is_visible('#logoutBtn', timeout=3000)
        print(f"Login: {'OK' if logout else 'FAIL'}")
        
        # Now navigate to ?group=
        print(f"Navigating to ?group={GROUP_ID}")
        all_msgs.clear()
        await page.goto(f"{BASE_URL}?group={GROUP_ID}", wait_until='domcontentloaded')
        
        # Wait and poll
        for i in range(40):
            await page.wait_for_timeout(1000)
            state = await page.evaluate("""() => {
                const gv = document.getElementById('groupView');
                const grp = document.getElementById('groupName');
                const home = document.getElementById('homeView');
                const auth = document.getElementById('authModal');
                return {
                    groupViewDisplay: gv ? window.getComputedStyle(gv).display : 'MISSING',
                    groupName: grp ? grp.textContent.trim() : '',
                    homeViewDisplay: home ? window.getComputedStyle(home).display : 'MISSING',
                    authModalDisplay: auth ? window.getComputedStyle(auth).display : 'no-modal'
                };
            }""")
            if state['groupViewDisplay'] != 'none':
                print(f"✅ Group view visible after {i+1}s")
                print(f"  State: {json.dumps(state)}")
                break
            if i in (9, 19, 29, 39):
                print(f"  State @ {i+1}s: {json.dumps(state)}")
        else:
            print(f"❌ Group view NEVER loaded")
            print(f"  Final state: {json.dumps(state)}")
        
        print(f"\n=== Console messages ({len(all_msgs)}) ===")
        for m in all_msgs[:20]:
            print(f"  {m}")
        
        await browser.close()

asyncio.run(debug())
