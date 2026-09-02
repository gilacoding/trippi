#!/usr/bin/env python3
"""
E2E Guest Flow Baseline — Live Production (marki.cab)
======================================================
Tests the CURRENTLY DEPLOYED guest flow against the live site.
Uses confirmed test identities to create a trip + invitation.

Test scenarios:
  G1. Guest opens ?gt={invalid} → error + redirect to home
  G2. Guest opens ?gt={valid_token} → guestView renders (trip preview + participant count)
  G3. Nav lockdown: back buttons + new trip button hidden for guest
  G4. "Gabung Trip" button visible + labeled with "bergabung"
  G4b. "Tidak perlu akun" subtitle visible (P0.2 marker)
  G4c. Participant count shown (e.g. "1 / 10 orang")
  G5. Gabung Trip click → current deployed behavior (auth modal OR name form)
  G6. Pre-join guest has no journey/consent UI
  G7. Guest can see read-only itinerary section
  GU. Registered user opens same link → Gabung Trip → join with existing account
  GC. Creator sees participant count increase after guest joins
"""
import asyncio, os, sys, json, time
from playwright.async_api import async_playwright

BASE_URL = "https://marki.cab/trip-planner.html"
OWNER_EMAIL = "e2e-guest-baseline@marki.cab"
OWNER_PASS = "Str0ngP@ss99!"
MEMBER_EMAIL = "e2e-member-test@marki.cab"
MEMBER_PASS = "Str0ngP@ss99!"

RESULTS = {}

def record(name, passed, detail=""):
    RESULTS[name] = {"passed": passed, "detail": detail}
    status = "✅" if passed else "❌"
    print(f"  {status} {name}: {detail}")


async def login_via_browser(page, email, password, label="user"):
    """Login via the browser auth UI — DOM-driven."""
    print(f"  Logging in as {label} ({email})...")
    await page.goto(BASE_URL, wait_until='domcontentloaded')
    await page.wait_for_timeout(4000)

    modal_visible = await page.is_visible('#authModal', timeout=3000)
    if not modal_visible:
        try:
            await page.click('button:has-text("Masuk")', timeout=5000)
            await page.wait_for_timeout(1000)
            modal_visible = await page.is_visible('#authModal', timeout=3000)
        except Exception:
            pass

    if not modal_visible:
        # Maybe already logged in
        logout_visible = await page.is_visible('#logoutBtn', timeout=3000)
        if logout_visible:
            print(f"  ✅ {label} already logged in")
            return True
        print(f"  ❌ {label}: Cannot open auth modal")
        return False

    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    try:
        await page.click('#authModal button:has-text("Masuk")', timeout=5000)
    except Exception:
        await page.click('button[type="submit"]', timeout=5000)

    await page.wait_for_timeout(6000)
    logout_visible = await page.is_visible('#logoutBtn', timeout=5000)
    if logout_visible:
        # Extract JWT from localStorage
        owner_jwt = await page.evaluate('''() => {
            const ref = "ishflkcsdzlhhxtanhxf";
            const key = `sb-${ref}-auth-token`;
            const tokenStr = localStorage.getItem(key);
            if (tokenStr) {
                try {
                    const tok = JSON.parse(tokenStr);
                    return tok.access_token || null;
                } catch(e) {}
            }
            // Also check window.MarkiBackend
            if (window.MarkiBackend && window.MarkiBackend.client) {
                // Can't easily get session synchronously, skip
            }
            return null;
        }''')
        print(f"  ✅ {label} logged in (jwt: {owner_jwt[:20] if owner_jwt else 'none'}...)")
        return owner_jwt or True
    else:
        print(f"  ❌ {label} login failed")
        return False


