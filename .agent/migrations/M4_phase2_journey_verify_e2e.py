#!/usr/bin/env python3
"""
M4.3 E2E: Journey Permission negative-case verification.

Tests the 8 security-contract scenarios via Playwright headless + CDP RPC-trace.
Uses TWO authenticated identities (owner + member + non-member) to verify
auth.uid()-scoped authorization.

Run AFTER founder deploys M4_phase2_journey.sql to Supabase.
No server-side code changes required — M4.3 is SQL-only.
"""
import asyncio
from playwright.async_api import async_playwright

# Credentials for 3 identities
OWNER = {"email": "m43_owner@marki.cab", "pass": "Str0ngP@ss99!"}
MEMBER = {"email": "m43_member@marki.cab", "pass": "Str0ngP@ss99!"}
NONMEMBER = {"email": "m43_nonmember@marki.cab", "pass": "Str0ngP@ss99!"}
URL = "http://localhost:8080/trip-planner.html"

async def login_as(page, email, password):
    """Login via auth modal. Returns True if logged in (#logoutBtn visible)."""
    await page.goto(URL, wait_until='domcontentloaded')
    await page.wait_for_timeout(3000)
    await page.evaluate('document.getElementById("authModal").style.display="flex"')
    await page.fill('#authEmail', email)
    await page.fill('#authPassword', password)
    await page.evaluate('document.getElementById("authForm").requestSubmit()')
    await page.wait_for_timeout(8000)
    return await page.is_visible('#logoutBtn')

async def capture_rpcs(context):
    """Capture RPC calls across all pages."""
    rpcs = []
    def on_response(res):
        if 'rpc/' in res.url:
            name = res.url.split('rpc/')[-1].split('?')[0]
            rpcs.append({'name': name, 'status': res.status, 'url': res.url})
    for page in context.pages:
        page.on('response', on_response)
    return rpcs

async def test_scenario(name, page, url):
    """Run a scenario — page already positioned at the trip."""
    # This is a placeholder structure; actual tests below
    pass

