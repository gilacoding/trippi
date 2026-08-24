#!/usr/bin/env python3
"""
E2E Guest Flow Baseline Test — Live Production (marki.cab)
============================================================
Tests the CURRENTLY DEPLOYED guest flow against the live site.
Does NOT require test user credentials.

Tests:
  G1. Guest opens ?gt={invalid} → error + redirect to home (no guestView crash)
  G2. Guest opens ?gt={valid_token} → guestView renders (trip preview + participant count)
  G3. Nav lockdown: back buttons + create-trip hidden for guest
  G4. "Gabung Trip" button visible + labeled with "bergabung"
  G4b. "Tidak perlu akun" subtitle visible (P0.2 flow marker)
  G5. Gabung Trip → current deployed behavior (auth modal OR anonymous flow)
  G6. Guest isolation: no journey/consent banner visible pre-join

For G2-G6 we need a real invitation token. If no test owner credentials
are available, we create one by: signing up a test user via browser →
login → create trip → create invitation → test guest flow as separate browser.

Env vars:
  TRIPPI_LIVE_URL (default: https://marki.cab/trip-planner.html)
  TRIPPI_TEST_OWNER_EMAIL, TRIPPI_TEST_OWNER_PASS (only needed for full G2-G6)
"""
import asyncio, os, sys, json
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("TRIPPI_LIVE_URL", "https://marki.cab/trip-planner.html")
OWNER_EMAIL = os.environ.get("TRIPPI_TEST_OWNER_EMAIL", "")
OWNER_PASS = os.environ.get("TRIPPI_TEST_OWNER_PASS", "")

SUPABASE_URL = "https://ishflkcsdzlhhxtanhxf.supabase.co"
SUPABASE_ANON = "sb_publishable_7g_crQO8fm0SVVIdqDU78w_gIglXx8Q"

RESULTS = {}

def record(name, passed, detail=""):
    RESULTS[name] = {"passed": passed, "detail": detail}
    status = "✅" if passed else "❌"
    print(f"  {status} {name}: {detail}")


async def test_g1_invalid_token(page):
    """G1: Guest opens ?gt={invalid_token} → error message + redirect to home."""
    print("\n=== G1: Invalid token → error + home ===")
    await page.goto(f"{BASE_URL}?gt=invalid-token-12345", wait_until='domcontentloaded')
    await page.wait_for_timeout(3000)

    # Should NOT be on guestView (invalid token → error → home)
    guest_visible = await page.evaluate('''() => {
        const g = document.getElementById('guestView');
        return g && window.getComputedStyle(g).display !== 'none';
    }''')
    home_visible = await page.evaluate('''() => {
        const h = document.getElementById('homeView');
        return h && window.getComputedStyle(h).display !== 'none';
    }''')

    record("G1: Invalid token → not on guestView", not guest_visible,
           f"guestView visible={guest_visible}")
    record("G1: Invalid token → on homeView", home_visible,
           f"homeView visible={home_visible}")


async def test_g2_valid_invitation(page, token):
    """G2: Guest opens ?gt={valid_token} → guestView renders with trip preview."""
    print(f"\n=== G2: Valid invitation → guestView ===")
    await page.goto(f"{BASE_URL}?gt={token}", wait_until='domcontentloaded')
    await page.wait_for_timeout(4000)

    guestview_visible = await page.evaluate('''() => {
        const g = document.getElementById('guestView');
        const c = document.getElementById('guestCard');
        return g && window.getComputedStyle(g).display !== 'none';
    }''')
    record("G2: Guest view shown", guestview_visible,
           "guestView visible" if guestview_visible else "BUG: guestView not shown")

    # Check trip name is rendered
    trip_name = await page.evaluate('''() => {
        const el = document.getElementById('guestTripName');
        return el ? el.textContent.trim() : 'MISSING';
    }''')
    record("G2: Trip name rendered", trip_name != 'MISSING' and trip_name.length > 0,
           f"'{trip_name}'")


async def test_g3_nav_lockdown(page):
    """G3: Nav lockdown — back buttons + new trip button hidden for guest."""
    print("\n=== G3: Nav lockdown ===")

    nav_locked = await page.evaluate('''() => {
        const backs = document.querySelectorAll('[data-home]');
        const hidden = Array.from(backs).every(b => window.getComputedStyle(b).display === 'none');
        const newbtn = document.getElementById('newTripBtn');
        const newbtn_hidden = !newbtn || window.getComputedStyle(newbtn).display === 'none';
        return { hidden_backs: hidden, hidden_new: newbtn_hidden, back_count: backs.length };
    }''')
    record("G3: Navigation locked for guest",
           nav_locked.get('hidden_backs') and nav_locked.get('hidden_new'),
           f"backs_hidden={nav_locked.get('hidden_backs')}, newTrip_hidden={nav_locked.get('hidden_new')}, back_count={nav_locked.get('back_count')}")