async def create_trip_and_invite(page_owner, owner_jwt):
    """Owner creates a trip + invitation, returns (group_id, token)."""
    print("  Creating trip + invitation...")

    # Navigate to home after login
    await page_owner.goto(BASE_URL, wait_until='domcontentloaded')
    await page_owner.wait_for_timeout(4000)

    # Click "+ Buat trip baru"
    await page_owner.click('#newTripBtn', timeout=10000)
    await page_owner.wait_for_timeout(2000)

    trip_name = f"Guest E2E {int(time.time())}"
    await page_owner.fill('#tripName', trip_name)
    await page_owner.fill('#tripDestination', 'Bali')
    today = await page_owner.evaluate('new Date().toISOString().split("T")[0]')
    future = await page_owner.evaluate('new Date(Date.now() + 86400000).toISOString().split("T")[0]')
    await page_owner.fill('#tripStart', today)
    await page_owner.fill('#tripEnd', future)
    await page_owner.click('#newTripSubmit', timeout=5000)
    await page_owner.wait_for_timeout(10000)

    group_id = await page_owner.evaluate('''() => {
        const m = window.location.search.match(/group=([a-f0-9-]+)/i);
        return m ? m[1] : null;
    }''')

    if not group_id:
        print("  ❌ Trip creation failed — no group ID")
        return None, None

    print(f"  Trip created: group={group_id[:12]}...")

    # Try creating invitation via browser API first
    token = await page_owner.evaluate('''async () => {
        if (!window.colState || !window.colState.group || !window.colState.uid) {
            return null;
        }
        try {
            const r = await API.createInvitation(window.colState.group.id);
            if (r.data && r.data[0]) return r.data[0].token;
            return null;
        } catch(e) {
            return null;
        }
    }''')

    if not token and owner_jwt:
        # Fallback: create invitation via direct REST API
        print("  Browser API invitation failed — using direct REST API...")
        import urllib.request
        SUPABASE_URL = "https://ishflkcsdzlhhxtanhxf.supabase.co"
        SUPABASE_ANON = "sb_publishable_7g_crQO8fm0SVVIdqDU78w_gIglXx8Q"
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/rpc/create_invitation",
            data=json.dumps({"p_group_id": group_id, "p_display_name": None}).encode(),
            headers={"Content-Type": "application/json", "apikey": SUPABASE_ANON, "Authorization": f"Bearer {owner_jwt}"}
        )
        try:
            r = urllib.request.urlopen(req, timeout=15)
            resp = json.loads(r.read())
            if isinstance(resp, list) and len(resp) > 0:
                token = resp[0].get("token")
        except Exception as e:
            print(f"  REST API invitation failed: {e}")

    # Add an agenda item (for guest to see)
    await page_owner.wait_for_timeout(3000)
    try:
        # Click on group view to ensure it's loaded, then add agenda
        await page_owner.click('#groupView .add-panel summary', timeout=10000)
        await page_owner.fill('#groupAgendaTitle', 'Check-in Hotel')
        await page_owner.fill('#groupAgendaTime', '14:00')
        await page_owner.click('#groupAgendaForm button[type="submit"]:not(.secondary)', timeout=10000)
        await page_owner.wait_for_timeout(4000)
        print("  ✅ Agenda item added")
    except Exception as e:
        print(f"  ⚠️  Agenda item add failed (non-blocking): {str(e)[:100]}")

    if token:
        print(f"  ✅ Invitation created: {str(token)[:16]}...")
    else:
        print("  ❌ Invitation creation failed — trying UI share button")
        try:
            await page_owner.click('#shareTrip', timeout=5000)
            await page_owner.wait_for_timeout(2000)
            # Check for the share modal/content
            share_text = await page_owner.evaluate('''() => {
                return document.body.innerText.substring(0, 500);
            }''')
            print(f"  Share button clicked. Page text: {share_text[:100]}")
            # Try to find token in URL
            token = await page_owner.evaluate('''() => {
                const m = window.location.search.match(/gt=([a-f0-9-]+)/i);
                return m ? m[1] : null;
            }''')
            if token:
                print(f"  ✅ Token found in URL: {str(token)[:16]}...")
        except Exception as e:
            print(f"  ❌ UI share also failed: {e}")

    return group_id, token


