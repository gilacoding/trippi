#!/usr/bin/env python3
"""Live smoke test — marki.cab P0.2 Guest Model V2 (fresh group per run)"""
import asyncio, json, time, urllib.request
from playwright.async_api import async_playwright

SUPABASE_URL = "https://ishflkcsdzlhhxtanhxf.supabase.co"
SUPABASE_ANON = "sb_publishable_7g_crQO8fm0SVVIdqDU78w_gIglXx8Q"
BASE_URL = "https://marki.cab/trip-planner.html"
OWNER_EMAIL = "e2e-guest-baseline@marki.cab"
OWNER_PASS = "Str0ngP@ss99!"
MEMBER_EMAIL = "e2e-member-test@marki.cab"
MEMBER_PASS = "Str0ngP@ss99!"


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
    print("=== LIVE SMOKE TEST — marki.cab P0.2 Guest Model V2 ===\n")
    
    # Setup: create fresh group
    owner_jwt = login(OWNER_EMAIL, OWNER_PASS)
    group_resp = call_rpc(owner_jwt, "create_group", {
        "p_name": "Smoke Test", "p_destination": "Bali",
        "p_start_date": "2026-08-23", "p_end_date": "2026-08-24", "p_display_name": "Creator"
    })
    group_id = group_resp[0]["group_id"]
    inv = call_rpc(owner_jwt, "create_invitation", {"p_group_id": group_id, "p_display_name": None})
    token = inv[0]["token"]
    print(f"Fresh group: {group_id}")
    print(f"Token: {token[:16]}...\n")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=['--no-sandbox'])
        
        # === PERSONA 1: Anonymous Guest ===
        print("━━━ PERSONA 1: Anonymous Guest ━━━")
        ctx1 = await browser.new_context()
        page1 = await ctx1.new_page()
        errors1 = []
        page1.on('pageerror', lambda e: errors1.append(str(e)))
        
        await page1.goto(f"{BASE_URL}?gt={token}", wait_until='networkidle')
        await page1.wait_for_timeout(5000)
        
        preview = await page1.evaluate('''() => {
            const p = document.getElementById('guestPreview');
            return p ? window.getComputedStyle(p).display !== 'none' : false;
        }''')
        auth_modal = await page1.is_visible('#authModal', timeout=2000)
        print(f"  Preview visible: {preview}")
        print(f"  Auth modal (should be False): {auth_modal}")
        
        if preview and not auth_modal:
            await page1.evaluate('''() => {
                const b = document.getElementById('guestJoinBtn');
                if (b) b.click();
            }''')
            await page1.wait_for_timeout(2000)
            
            name_form = await page1.evaluate('''() => {
                const f = document.getElementById('guestNameInput');
                return f ? window.getComputedStyle(f).display !== 'none' : false;
            }''')
            print(f"  Name form shown: {name_form}")
            
            if name_form:
                await page1.fill('#guestNameInput', 'Smoke Test Guest')
                await page1.click('#guestNameSubmit')
                await page1.wait_for_timeout(8000)
                
                joined = await page1.evaluate('''() => {
                    const jv = document.getElementById('guestJoinedView');
                    return jv ? window.getComputedStyle(jv).display !== 'none' : false;
                }''')
                edit_btns = await page1.evaluate('''() => {
                    const edits = document.querySelectorAll('#guestJoinedView button:not(#guestUpgradeBtn)');
                    return Array.from(edits).filter(b => b.textContent.includes('Edit') || b.textContent.includes('Hapus')).length;
                }''')
                print(f"  Joined view: {joined}")
                print(f"  Edit buttons: {edit_btns}")
                print(f"  Page errors: {errors1[:2]}")
                
                if joined and edit_btns == 0:
                    print("  ✅ PASS — Anonymous guest joins, read-only")
                else:
                    print("  ❌ FAIL")
            else:
                print("  ❌ FAIL — name form not shown")
        else:
            print("  ❌ FAIL")
        
        # === PERSONA 2: Registered User ===
        print("\n━━━ PERSONA 2: Registered User ━━━")
        ctx2 = await browser.new_context()
        page2 = await ctx2.new_page()
        errors2 = []
        page2.on('pageerror', lambda e: errors2.append(str(e)))
        
        await page2.goto(BASE_URL, wait_until='networkidle')
        await page2.wait_for_timeout(3000)
        await page2.click('button:has-text("Masuk")', timeout=5000)
        await page2.wait_for_timeout(1000)
        await page2.fill('input[type="email"]', MEMBER_EMAIL)
        await page2.fill('input[type="password"]', MEMBER_PASS)
        await page2.click('#authModal button:has-text("Masuk")', timeout=5000)
        await page2.wait_for_timeout(5000)
        
        await page2.goto(f"{BASE_URL}?gt={token}", wait_until='networkidle')
        await page2.wait_for_timeout(5000)
        
        btn_text = await page2.evaluate('''() => {
            const b = document.getElementById('guestJoinBtn');
            return b ? b.textContent.trim() : 'MISSING';
        }''')
        print(f"  Button text: '{btn_text}'")
        
        await page2.evaluate('''() => {
            const b = document.getElementById('guestJoinBtn');
            if (b) b.click();
        }''')
        await page2.wait_for_timeout(8000)
        
        groupview = await page2.evaluate('''() => {
            const gv = document.getElementById('groupView');
            return gv ? window.getComputedStyle(gv).display !== 'none' : false;
        }''')
        print(f"  Group view: {groupview}")
        print(f"  Page errors: {errors2[:2]}")
        
        if groupview:
            print("  ✅ PASS — Registered user soft-converts")
        else:
            print("  ❌ FAIL")
        
        # === PERSONA 3: Creator ===
        print("\n━━━ PERSONA 3: Creator ━━━")
        ctx3 = await browser.new_context()
        page3 = await ctx3.new_page()
        
        await page3.goto(BASE_URL, wait_until='networkidle')
        await page3.wait_for_timeout(3000)
        await page3.click('button:has-text("Masuk")', timeout=5000)
        await page3.wait_for_timeout(1000)
        await page3.fill('input[type="email"]', OWNER_EMAIL)
        await page3.fill('input[type="password"]', OWNER_PASS)
        await page3.click('#authModal button:has-text("Masuk")', timeout=5000)
        await page3.wait_for_timeout(5000)
        
        member_count = await page3.evaluate('''async () => {
            const r = await API.listMyGroups();
            if(r.data && r.data[0]) return r.data[0].member_count;
            return null;
        }''')
        print(f"  Member count: {member_count}")
        
        if member_count and member_count >= 2:
            print("  ✅ PASS — Creator sees updated count")
        else:
            print("  ❌ FAIL")
        
        await browser.close()
        
        print("\n=== SMOKE TEST COMPLETE ===")

asyncio.run(main())