async def test_g4_join_button(page):
    """G4: Gabung Trip button visible + correct label."""
    print("\n=== G4: Gabung Trip button ===")

    join_btn = await page.evaluate('''() => {
        const b = document.getElementById('guestJoinBtn');
        if (!b) return null;
        return { visible: window.getComputedStyle(b).display !== 'none', text: b.textContent.trim() };
    }''')
    btn_visible = join_btn and join_btn.get('visible', False)
    btn_text = join_btn.get('text', '') if join_btn else 'MISSING'
    has_bergabung = 'bergabung' in btn_text.lower() if btn_text != 'MISSING' else False

    record("G4: Gabung Trip button shown", btn_visible, f"text='{btn_text}'")
    record("G4: Button label contains 'bergabung'", has_bergabung, f"text='{btn_text}'")


async def test_g4b_no_account_hint(page):
    """G4b: 'Tidak perlu akun' subtitle visible (P0.2 marker)."""
    print("\n=== G4b: No-account hint ===")
    hint = await page.evaluate('''() => {
        const hintEl = document.querySelector('.guest-actions .btn.secondary, [style*="Tidak perlu"]');
        // Check for the subtitle text directly
        const allText = document.getElementById('guestPreview') ? document.getElementById('guestPreview').textContent : '';
        const found = allText.includes('Tidak perlu akun') || allText.includes('tanpa akun');
        const guestView = document.getElementById('guestView');
        const fullText = guestView ? guestView.textContent : '';
        return { found_hint: fullText.includes('Tidak perlu') || fullText.includes('tanpa akun'), full_text_excerpt: fullText.substring(0, 200) };
    }''')
    record("G4b: 'Tidak perlu akun' subtitle present", hint.get('found_hint', False),
           f"hint found={hint.get('found_hint')}")


async def test_g5_join_click(page):
    """G5: Click Gabung Trip → observe behavior (auth modal or anonymous flow)."""
    print("\n=== G5: Gabung Trip click behavior ===")

    # Capture console for debugging
    console_msgs = []
    page.on('console', lambda msg: console_msgs.append(f"[{msg.type}] {msg.text}"))
    page.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))

    try:
        await page.wait_for_selector('#guestJoinBtn', state='attached', timeout=5000)
        await page.evaluate('''() => {
            const b = document.getElementById('guestJoinBtn');
            if (b) { b.click(); }
        }''')
        await page.wait_for_timeout(4000)
        has_auth = await page.is_visible('#authModal', timeout=3000)
        has_name_form = await page.evaluate('''() => {
            const nf = document.getElementById('guestNameForm');
            return nf ? window.getComputedStyle(nf).display !== 'none' : false;
        }''')

        if has_auth:
            record("G5: Gabung Trip → auth modal (FORCED LOGIN)", True,
                   "auth modal shown — user must login before joining")
        elif has_name_form:
            record("G5: Gabung Trip → name form (ANONYMOUS FLOW)", True,
                   "name form shown — anonymous join, no login required")
        else:
            # Check if guestJoinedView appeared (already a member)
            joined = await page.evaluate('''() => {
                const jv = document.getElementById('guestJoinedView');
                return jv ? window.getComputedStyle(jv).display !== 'none' : false;
            }''')
            if joined:
                record("G5: Gabung Trip → already member (joinedView)", True,
                       "guestJoinedView visible")
            else:
                # Check for alerts
                record("G5: Gabung Trip → unknown behavior", False,
                       f"auth={has_auth}, name_form={has_name_form}, joined={joined}, console={console_msgs[:3]}")
    except Exception as e:
        record("G5: Gabung Trip click", False, str(e)[:150])


async def test_g6_guest_isolation(page):
    """G6: Pre-join guest has no journey/consent UI."""
    print("\n=== G6: Guest isolation (pre-join) ===")
    journey_visible = await page.evaluate('''() => {
        const p = document.getElementById('journeyPanel');
        if (!p) return false;
        return window.getComputedStyle(p).display !== 'none';
    }''')
    banner_visible = await page.evaluate('''() => {
        const b = document.getElementById('consentBanner');
        if (!b) return false;
        return window.getComputedStyle(b).display !== 'none';
    }''')
    start_visible = await page.evaluate('''() => {
        const b = document.getElementById('startJourneyBtn');
        if (!b) return false;
        return window.getComputedStyle(b).display !== 'none';
    }''')
    record("G6: No journey panel for pre-join guest", not journey_visible,
           f"journey visible={journey_visible}")
    record("G6: No consent banner for pre-join guest", not banner_visible,
           f"banner visible={banner_visible}")
    record("G6: No start button for pre-join guest", not start_visible,
           f"start visible={start_visible}")


