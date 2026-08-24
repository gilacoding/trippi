#!/usr/bin/env python3
"""Local E2E verification — soft-convert fix."""
import asyncio, json, time, urllib.request
from playwright.async_api import async_playwright

SUPABASE_URL = "https://ishflkcsdzlhhxtanhxf.supabase.co"
SUPABASE_ANON = "sb_publishable_7g_crQO8fm0SVVIdqDU78w_gIglXx8Q"
BASE_URL = "http://localhost:8080/trip-planner.html"
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
    print("=== Local E2E — Soft-convert Fix Verification ===")
    
    # Setup: create fresh invitation
    owner_jwt = login(OWNER_EMAIL, OWNER_PASS)
    member_jwt = login(MEMBER_EMAIL, MEMBER_PASS)
    
    # Find existing group with few members
    groups = call_rpc(owner_jwt, "list_my_groups")
    group_id = groups[0]["id"] if groups else None
    print(f"Using group: {group_id} ({groups[0]['name']})")
    
    # Create invitation
    inv = call_rpc(owner_jwt, "create_invitation", {"p_group_id": group_id, "p_display_name": None})
    token = inv[0]["token"]
    print(f"Token: {token[:16]}...")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=['--no-sandbox'])
        
        # === TEST 1: Anonymous guest flow (P0.2) ===
        print("\n=== TEST 1: Anonymous guest flow ===")
        ctx_guest = await browser.new_context()
        page = await ctx_guest.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        
        await page.goto(f"{BASE_URL}?gt={token}", wait_until='networkidle')
        await page.wait_for_timeout(5000)
        
        # Should see guest preview
        preview_visible = await page.evaluate('''() => {
            const p = document.getElementById('guestPreview');
            return p ? window.getComputedStyle(p).display !== 'none' : false;
        }''')
        print(f"  Preview visible: {preview_visible}")
        
        # Click Gabung Trip → should show name form (NOT login modal)
        join_clicked = await page.evaluate('''() => {
            const b = document.getElementById('guestJoinBtn');
            if (b) { b.click(); return true; }
            return false;
        }''')
        await page.wait_for_timeout(2000)
        
        # Check what appeared
        name_form_visible = await page.evaluate('''() => {
            const f = document.getElementById('guestNameForm');
            return f ? window.getComputedStyle(f).display !== 'none' : false;
        }''')
        auth_modal_visible = await page.is_visible('#authModal', timeout=2000)
        print(f"  Name form shown: {name_form_visible} (P0.2 flow)")
        print(f"  Auth modal shown: {auth_modal_visible} (M2 flow)")
        
        if name_form_visible and not auth_modal_visible:
            print("  ✅ PASS — P0.2 anonymous flow (name form, no login)")
            
            # Fill name and submit
            await page.fill('#guestNameInput', 'Anonymous Tester')
            await page.click('#guestNameSubmit')
            await page.wait_for_timeout(8000)
            
            # Check joined view
            joined = await page.evaluate('''() => {
                const jv = document.getElementById('guestJoinedView');
                return jv ? window.getComputedStyle(jv).display !== 'none' : false;
            }''')
            print(f"  Joined view visible: {joined}")
            print(f"  Page errors: {errors[:3]}")
        else:
            print("  ❌ FAIL — expected name form (P0.2), got something else")
        
        # === TEST 2: Registered user soft-convert ===
        print("\n=== TEST 2: Registered user soft-convert ===")
        ctx_member = await browser.new_context()
        page2 = await ctx_member.new_page()
        errors2 = []
        page2.on('pageerror', lambda e: errors2.append(str(e)))
        
        # Login as member first
        await page2.goto(BASE_URL, wait_until='networkidle')
        await page2.wait_for_timeout(3000)
        
        # Open auth modal and login
        await page2.click('button:has-text("Masuk")', timeout=5000)
        await page2.wait_for_timeout(1000)
        await page2.fill('input[type="email"]', MEMBER_EMAIL)
        await page2.fill('input[type="password"]', MEMBER_PASS)
        await page2.click('#authModal button:has-text("Masuk")', timeout=5000)
        await page2.wait_for_timeout(5000)
        
        logged_in = await page2.is_visible('#logoutBtn', timeout=3000)
        print(f"  Member logged in: {logged_in}")
        
        # Now open guest link
        await page2.goto(f"{BASE_URL}?gt={token}", wait_until='networkidle')
        await page2.wait_for_timeout(5000)
        
        # Should see guest view with "Gabung Trip" button (not "Masuk/Daftar")
        btn_text = await page2.evaluate('''() => {
            const b = document.getElementById('guestJoinBtn');
            return b ? b.textContent.trim() : 'MISSING';
        }''')
        print(f"  Button text: '{btn_text}'")
        
        # Click Gabung Trip → should soft-convert
        await page2.evaluate('''() => {
            const b = document.getElementById('guestJoinBtn');
            if (b) b.click();
        }''')
        await page2.wait_for_timeout(8000)
        
        # Check transition
        groupview = await page2.evaluate('''() => {
            const gv = document.getElementById('groupView');
            return gv ? window.getComputedStyle(gv).display !== 'none' : false;
        }''')
        guestview = await page2.evaluate('''() => {
            const g = document.getElementById('guestView');
            return g ? window.getComputedStyle(g).display !== 'none' : false;
        }''')
        
        print(f"  Group view visible: {groupview}")
        print(f"  Guest view visible: {guestview}")
        print(f"  Page errors: {errors2[:3]}")
        
        if groupview:
            print("  ✅ PASS — soft-convert to group view works!")
        else:
            print("  ❌ FAIL — did not transition to group view")
        
        # === TEST 3: Creator sees count update ===
        print("\n=== TEST 3: Creator verification ===")
        # Refresh owner's view
        ctx_owner = await browser.new_context()
        page3 = await ctx_owner.new_page()
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
        print(f"  Creator sees member_count: {member_count}")
        
        if member_count and member_count >= 2:
            print("  ✅ PASS — creator sees updated count")
        else:
            print("  ❌ FAIL — count not updated")
        
        await browser.close()
        
        print("\n=== DONE ===")

asyncio.run(main())