async def run_guest_tests(page_guest, token):
    """Run all guest flow tests against the live site."""
    print(f"\n--- Guest opens ?gt={str(token)[:16]}... ---")

    await page_guest.goto(f"{BASE_URL}?gt={token}", wait_until='domcontentloaded')
    await page_guest.wait_for_timeout(5000)

    # Capture page state for debugging
    page_state = await page_guest.evaluate('''() => {
        const g = document.getElementById('guestView');
        const gv = document.getElementById('groupView');
        const h = document.getElementById('homeView');
        return {
            guestView_display: g ? getComputedStyle(g).display : 'MISSING',
            groupView_display: gv ? getComputedStyle(gv).display : 'MISSING',
            homeView_display: h ? getComputedStyle(h).display : 'MISSING',
            url: window.location.href,
        };
    }''')
    print(f"  Page state: {json.dumps(page_state)}")

    # G2: Guest view visible
    guestview_visible = await page_guest.evaluate('''() => {
        const g = document.getElementById('guestView');
        return g && window.getComputedStyle(g).display !== 'none';
    }''')
    record("G2: Guest view shown", guestview_visible,
           "guestView visible" if guestview_visible else "BUG: guestView not shown")

    # Trip name
    trip_name = await page_guest.evaluate('''() => {
        const el = document.getElementById('guestTripName');
        return el ? el.textContent.trim() : 'MISSING';
    }''')
    record("G2: Trip name rendered", trip_name != 'MISSING' and len(trip_name) > 0, f"'{trip_name}'")

    # G3: Nav lockdown
    nav_locked = await page_guest.evaluate('''() => {
        const backs = document.querySelectorAll('[data-home]');
        const hidden = Array.from(backs).every(b => window.getComputedStyle(b).display === 'none');
        const newbtn = document.getElementById('newTripBtn');
        const newbtn_hidden = !newbtn || window.getComputedStyle(newbtn).display === 'none';
        return { hidden_backs: hidden, hidden_new: newbtn_hidden, back_count: backs.length };
    }''')
    record("G3: Navigation locked for guest",
           nav_locked.get('hidden_backs') and nav_locked.get('hidden_new'),
           f"backs_hidden={nav_locked.get('hidden_backs')}, newTrip_hidden={nav_locked.get('hidden_new')}")

    # G4: Join button
    join_btn = await page_guest.evaluate('''() => {
        const b = document.getElementById('guestJoinBtn');
        if (!b) return null;
        return { visible: window.getComputedStyle(b).display !== 'none', text: b.textContent.trim() };
    }''')
    btn_visible = join_btn and join_btn.get('visible', False)
    btn_text = join_btn.get('text', '') if join_btn else 'MISSING'
    record("G4: Gabung Trip button shown", btn_visible, f"text='{btn_text}'")
    record("G4: Button label contains 'bergabung'",
           'bergabung' in btn_text.lower() if btn_text != 'MISSING' else False, f"text='{btn_text}'")

    # G4b: "Tidak perlu akun" subtitle (P0.2 marker — should FAIL on live M2 flow)
    full_text = await page_guest.evaluate('''() => {
        const gv = document.getElementById('guestView');
        return gv ? gv.textContent : '';
    }''')
    has_no_account = 'tidak perlu akun' in full_text.lower() or 'tanpa akun' in full_text.lower()
    record("G4b: 'Tidak perlu akun' subtitle present (P0.2 marker)", has_no_account,
           f"hint found={has_no_account}" + ("" if has_no_account else " — NOT present (M2 flow uses login-forced)"))

    # G4c: Participant count
    summary = await page_guest.evaluate('''() => {
        const el = document.getElementById('guestParticipantSummary');
        if (!el) return null;
        return el.textContent.trim();
    }''')
    record("G4c: Participant count shown", summary and len(summary) > 0,
           f"summary='{summary}'")

    # G7: Read-only itinerary section
    itinerary_ok = await page_guest.evaluate('''() => {
        const el = document.getElementById('guestItineraryList');
        if (!el) return { found: false };
        const has_content = el.textContent.trim().length > 0;
        const empty_state = el.querySelector('.empty');
        return { found: !!el, has_content, has_empty: !!empty_state, text: el.textContent.trim().substring(0, 100) };
    }''')
    record("G7: Shared itinerary section visible to guest",
           itinerary_ok.get('found') and itinerary_ok.get('has_content'),
           str(itinerary_ok))

    # G6: No journey/consent UI pre-join
    journey_visible = await page_guest.evaluate('''() => {
        const p = document.getElementById('journeyPanel');
        return p ? window.getComputedStyle(p).display !== 'none' : false;
    }''')
    banner_visible = await page_guest.evaluate('''() => {
        const b = document.getElementById('consentBanner');
        return b ? window.getComputedStyle(b).display !== 'none' : false;
    }''')
    start_visible = await page_guest.evaluate('''() => {
        const b = document.getElementById('startJourneyBtn');
        return b ? window.getComputedStyle(b).display !== 'none' : false;
    }''')
    record("G6: No journey panel for pre-join guest", not journey_visible, f"visible={journey_visible}")
    record("G6: No consent banner for pre-join guest", not banner_visible, f"visible={banner_visible}")
    record("G6: No start button for pre-join guest", not start_visible, f"visible={start_visible}")

    # G5: Click Gabung Trip → observe behavior
    console_msgs = []
    page_guest.on('console', lambda msg: console_msgs.append(f"[{msg.type}] {msg.text}"))

    try:
        await page_guest.wait_for_selector('#guestJoinBtn', state='attached', timeout=5000)
        await page_guest.evaluate('''() => {
            const b = document.getElementById('guestJoinBtn');
            if (b) { b.click(); }
        }''')
        await page_guest.wait_for_timeout(4000)

        has_auth = await page_guest.is_visible('#authModal', timeout=3000)
        has_name_form = await page_guest.evaluate('''() => {
            const nf = document.getElementById('guestNameForm');
            return nf ? window.getComputedStyle(nf).display !== 'none' : false;
        }''')
        has_joined = await page_guest.evaluate('''() => {
            const jv = document.getElementById('guestJoinedView');
            return jv ? window.getComputedStyle(jv).display !== 'none' : false;
        }''')

        if has_auth:
            record("G5: Gabung Trip → auth modal (FORCED LOGIN)", True,
                   "auth modal shown — user must login before joining (M2 flow)")
        elif has_name_form:
            record("G5: Gabung Trip → name form (ANONYMOUS FLOW)", True,
                   "name form shown — anonymous join, no login required (P0.2 flow)")
        elif has_joined:
            record("G5: Gabung Trip → joinedView", True, "already member")
        else:
            record("G5: Gabung Trip → unknown behavior", False,
                   f"auth={has_auth}, name_form={has_name_form}, joined={has_joined}, console={console_msgs[:3]}")
    except Exception as e:
        record("G5: Gabung Trip click", False, str(e)[:150])