async def test_g7_participant_count(page):
    """G7: Participant count summary visible."""
    print("\n=== G7: Participant count ===")
    summary = await page.evaluate('''() => {
        const el = document.getElementById('guestParticipantSummary');
        if (!el) return null;
        return el.textContent.trim();
    }''')
    has_count = summary and len(summary) > 0
    record("G7: Participant count shown", has_count,
           f"summary='{summary}'")


async def test_g8_shared_itinerary(page):
    """G8: Shared itinerary section visible to guest (read-only)."""
    print("\n=== G8: Shared itinerary section ===")
    itinerary_ok = await page.evaluate('''() => {
        const el = document.getElementById('guestItineraryList');
        if (!el) return { found: false };
        const has_content = el.textContent.trim().length > 0;
        const empty_state = el.querySelector('.empty');
        return { found: !!el, has_content, has_empty: !!empty_state };
    }''')
    record("G8: Shared itinerary section visible to guest",
           itinerary_ok.get('found') and itinerary_ok.get('has_content'),
           str(itinerary_ok))


async def run_guest_baseline_tests(page):
    """Run the guest baseline tests that don't require an invitation token."""
    print("\n" + "=" * 65)
    print("=== GUEST FLOW BASELINE — No credentials needed ===")
    print("=" * 65)

    await test_g1_invalid_token(page)

    # For G2-G6 we need a real token — try to get one if owner creds available
    if OWNER_EMAIL and OWNER_PASS:
        print(f"\n  Owner creds detected — will attempt full guest E2E after login.")
        # Full flow: login as owner → create trip → create invitation → test guest flow
        # This part is in the full test below
        pass
    else:
        print(f"\n  ⚠️ No owner credentials set (TRIPPI_TEST_OWNER_EMAIL/PASS)")
        print(f"  Cannot create a real invitation for G2-G6 tests.")
        print(f"  G1 (invalid token handling) verified above.")
        print(f"  G2-G8 require an invitation token — these tests are SKIPPED.")