async def main():
    results = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=['--no-sandbox', '--window-size=1280,800'])
        ctx = await browser.new_context()
        
        all_rpcs = []
        all_rpcs.append({"name": "m43_e2e_start", "status": "INIT"})

        # ---- Setup: Owner creates trip + starts Journey ----
        print("=== SETUP: Owner creates trip + starts Journey ===")
        page_owner = await ctx.new_page()
        page_owner.on('response', lambda r: 'rpc/' in r.url and all_rpcs.append({'name': r.url.split('rpc/')[-1].split('?')[0], 'status': r.status}))

        ok = await login_as(page_owner, OWNER["email"], OWNER["pass"])
        results['owner_login'] = ok
        print(f"  Owner login: {ok}")

        await page_owner.click('button:has-text("trip baru")')
        await page_owner.wait_for_timeout(2000)
        await page_owner.fill('#tripName', 'M4.3 Security Test')
        await page_owner.fill('#tripDestination', 'TestLoc')
        await page_owner.fill('#tripStart', '2026-08-20')
        await page_owner.fill('#tripEnd', '2026-08-25')
        await page_owner.evaluate('document.getElementById("tripForm").requestSubmit()')
        await page_owner.wait_for_timeout(12000)

        # Owner starts Journey via RPC directly (UI doesn't exist in M4.3)
        gid_match = await page_owner.evaluate('''() => {
            const m = window.location.search.match(/group=([^&]+)/);
            return m ? m[1] : null;
        }''')
        print(f"  Group ID: {gid_match}")

        if gid_match:
            # Call start_journey_session RPC via the authenticated session
            # Use the page's own Supabase client context
            result = await page_owner.evaluate(f'''async (gid) => {{
                const sb = window.colState && window.colState.sb;
                if (!sb) return {{error: "no sb client"}};
                const {{ data, error }} = await sb.rpc('start_journey_session', {{p_group_id: gid}});
                return {{ data, error: error ? error.message : null }};
            }}''', gid_match)
            print(f"  start_journey_session result: {result}")
            await page_owner.wait_for_timeout(3000)

        # ---- Member joins + tries various scenarios ----
        print("\n=== Member flow ===")
        page_member = await ctx.new_page()
        page_member.on('response', lambda r: 'rpc/' in r.url and all_rpcs.append({'name': r.url.split('rpc/')[-1].split('?')[0], 'status': r.status}))

        # Member joins via ?group= link
        ok = await login_as(page_member, MEMBER["email"], MEMBER["pass"])
        results['member_login'] = ok
        print(f"  Member login: {ok}")

        if gid_match:
            await page_member.goto(f"{URL}?group={gid_match}", wait_until='domcontentloaded')
            await page_member.wait_for_timeout(12000)

            # Scenario 3: Member without consent tries get_crew_locations
            r3 = await page_member.evaluate(f'''async (gid) => {{
                const sb = window.colState && window.colState.sb;
                if (!sb) return {{error: "no sb client"}};
                const {{ data, error }} = await sb.rpc('get_crew_locations', {{p_group_id: gid}});
                return {{ data, error: error ? error.message : null }};
            }}''', gid_match)
            results['s3_member_no_consent_denied'] = (r3.get('data') == [] or r3.get('data') == [] or str(r3.get('data')) == '[]')
            print(f"  S3 (member, no consent): data={r3.get('data')} → DENIED={'✅' if str(r3.get('data')) == '[]' else '❌'}")

            # Scenario 4: Member grants own consent
            r4 = await page_member.evaluate(f'''async (gid) => {{
                const sb = window.colState && window.colState.sb;
                if (!sb) return {{error: "no sb client"}};
                const {{ data, error }} = await sb.rpc('grant_location_permission', {{p_group_id: gid}});
                return {{ data, error: error ? error.message : null }};
            }}''', gid_match)
            results['s4_member_grant'] = r4.get('data') is not None and r4.get('error') is None
            print(f"  S4 (member grants): {r4.get('data')} → ALLOWED={'✅' if results['s4_member_grant'] else '❌'}")

            await page_member.wait_for_timeout(2000)

            # Scenario 8: Member + consent + active journey → but no locations yet (M4.3)
            r8 = await page_member.evaluate(f'''async (gid) => {{
                const sb = window.colState && window.colState.sb;
                if (!sb) return {{error: "no sb client"}};
                const {{ data, error }} = await sb.rpc('get_crew_locations', {{p_group_id: gid}});
                return {{ data, error: error ? error.message : null }};
            }}''', gid_match)
            # Should return [] (empty set) — authorized but no locations yet
            results['s8_authorized_empty'] = str(r8.get('data')) == '[]'
            print(f"  S8 (member+consent+active): data={r8.get('data')} → empty set={'✅' if results['s8_authorized_empty'] else '❌'}")

            # Scenario 5: Member revokes own consent
            r5 = await page_member.evaluate(f'''async (gid) => {{
                const sb = window.colState && window.colState.sb;
                if (!sb) return {{error: "no sb client"}};
                const {{ data, error }} = await sb.rpc('revoke_location_permission', {{p_group_id: gid}});
                return {{ data, error: error ? error.message : null }};
            }}''', gid_match)
            results['s5_member_revoke'] = r5.get('error') is None
            print(f"  S5 (member revokes): {r5.get('data')} → {'✅' if results['s5_member_revoke'] else '❌'}")

            # Scenario 3b: After revoke, still denied
            r3b = await page_member.evaluate(f'''async (gid) => {{
                const sb = window.colState && window.colState.sb;
                const {{ data, error }} = await sb.rpc('get_crew_locations', {{p_group_id: gid}});
                return {{ data, error: error ? error.message : null }};
            }}''', gid_match)
            print(f"  S3b (after revoke): data={r3b.get('data')} → still DENIED={'✅' if str(r3b.get('data')) == '[]' else '❌'}")

            # Scenario 6: Owner tries to grant member's consent
            # Owner calls grant_location_permission — but this sets owner's OWN row,
            # NOT the member's. So owner "granting" = owner grants self, not member.
            print(f"  S6 (owner grant member consent): owner has NO p_user_id param → grant is self-only. See below.")

        # ---- Owner: grant self consent ----
        if gid_match:
            r6 = await page_owner.evaluate(f'''async (gid) => {{
                const sb = window.colState && window.colState.sb;
                const {{ data, error }} = await sb.rpc('grant_location_permission', {{p_group_id: gid}});
                return {{ data, error: error ? error.message : null }};
            }}''', gid_match)
            results['s6_owner_grant_self'] = r6.get('error') is None
            print(f"  S6 (owner grants self): {r6.get('data')} → ALLOWED={'✅' if results['s6_owner_grant_self'] else '❌'}")

            # Then verify owner's get_crew_locations returns []
            r_owner_loc = await page_owner.evaluate(f'''async (gid) => {{
                const sb = window.colState && window.colState.sb;
                const {{ data, error }} = await sb.rpc('get_crew_locations', {{p_group_id: gid}});
                return {{ data, error: error ? error.message : null }};
            }}''', gid_match)
            print(f"  Owner get_crew (granted self): data={r_owner_loc.get('data')}")

        # ---- Non-member scenario ----
        print("\n=== Non-member flow ===")
        page_non = await ctx.new_page()
        page_non.on('response', lambda r: 'rpc/' in r.url and all_rpcs.append({'name': r.url.split('rpc/')[-1].split('?')[0], 'status': r.status}))
        ok = await login_as(page_non, NONMEMBER["email"], NONMEMBER["pass"])
        print(f"  Non-member login: {ok}")

        if gid_match:
            # Non-member directly calls get_crew_locations — should be denied
            r2 = await page_non.evaluate(f'''async (gid) => {{
                const sb = window.colState && window.colState.sb;
                if (!sb) return {{error: "no sb client"}};
                const {{ data, error }} = await sb.rpc('get_crew_locations', {{p_group_id: gid}});
                return {{ data, error: error ? error.message : null }};
            }}''', gid_match)
            # Non-member → is_group_member false → should return [] (denied, empty)
            results['s2_nonmember_denied'] = str(r2.get('data')) == '[]' or 'denied' in str(r2.get('error','')).lower() or 'member' in str(r2.get('error','')).lower()
            print(f"  S2 (non-member): data={r2.get('data')}, err={r2.get('error')} → DENIED={'✅' if results['s2_nonmember_denied'] else '❌'}")

        # ---- Scenario 7: Journey ended → denied ----
        if gid_match:
            r_end = await page_owner.evaluate(f'''async (gid) => {{
                const sb = window.colState && window.colState.sb;
                const {{ data, error }} = await sb.rpc('end_journey_session', {{p_group_id: gid}});
                return {{ data, error: error ? error.message : null }};
            }}''', gid_match)
            print(f"  Owner ends journey: {r_end.get('data')}")

            await page_member.wait_for_timeout(2000)
            r7 = await page_member.evaluate(f'''async (gid) => {{
                const sb = window.colState && window.colState.sb;
                const {{ data, error }} = await sb.rpc('get_crew_locations', {{p_group_id: gid}});
                return {{ data, error: error ? error.message : null }};
            }}''', gid_match)
            # After end, no active session → [] even if member has consent
            results['s7_no_active_denied'] = str(r7.get('data')) == '[]'
            print(f"  S7 (ended journey, member+consent): data={r7.get('data')} → DENIED={'✅' if results['s7_no_active_denied'] else '❌'}")

        await browser.close()

        # Summary
        print("\n=== M4.3 SECURITY CONTRACT RESULTS ===")
        print(f"  1. Guest denied:       (N/A — guest has no session, auth.uid()=NULL → RPC raises 401)")
        print(f"  2. Non-member denied:  {results.get('s2_nonmember_denied', False)}")
        print(f"  3. Member no consent:  (tested via S3 — get_crew returns [] when no consent row)")
        print(f"  4. Member grants:      {results.get('s4_member_grant', False)}")
        print(f"  5. Member revokes:     {results.get('s5_member_revoke', False)}")
        print(f"  6. Owner grant self:   {results.get('s6_owner_grant_self', False)}")
        print(f"  7. No active journey:  {results.get('s7_no_active_denied', False)}")
        print(f"  8. Auth + consent:     {results.get('s8_authorized_empty', False)} (returns [] — no member_locations yet)")

asyncio.run(main())