async def test_registered_user_join(page_member, token):
    """Registered user opens invite link → Gabung Trip → joins with existing account."""
    print(f"\n--- Registered user opens ?gt={str(token)[:16]}... ---")

    await page_member.goto(f"{BASE_URL}?gt={token}", wait_until='networkidle')
    await page_member.wait_for_timeout(10000)

    # Poll for colState to be ready
    for attempt in range(5):
        colstate = await page_member.evaluate('''() => {
            return window.colState ? {
                uid: window.colState.uid,
                name: window.colState.name,
                group: window.colState.group ? {id: window.colState.group.id} : null
            } : null;
        }''')
        if colstate and colstate.uid:
            print(f"  colState ready after {attempt * 2}s: uid={colstate.uid[:8]}...")
            break
        await page_member.wait_for_timeout(2000)

    # Debug: check member's auth state
    auth_state = await page_member.evaluate('''() => {
        const hasLogout = !!document.getElementById('logoutBtn');
        const logoutDisplay = document.getElementById('logoutBtn') ? 
            window.getComputedStyle(document.getElementById('logoutBtn')).display : 'N/A';
        return {
            hasLogoutBtn: hasLogout,
            logoutDisplay: logoutDisplay,
            uid: window.colState ? window.colState.uid : 'no colState',
            colStateStr: window.colState ? JSON.stringify({uid: window.colState.uid, group: !!window.colState.group, name: window.colState.name}) : 'null'
        };
    }''')
    print(f"  Member auth state: {json.dumps(auth_state)}")

    # Check what registered user sees
    guestview = await page_member.evaluate('''() => {
        const g = document.getElementById('guestView');
        return g ? window.getComputedStyle(g).display !== 'none' : false;
    }''')
    joined = await page_member.evaluate('''() => {
        const jv = document.getElementById('guestJoinedView');
        return jv ? window.getComputedStyle(jv).display !== 'none' : false;
    }''')
    groupview = await page_member.evaluate('''() => {
        const gv = document.getElementById('groupView');
        return gv ? window.getComputedStyle(gv).display !== 'none' : false;
    }''')

    # Check button text
    btn_text = await page_member.evaluate('''() => {
        const b = document.getElementById('guestJoinBtn');
        return b ? b.textContent.trim() : 'MISSING';
    }''')

    print(f"  guestView={guestview}, groupView={groupview}, joinedView={joined}, btn='{btn_text}'")

    record("GU: Registered user opens guest link", guestview or groupview,
           f"guestView={guestview}, groupView={groupview}, joinedView={joined}, btn='{btn_text}'")

    # G5: Click Gabung Trip → observe behavior
    console_msgs = []
    page_member.on('console', lambda msg: console_msgs.append(f"[{msg.type}] {msg.text}"))

    # Also capture any JS errors
    page_errors = []
    page_member.on('pageerror', lambda exc: page_errors.append(str(exc)))

    try:
        await page_member.wait_for_selector('#guestJoinBtn', state='attached', timeout=5000)
        btn_text_before = await page_member.evaluate('''() => {
            const b = document.getElementById('guestJoinBtn');
            return b ? b.textContent.trim() : 'MISSING';
        }''')
        print(f"  Button before click: '{btn_text_before}'")
        print(f"  colState.uid: {await page_member.evaluate('window.colState && window.colState.uid || null')}")

        await page_member.evaluate('''() => {
            const b = document.getElementById('guestJoinBtn');
            if (b) { b.click(); }
        }''')
        await page_member.wait_for_timeout(8000)

        has_auth = await page_member.is_visible('#authModal', timeout=3000)
        has_name_form = await page_member.evaluate('''() => {
            const nf = document.getElementById('guestNameForm');
            return nf ? window.getComputedStyle(nf).display !== 'none' : false;
        }''')
        joined = await page_member.evaluate('''() => {
            const jv = document.getElementById('guestJoinedView');
            return jv ? window.getComputedStyle(jv).display !== 'none' : false;
        }''')
        groupview = await page_member.evaluate('''() => {
            const gv = document.getElementById('groupView');
            return gv ? window.getComputedStyle(gv).display !== 'none' : false;
        }''')
        guestview_after = await page_member.evaluate('''() => {
            const g = document.getElementById('guestView');
            return g ? window.getComputedStyle(g).display !== 'none' : false;
        }''')

        print(f"  Console msgs: {console_msgs[:5]}")
        print(f"  Page errors: {page_errors[:5]}")
        print(f"  After click: auth={has_auth}, name_form={has_name_form}, joined={joined}, groupview={groupview}, guestView={guestview_after}")

        if joined or groupview:
            record("GU: Registered user → joined (auto-redeem)", True,
                   f"groupView={groupview}, joinedView={joined}, guestView={guestview_after}")
            # Verify itinerary
            itinerary = await page_member.evaluate('''() => {
                const el = document.getElementById('guestItineraryList');
                if (!el) return { found: false };
                return { found: true, text: el.textContent.trim().substring(0, 100) };
            }''')
            record("GU: Joined member sees full itinerary",
                   itinerary.get('found') and len(itinerary.get('text', '')) > 0,
                   str(itinerary))
        elif has_name_form:
            record("GU: Registered user → name form appeared", True,
                   "name form shown — unexpected for registered user")
            await page_member.fill('#guestNameInput', 'Registered Member')
            await page_member.click('#guestNameSubmit', timeout=5000)
            await page_member.wait_for_timeout(6000)
            joined_after = await page_member.evaluate('''() => {
                const jv = document.getElementById('guestJoinedView');
                return jv ? window.getComputedStyle(jv).display !== 'none' : false;
            }''')
            record("GU: Name submitted → joined", joined_after,
                   "guestJoinedView visible" if joined_after else "join failed")
        elif has_auth:
            record("GU: Registered user → auth modal", True,
                   "auth modal shown — login required before join (M2 flow)")
        else:
            record("GU: Registered user join flow", False,
                   f"auth={has_auth}, name_form={has_name_form}, joined={joined}, groupview={groupview}, console={console_msgs[:2]}")
    except Exception as e:
        record("GU: Registered user join", False, str(e)[:150])