async def run_full_guest_e2e(page_owner, page_guest):
    """Full guest E2E: owner creates trip+invitation → guest tests full flow."""
    print("\n" + "=" * 65)
    print("=== FULL GUEST E2E (owner creates invitation → guest flow) ===")
    print("=" * 65)

    # Step 1: Owner login
    print("\n--- Login as owner ---")
    await page_owner.goto(BASE_URL, wait_until='domcontentloaded')
    await page_owner.wait_for_timeout(3000)

    # Check if auth modal is visible
    modal_visible = await page_owner.is_visible('#authModal', timeout=3000)
    if not modal_visible:
        try:
            await page_owner.click('button:has-text("Masuk"), button:has-text("Login")', timeout=5000)
            await page_owner.wait_for_timeout(1000)
            modal_visible = await page_owner.is_visible('#authModal', timeout=3000)
        except:
            pass

    if not modal_visible:
        print("  ❌ Cannot open auth modal")
        return False

    await page_owner.fill('input[type="email"]', OWNER_EMAIL)
    await page_owner.fill('input[type="password"]', OWNER_PASS)
    try:
        await page_owner.click('#authModal button:has-text("Masuk")', timeout=5000)
    except:
        await page_owner.click('button[type="submit"]', timeout=5000)

    await page_owner.wait_for_timeout(5000)

    # Check login success
    logout_visible = await page_owner.is_visible('#logoutBtn', timeout=5000)
    if not logout_visible:
        print("  ❌ Login failed — check credentials")
        record("G-full: Owner login", False, "auth modal still visible or no logout button")
        return False
    record("G-full: Owner login", True, "logout button visible")

    # Step 2: Create trip
    print("\n--- Owner creates trip ---")
    await page_owner.click('#newTripBtn', timeout=10000)
    await page_owner.wait_for_timeout(2000)

    await page_owner.fill('#tripName', 'M4.5 Guest E2E Baseline')
    await page_owner.fill('#tripDestination', 'Bali')
    today = await page_owner.evaluate('new Date().toISOString().split("T")[0]')
    future = await page_owner.evaluate('new Date(Date.now() + 86400000).toISOString().split("T")[0]')
    await page_owner.fill('#tripStart', today)
    await page_owner.fill('#tripEnd', future)
    await page_owner.click('#newTripSubmit', timeout=5000)
    await page_owner.wait_for_timeout(8000)

    group_id = await page_owner.evaluate('''() => {
        const m = window.location.search.match(/group=([a-f0-9-]+)/i);
        return m ? m[1] : null;
    }''')
    record("G-full: Trip created", group_id is not None, f"group={group_id}")

    if not group_id:
        print("  ❌ Trip creation failed")
        return False

    # Step 3: Create invitation via browser UI (share button)
    print("\n--- Owner creates invitation ---")
    try:
        # Click share button
        await page_owner.click('#shareTrip', timeout=10000)
        await page_owner.wait_for_timeout(3000)

        # The share button should show an invite link or create invitation
        # Check for invitation token in URL or UI
        invite_token = await page_owner.evaluate('''() => {
            // Look for the invitation token in the page
            const el = document.querySelector('[data-gt], .invite-token, #inviteToken');
            if (el) return el.textContent.trim() || el.value;
            // Check URL
            const m = window.location.search.match(/gt=([a-f0-9-]+)/i);
            return m ? m[1] : null;
        }''')

        if not invite_token:
            # Try clicking the share button in group view
            try:
                await page_owner.click('#inviteGroupBtn', timeout=10000)
                await page_owner.wait_for_timeout(3000)
            except:
                pass

            invite_token = await page_owner.evaluate('''() => {
                const m = window.location.search.match(/gt=([a-f0-9-]+)/i);
                return m ? m[1] : null;
            }''')

        # If still no token, try direct RPC via page evaluate
        if not invite_token:
            print("  Trying direct create_invitation RPC...")
            result = await page_owner.evaluate('''async () => {
                const r = await API.createInvitation(window.colState?.group?.id);
                if (r.data && r.data[0]) return r.data[0].token;
                return null;
            }''')
            invite_token = result

        record("G-full: Invitation created", invite_token is not None,
               f"token={str(invite_token)[:16] + '…' if invite_token else 'NO TOKEN'}")

        if not invite_token:
            print("  ❌ Invitation creation failed")
            # Save screenshot for debugging
            await page_owner.screenshot(path="/tmp/owner_trip_state.png")
            print("  Screenshot saved to /tmp/owner_trip_state.png")
            return False

    except Exception as e:
        record("G-full: Invitation created", False, str(e)[:150])
        return False

    # Step 4: Test guest flow with the invitation
    print(f"\n--- Guest opens ?gt={invite_token[:16]}… ---")
    await test_g2_valid_invitation(page_guest, invite_token)
    await page_guest.wait_for_timeout(2000)  # Ensure fully loaded
    await test_g3_nav_lockdown(page_guest)
    await test_g4_join_button(page_guest)
    await test_g4b_no_account_hint(page_guest)
    await test_g7_participant_count(page_guest)
    await test_g8_shared_itinerary(page_guest)
    await test_g6_guest_isolation(page_guest)
    await test_g5_join_click(page_guest)

    return True


async def main():
    print("=== Guest Flow Baseline E2E — Live Production ===")
    print(f"Base URL: {BASE_URL}")
    print(f"Owner email: {OWNER_EMAIL or '(NOT SET)'}")
    print()

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=['--no-sandbox', '--window-size=1400,900--disable-dev-shm-usage']
        )

        # GUEST context (no login)
        ctx_guest = await browser.new_context()
        page_guest = await ctx_guest.new_page()

        # Suppress dialogs on guest page
        page_guest.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))

        # Run baseline tests (no credentials needed)
        await run_guest_baseline_tests(page_guest)

        # If owner creds available, run full guest E2E
        if OWNER_EMAIL and OWNER_PASS:
            ctx_owner = await browser.new_context()
            page_owner = await ctx_owner.new_page()
            page_owner.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))

            success = await run_full_guest_e2e(page_owner, page_guest)
            await ctx_owner.close()
        else:
            # Try to find an existing invitation token from the REST API
            # (only works if someone already created one)
            print("\n  ⚠️ Cannot run full guest E2E without owner credentials.")
            print("  The invite RPCs require an authenticated owner JWT.")

        # Summary
        print("\n" + "=" * 65)
        print("=== GUEST FLOW BASELINE — Results ===")
        print("=" * 65)
        passed = sum(1 for r in RESULTS.values() if r["passed"])
        total = len(RESULTS)
        for name, result in RESULTS.items():
            status = "✅" if result["passed"] else "❌"
            print(f"  {status} {name}: {result['detail']}")
        print(f"\n{'='*65}")
        print(f"Guest Flow Baseline: {passed}/{total} passed")
        if passed == total:
            print("🎉 ALL PASSED — guest flow works as expected")

        await browser.close()
        return 0 if passed == total else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
