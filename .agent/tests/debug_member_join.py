#!/usr/bin/env python3
"""Debug member group join flow."""
import asyncio, json
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:8080/trip-planner.html"

async def debug():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=['--no-sandbox', '--window-size=1400,900'])
        ctx = await browser.new_context()
        page = await ctx.new_page()

        errors = []
        page.on('console', lambda msg: errors.append(f"[{msg.type}] {msg.text()}") if msg.type in ('error','warning') else None)
        page.on('pageerror', lambda exc: errors.append(f"PAGEERROR: {exc}"))
        page.on('dialog', lambda d: (errors.append(f"DIALOG[{d.type()}]: {d.message()}"), d.dismiss()))

        await page.goto(BASE_URL, wait_until='domcontentloaded')
        await page.wait_for_timeout(5000)

        # Login as member
        mv = await page.is_visible('#authModal', timeout=3000)
        if mv:
            await page.fill('input[type="email"]', 'e2e_member_1787308237@marki.cab')
            await page.fill('input[type="password"]', 'Str0ngP@ss99!')
            try:
                await page.click('#authModal button:has-text("Masuk")', timeout=5000)
            except:
                await page.click('button[type="submit"]', timeout=5000)
            await page.wait_for_timeout(8000)

        logout = await page.is_visible('#logoutBtn', timeout=3000)
        print(f'Login: {"OK" if logout else "FAIL"}')

        # Navigate to ?group=
        group_id = '82eeef45-fcc6-4a3c-ad99-31cc6a60e7c7'
        errors.clear()
        await page.goto(f"{BASE_URL}?group={group_id}", wait_until='domcontentloaded')

        for i in range(40):
            await page.wait_for_timeout(1000)
            loaded = await page.evaluate('''() => {
                const gv = document.getElementById('groupView');
                return gv ? window.getComputedStyle(gv).display : 'none';
            }''')
            if loaded != 'none':
                print(f'Group view visible after {i+1}s')
                break
            if i == 19 or i == 39:
                state = await page.evaluate('''() => {
                    const grp = document.getElementById('groupName');
                    const gv = document.getElementById('groupView');
                    const home = document.getElementById('homeView');
                    return {
                        groupName: grp ? grp.textContent.trim() : 'MISSING',
                        groupViewDisplay: gv ? window.getComputedStyle(gv).display : 'MISSING',
                        homeViewDisplay: home ? window.getComputedStyle(home).display : 'MISSING',
                        url: window.location.href
                    };
                }''')
                print(f'  State @ {i+1}s: {json.dumps(state)}')
        else:
            print('Group view NEVER loaded after 40s')

        print(f'Errors ({len(errors)}):')
        for e in errors[:15]:
            print(f'  {e}')

        await browser.close()

asyncio.run(debug())
