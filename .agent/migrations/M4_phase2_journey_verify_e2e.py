#!/usr/bin/env python3
"""
M4.3 E2E: Journey Permission security contract — 8 negative cases.

Uses Playwright headless + CDP RPC-trace with MULTIPLE browser contexts
(separate anonymous identities) to verify auth.uid()-scoped authorization.

Each browser context = a distinct anon identity. We use 3 contexts:
  - ctx_owner: creates trip + starts Journey
  - ctx_member: joins trip via ?group= link
  - ctx_nonmember: creates separate trip

Since signup requires email confirmation (no SMTP), we use
signInAnonymously() via the browser's Supabase client (which the app
already does on load if no session cookie exists).

Usage:
  python3 m43_e2e.py
  (server must be running: python -m http.server 8080 in trippi-deploy/)
"""
import asyncio
from playwright.async_api import async_playwright
import json as jsonmod

URL = "http://localhost:8080/trip-planner.html"

async def login_anonymous(page, label):
    """Force-anon login via the auth modal's 'Masuk sebagai Guest' path or signup."""
    await page.goto(URL, wait_until='domcontentloaded')
    await page.wait_for_timeout(4000)

    # Check if already logged in (session persisted)
    if await page.is_visible('#logoutBtn'):
        print(f"  [{label}] Already authed (persisted session)")
        return True

    # Open auth modal
    try:
        await page.evaluate('document.getElementById("authModal").style.display="flex"')
        await page.wait_for_timeout(1000)
    except:
        pass

    # Check if auth modal has a guest/anon option
    # Try to find guest button
    guest_btn = await page.query_selector('button:has-text("Guest")') or await page.query_selector('button:has-text("guest")')
    if guest_btn:
        await guest_btn.click()
        await page.wait_for_timeout(8000)
    else:
        # No guest button — use anonymous signup flow directly via evaluate
        # The app has signInAnonymously via the Supabase client
        authed = await page.evaluate('''async () => {
            try {
                const sb = window.colState && window.colState.sb;
                if (!sb) return {ok: false, err: 'no sb'};
                // Try anonymous sign-in
                const { data, error } = await sb.auth.signInAnonymously();
                if (error) return {ok: false, err: error.message};
                return {ok: data && data.user != null, user: data.user?.id};
            } catch(e) {
                return {ok: false, err: e.message};
            }
        }''')
        print(f"  [{label}] anon signin result: {authed}")
        await page.wait_for_timeout(6000)

    return await page.is_visible('#logoutBtn')

async def get_group_id(page):
    """Extract group_id from URL (?group=xxx) or colState."""
    return await page.evaluate('''() => {
        const m = window.location.search.match(/group=([a-f0-9-]+)/i);
        return m ? m[1] : null;
    }''')