async def main():
    print("=== Guest Flow E2E — Live Production (marki.cab) ===")
    print(f"Base URL: {BASE_URL}")
    print(f"Owner: {OWNER_EMAIL}")
    print(f"Member: {MEMBER_EMAIL}")
    print()

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=['--no-sandbox', '--window-size=1400,900']
        )

        # OWNER context
        ctx_owner = await browser.new_context()
        page_owner = await ctx_owner.new_page()
        page_owner.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))

        # GUEST context (no login)
        ctx_guest = await browser.new_context()
        page_guest = await ctx_guest.new_page()
        page_guest.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))

        # MEMBER context (registered user)
        ctx_member = await browser.new_context()
        page_member = await ctx_member.new_page()
        page_member.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))

        # G1: Invalid token (no credentials needed)
        print("=== G1: Invalid token (no auth needed) ===")
        await page_guest.goto(f"{BASE_URL}?gt=invalid-token-12345", wait_until='domcontentloaded')
        await page_guest.wait_for_timeout(3000)

        guest_visible = await page_guest.evaluate('''() => {
            const g = document.getElementById('guestView');
            return g && window.getComputedStyle(g).display !== 'none';
        }''')
        home_visible = await page_guest.evaluate('''() => {
            const h = document.getElementById('homeView');
            return h ? window.getComputedStyle(h).display !== 'none' : false;
        }''')
        record("G1: Invalid token → not on guestView", not guest_visible, f"guestView={guest_visible}")
        record("G1: Invalid token → on homeView", home_visible, f"homeView={home_visible}")

        # --- STEP 1: Owner login ---
        print("\n=== STEP 1: Owner Login ===")
        owner_jwt = await login_via_browser(page_owner, OWNER_EMAIL, OWNER_PASS, "owner")
        if not owner_jwt:
            print("❌ Owner login failed — cannot proceed with full guest E2E")
            # Only G1 passed
            print(f"\n{'='*65}")
            print(f"Guest Flow E2E: {sum(1 for r in RESULTS.values() if r['passed'])}/{len(RESULTS)} passed")
            await browser.close()
            return 1
        record("S1: Owner login", True, "authenticated")

        # --- STEP 2: Create trip + invitation ---
        print("\n=== STEP 2: Create trip + invitation ===")
        group_id, token = await create_trip_and_invite(page_owner, owner_jwt)
        if not token:
            print("❌ Cannot create invitation — cannot proceed with G2-G8")
            print(f"\n{'='*65}")
            print(f"Guest Flow E2E: {sum(1 for r in RESULTS.values() if r['passed'])}/{len(RESULTS)} passed")
            await browser.close()
            return 1
        record("S2: Trip + invitation created", True, f"group={str(group_id)[:12]}..., token={str(token)[:16]}...")

        # --- STEP 3: Guest flow (unauthenticated) ---
        print("\n=== STEP 3: Guest Flow (unauthenticated) ===")
        await run_guest_tests(page_guest, token)

        # --- STEP 4: Registered user join ---
        print("\n=== STEP 4: Registered User Join ===")
        # Log in member FIRST, then open the guest link (so pendingGuestToken + colState.uid are both set)
        member_jwt = await login_via_browser(page_member, MEMBER_EMAIL, MEMBER_PASS, "member")
        if not member_jwt:
            record("GU: Member login", False, "login failed")
        else:
            record("GU: Member login", True, "authenticated")
            await test_registered_user_join(page_member, token)

        # --- STEP 5: Creator verification ---
        print("\n=== STEP 5: Creator verification ===")
        # Check member count via RPC through owner's page
        member_count = await page_owner.evaluate('''async () => {
            if (!window.colState || !window.colState.group) return null;
            const r = await API.listMyGroups();
            if (r.data) {
                const g = r.data.find(g => g.id === window.colState.group.id);
                return g ? g.member_count : null;
            }
            return null;
        }''')

        # Fallback: direct REST API check for member_count
        if member_count is None and owner_jwt:
            import urllib.request
            SUPABASE_URL = "https://ishflkcsdzlhhxtanhxf.supabase.co"
            SUPABASE_ANON = "sb_publishable_7g_crQO8fm0SVVIdqDU78w_gIglXx8Q"
            req = urllib.request.Request(
                f"{SUPABASE_URL}/rest/v1/rpc/list_my_groups",
                data=json.dumps({}).encode(),
                headers={"Content-Type": "application/json", "apikey": SUPABASE_ANON, "Authorization": f"Bearer {owner_jwt}"}
            )
            try:
                r = urllib.request.urlopen(req, timeout=15)
                resp = json.loads(r.read())
                for g in resp:
                    if g.get("id") == group_id:
                        member_count = g.get("member_count")
                        break
            except Exception as e:
                print(f"  REST API member_count failed: {e}")

        record("GC: Participant count after join", member_count is not None and member_count >= 2,
               f"member_count={member_count} (need ≥2)")

        # --- Summary ---
        print("\n" + "=" * 65)
        print("=== GUEST FLOW E2E — Results ===")
        print("=" * 65)
        passed = sum(1 for r in RESULTS.values() if r["passed"])
        total = len(RESULTS)
        for name, result in RESULTS.items():
            status = "✅" if result["passed"] else "❌"
            print(f"  {status} {name}: {result['detail']}")
        print(f"\n{'='*65}")
        print(f"Guest Flow E2E: {passed}/{total} passed")

        if passed == total:
            print("🎉 ALL PASSED")
        elif passed >= total * 0.8:
            print("⚠️  PARTIAL — core flows work, some expectations not met")
        else:
            print("❌ FAILURES — key guest flow scenarios broken")

        await browser.close()
        return 0 if passed == total else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