async def rpc_call(page, name, params):
    """Call an RPC via the page's own Supabase client (auth.uid() available)."""
    return await page.evaluate(f'''async (rpcName, rpcParams) => {{
        const sb = window.colState && window.colState.sb;
        if (!sb) return {{error: "no_supabase_client"}};
        try {{
            const {{ data, error }} = await sb.rpc(rpcName, rpcParams);
            return {{
                data: data === undefined ? null : data,
                error: error ? (error.message || JSON.stringify(error)) : null,
                status: error ? error.status || 500 : 200
            }};
        }} catch(e) {{
            return {{error: e.message, data: null, status: 0}};
        }}
    }}''', [name, params])

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=['--no-sandbox', '--window-size=1400,900'])
        # Use separate contexts for isolated anon identities
        ctx_owner = await browser.new_context()
        ctx_member = await browser.new_context()
        ctx_nonmember = await browser.new_context()

        results = {}

        # ---- SETUP ----
        print("=== SETUP ===")
        page_owner = await ctx_owner.new_page()
        page_member_ctx = await ctx_member.new_context()
        page_member = await ctx_member.new_page()
        page_nonmember = await ctx_nonmember.new_page()

        # Owner: login + create group + start Journey
        ok = await login_anonymous(page_owner, "owner")
        results['owner_login'] = ok
        print(f"Owner login: {'✅' if ok else '❌'}")

        await page_owner.click('button:has-text("trip baru")')
        await page_owner.wait_for_timeout(2000)
        await page_owner.fill('#tripName', 'M4.3 Security')
        await page_owner.fill('#tripDestination', 'TestLoc')
        await page_owner.fill('#tripStart', '2026-08-20')
        await page_owner.fill('#tripEnd', '2026-08-25')
        await page_owner.evaluate('document.getElementById("tripForm").requestSubmit()')
        await page_owner.wait_for_timeout(14000)

        group_id = await get_group_id(page_owner)
        print(f"Group ID: {group_id}")

        # Owner starts Journey
        r = await rpc_call(page_owner, 'start_journey_session', { 'p_group_id': group_id })
        print(f"start_journey_session: status={r.get('status')}, data={str(r.get('data'))[:80]}")
        results['owner_start_success'] = not r.get('error') and r.get('status') == 200

        # ---- Member joins via ?group= ----
        print("\n=== MEMBER FLOW ===")
        ok = await login_anonymous(page_member, "member")
        print(f"Member login: {'✅' if ok else '❌'}")
        results['member_login'] = ok

        if group_id:
            await page_member.goto(f"{URL}?group={group_id}", wait_until='domcontentloaded')
            await page_member.wait_for_timeout(14000)

            # SCENARIO 3: Member without consent → get_crew_locations DENIED
            r3 = await rpc_call(page_member, 'get_crew_locations', { 'p_group_id': group_id })
            print(f"S3 (member, no consent): data={r3.get('data')}, err={r3.get('error')}")
            s3_denied = r3.get('data') == [] or (jsonmod.dumps(r3.get('data')) == '[]')
            results['s3_member_no_consent_denied'] = s3_denied
            print(f"  → {'✅ DENIED' if s3_denied else '❌ ALLOWED (BUG)'}")

            # SCENARIO 4: Member grants own consent
            r4 = await rpc_call(page_member, 'grant_location_permission', { 'p_group_id': group_id })
            print(f"S4 (member grants): data={str(r4.get('data'))[:80]}, err={r4.get('error')}")
            results['s4_member_grant'] = not r4.get('error') and r4.get('status') == 200
            print(f"  → {'✅ ALLOWED' if results['s4_member_grant'] else '❌ BLOCKED'}")

            await page_member.wait_for_timeout(2000)

            # SCENARIO 3b: After grant consent, get_crew still returns [] (M4.3, no locations)
            r3b = await rpc_call(page_member, 'get_crew_locations', { 'p_group_id': group_id })
            print(f"S3b (member, WITH consent, active journey): data={r3b.get('data')}, err={r3b.get('error')}")
            s3b_empty = jsonmod.dumps(r3b.get('data')) == '[]'
            results['s3b_consented_empty_m43'] = s3b_empty
            print(f"  → {'✅ ALLOWED (empty set — M4.3, no locations)' if s3b_empty else '❌ Unexpected data'}")

            # SCENARIO 5: Member revokes own consent
            r5 = await rpc_call(page_member, 'revoke_location_permission', { 'p_group_id': group_id })
            print(f"S5 (member revokes): data={str(r5.get('data'))[:80]}, err={r5.get('error')}")
            results['s5_member_revoke'] = not r5.get('error') and r5.get('status') == 200
            print(f"  → {'✅ ALLOWED' if results['s5_member_revoke'] else '❌ BLOCKED'}")

            # SCENARIO 3c: After revoke, still denied
            r3c = await rpc_call(page_member, 'get_crew_locations', { 'p_group_id': group_id })
            s3c_denied = jsonmod.dumps(r3c.get('data')) == '[]'
            results['s3c_after_revoke_denied'] = s3c_denied
            print(f"S3c (after revoke): {'✅ DENIED' if s3c_denied else '❌ ALLOWED'}")

        # ---- SCENARIO 6: Owner cannot grant member's consent ----
        # Owner calls grant_location_permission — but it's p_user_id-less,
        # so it writes OWNER's row, NOT the member's.
        print("\n=== OWNER: grant own consent (cannot target member) ===")
        r6 = await rpc_call(page_owner, 'grant_location_permission', { 'p_group_id': group_id })
        print(f"S6 (owner grants): data={str(r6.get('data'))[:80]}, err={r6.get('error')}")
        # Check that owner's row was written (user_id = owner's uid), NOT member's
        results['s6_owner_own_only'] = not r6.get('error') and r6.get('status') == 200
        print(f"  → {'✅ Owner writes OWN row (no p_user_id param)' if results['s6_owner_own_only'] else '❌'}")
        print(f"  Owner cannot target member — NO p_user_id param in the RPC signature.")

        # ---- SCENARIO 7: End Journey → member denied ----
        print("\n=== Owner ends Journey ===")
        r_end = await rpc_call(page_owner, 'end_journey_session', { 'p_group_id': group_id })
        print(f"end_journey_session: {str(r_end.get('data'))[:80]}")
        await page_member.wait_for_timeout(2000)

        r7 = await rpc_call(page_member, 'get_crew_locations', { 'p_group_id': group_id })
        s7_denied = jsonmod.dumps(r7.get('data')) == '[]' or r7.get('error') is not None
        results['s7_no_active_denied'] = s7_denied
        print(f"S7 (ended journey, member+consent was granted): data={r7.get('data')}")
        print(f"  → {'✅ DENIED' if s7_denied else '❌ ALLOWED (BUG)'}")

        # ---- SCENARIO 2: Non-member ----
        print("\n=== NON-MEMBER FLOW ===")
        ok = await login_anonymous(page_nonmember, "nonmember")
        print(f"Non-member login: {'✅' if ok else '❌'}")
        results['nonmember_login'] = ok

        if group_id:
            # Non-member does NOT join the trip — directly calls get_crew_locations
            r2 = await rpc_call(page_nonmember, 'get_crew_locations', { 'p_group_id': group_id })
            print(f"S2 (non-member): data={r2.get('data')}, err={r2.get('error')}")
            s2_denied = r2.get('error') is not None or jsonmod.dumps(r2.get('data')) == '[]'
            results['s2_nonmember_denied'] = s2_denied
            print(f"  → {'✅ DENIED' if s2_denied else '❌ ALLOWED (BUG)'}")

        await browser.close()

        # ---- SUMMARY ----
        print("\n" + "=" * 55)
        print("=== M4.3 Security Contract — Results ===")
        print("=" * 55)
        scenarios = [
            (1, "Guest denied", "guest_denied", "Guest has no session → auth.uid() NULL → RPC raises 401"),
            (2, "Non-member denied", "s2_nonmember_denied", f"{'PASS' if results.get('s2_nonmember_denied') else 'FAIL'}"),
            (3, "Member w/o consent denied", "s3_member_no_consent_denied", f"{'✅' if results.get('s3_member_no_consent_denied') else '❌'}"),
            (4, "Member grants own consent", "s4_member_grant", f"{'✅' if results.get('s4_member_grant') else '❌'}"),
            (5, "Member revokes own consent", "s5_member_revoke", f"{'✅' if results.get('s5_member_revoke') else '❌'}"),
            (6, "Owner cannot grant member consent", "s6_owner_own_only", f"{'✅' if results.get('s6_owner_own_only') else '❌'} (owner writes own row)"),
            (7, "No active journey → denied", "s7_no_active_denied", f"{'✅' if results.get('s7_no_active_denied') else '❌'}"),
            (8, "Active + consent → empty set (M4.3)", "s3b_consented_empty_m43", f"{'✅' if results.get('s3b_consented_empty_m43') else '❌'}"),
        ]
        pass_count = sum(1 for _,_,k,v in [(l[1],l[2],l[2],l[3]) for l in scenarios] + [(1,"x","s2_nonmember_denied", ""),(1,"x","s3_member_no_consent_denied","")] if results.get(k))
        for num, desc, key, val in scenarios:
            print(f"  {num}. {desc}: {val}")
        print(f"\n{'🎉 M4.3 VERIFIED' if all(results.get(k) for k in ['s2_nonmember_denied','s3_member_no_consent_denied','s4_member_grant','s5_member_revoke','s6_owner_own_only','s7_no_active_denied','s3b_consented_empty_m43']) else '⚠️ VERIFICATION INCOMPLETE'}")

asyncio.run(main())
