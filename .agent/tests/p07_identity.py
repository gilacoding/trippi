"""P0.7 Identity Cleanup — acceptance test.

Proves the identity contract on live data:
  profiles is canonical per user, group_members.display_name is a legacy per-trip
  snapshot, a placeholder never becomes a name, and name / role / status stay
  separate in every renderer.

No reload is used to make anything pass.
"""
import asyncio, os, sys, json
from playwright.async_api import async_playwright

BASE = os.environ.get("TRIPPI_BASE_URL", "http://localhost:8080")
OWNER_EMAIL = os.environ["TRIPPI_TEST_OWNER_EMAIL"]
OWNER_PASS = os.environ["TRIPPI_TEST_OWNER_PASS"]

BANNED = ["Creator", "Owner", "Guest", "TestOwner", "Member", "anggota", "kamu",
          "User", "Anonymous", "Tanpa nama"]

results = []
js_errors = []


def record(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(detail)) if detail else ""))


async def login(page, email, pw):
    await page.evaluate("() => document.querySelector('#newTripBtn').click()")
    await page.wait_for_timeout(500)
    await page.locator("#authModal").first.wait_for(state="visible", timeout=15000)
    if "Daftar" in (await page.locator("#authTitle").text_content()):
        await page.locator("#authToggle").click()
        await page.wait_for_timeout(200)
    await page.fill("#authEmail", email)
    await page.fill("#authPassword", pw)
    await page.locator("#authSubmit").click()
    await page.wait_for_timeout(4500)


async def crew_rows(page):
    return await page.evaluate(
        """() => Array.from(document.querySelectorAll('#crewStatusList .to-go-item'))
            .map(r => r.innerText.replace(/\\s+/g, ' ').trim())"""
    )


def name_is_role_word(row):
    """A row like '🟢 Creator Trip Creator · Online' means a role word became the name."""
    parts = row.split(" ")
    return len(parts) > 1 and parts[1] in BANNED


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        octx = await browser.new_context(
            permissions=["geolocation"], geolocation={"latitude": -6.2088, "longitude": 106.8456})
        op = await octx.new_page()
        op.on("pageerror", lambda e: js_errors.append(f"creator: {e}"))
        await op.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await op.wait_for_timeout(700)
        await login(op, OWNER_EMAIL, OWNER_PASS)

        # ---------- profile auto-created, canonical, no placeholder ----------
        prof = await op.evaluate(
            """async () => {
                const r = await window.MarkiAPI.ensureProfile(null);
                return r.error ? { error: String(r.error.message || r.error) } : r.data;
            }"""
        )
        record("PROFILE auto-created on sign-in", bool(prof and prof.get("id")), prof)
        record("PROFILE name is canonical, not a placeholder",
               prof.get("display_name") not in BANNED and bool(prof.get("display_name")),
               prof.get("display_name"))
        record("PROFILE carries no email column", "email" not in (prof or {}), sorted((prof or {}).keys()))

        # a user with 4 conflicting per-trip names collapses to ONE canonical name
        record("PROFILE collapses conflicting per-trip names",
               prof.get("display_name") == "Ras", prof.get("display_name"))

        # explicit rename applies; a placeholder rename is refused
        renamed = await op.evaluate(
            """async () => {
                const a = await window.MarkiAPI.updateMyProfile('Ras');
                const b = await window.MarkiAPI.ensureProfile('Creator');
                return { after_rename: a.data && a.data.display_name,
                         after_placeholder: b.data && b.data.display_name };
            }"""
        )
        record("PROFILE explicit rename honoured", renamed["after_rename"] == "Ras", renamed)
        record("PROFILE placeholder rename REFUSED",
               renamed["after_placeholder"] == "Ras", renamed)

        # repeated ensure_profile must not downgrade to an email prefix
        stable = await op.evaluate(
            """async () => {
                for (let i = 0; i < 4; i++) { await window.MarkiAPI.ensureProfile(null); }
                const r = await window.MarkiAPI.ensureProfile(null);
                return r.data && r.data.display_name;
            }"""
        )
        record("PROFILE idempotent — no downgrade on repeat login", stable == "Ras", stable)

        # ---------- trip with itinerary + wishlist for attribution checks ----------
        made = await op.evaluate(
            """async () => {
                const g = await window.MarkiAPI.createGroup({
                    name: 'P07 ' + Date.now(), destination: 'Bandung',
                    start_date: '2026-09-01', end_date: '2026-09-02', display_name: 'Ras'});
                if (g.error) return { error: String(g.error.message || g.error) };
                const gid = g.data.id;
                await window.MarkiAPI.addItem({group_id: gid, title: 'Sarapan',
                    date: '2026-09-01', time: '08:00', budget: 50000});
                await window.MarkiAPI.addWishlistItem(gid, 'IdeCreator', null, null);
                const inv = await window.MarkiAPI.createInvitation(gid);
                const d = Array.isArray(inv.data) ? inv.data[0] : inv.data;
                return { id: gid, token: (d && d.token) || d };
            }"""
        )
        if made.get("error"):
            record("setup trip", False, made["error"])
            summary_and_exit()
        gid, token = made["id"], made["token"]
        record("setup trip + invitation", True)

        await op.evaluate("(id) => openGroup(id, false)", gid)
        await op.wait_for_timeout(3500)

        # ---------- resolver output shape ----------
        ident = await op.evaluate("() => resolveIdentity(colState.uid)")
        record("RESOLVER returns id/name/role/isGuest/status",
               all(k in ident for k in ("id", "name", "role", "isGuest", "status")), ident)
        record("RESOLVER creator name is the account name", ident["name"] == "Ras", ident)
        record("RESOLVER creator role is 'Trip Creator'", ident["role"] == "Trip Creator", ident)
        record("RESOLVER role is NOT part of the name",
               ident["name"] not in BANNED and ident["role"] not in (ident["name"],), ident)

        # ---------- guest joins with its own name ----------
        gctx = await browser.new_context(
            permissions=["geolocation"], geolocation={"latitude": -6.2100, "longitude": 106.8300})
        gp = await gctx.new_page()
        gp.on("pageerror", lambda e: js_errors.append(f"guest: {e}"))
        await gp.goto(f"{BASE}/trip-planner.html?gt={token}", wait_until="networkidle")
        await gp.wait_for_timeout(2000)
        await gp.evaluate("() => { const b = document.getElementById('guestJoinBtn'); if (b) b.click(); }")
        await gp.wait_for_timeout(1000)
        await gp.fill("#guestNameInput", "Budi")
        await gp.click("#guestNameSubmit")
        await gp.wait_for_timeout(8000)
        await gp.evaluate("async () => { await API.addWishlistItem(colState.group.id, 'IdeGuest', null, null); }")
        await gp.wait_for_timeout(3000)

        # ---------- Crew: name / role / status separated, no duplicates ----------
        await op.evaluate(
            """() => document.querySelectorAll('.view-tab')
                .forEach(t => { if (t.textContent.trim() === 'Journey Mode') t.click(); })"""
        )
        await op.wait_for_timeout(2000)
        await op.evaluate("() => { const b = document.getElementById('startJourneyBtn'); if (b) b.click(); }")
        await op.wait_for_timeout(4000)
        await op.evaluate("() => { const b = document.getElementById('shareLocationBtn'); if (b) b.click(); }")
        await op.wait_for_timeout(5000)

        rows = await crew_rows(op)
        record("CREW shows the creator's real name", any("Ras" in r for r in rows), rows)
        record("CREW shows the guest's join name", any("Budi" in r for r in rows), rows)
        record("CREW no role word used as a name",
               not any(name_is_role_word(r) for r in rows), rows)
        record("CREW creator labelled 'Trip Creator'",
               any("Trip Creator" in r for r in rows), rows)
        record("CREW guest labelled 'Guest' (role, not name)",
               any("Guest" in r and "Budi" in r for r in rows), rows)
        record("CREW status is separate metadata",
               any(("Online" in r or "Offline" in r or "Tidak berbagi" in r) for r in rows), rows)
        record("CREW one row per person", len(rows) == len(set(rows)) and len(rows) == 2, rows)

        # ---------- attribution: itinerary + wishlist ----------
        attrib = await op.evaluate(
            """() => {
                const itin = (document.getElementById('groupItineraryList') || {}).innerText || '';
                return { itinerary: itin };
            }"""
        )
        record("ITINERARY attribution uses a real name, not a uuid",
               "Ras" in attrib["itinerary"] and "-" * 4 not in attrib["itinerary"],
               attrib["itinerary"][:90])

        await op.evaluate(
            """() => document.querySelectorAll('.view-tab')
                .forEach(t => { if (t.textContent.trim() === 'Wishlist') t.click(); })"""
        )
        await op.wait_for_timeout(3000)
        wl = await op.evaluate("() => (document.getElementById('groupWishList')||{}).innerText || ''")
        record("WISHLIST attribution shows the guest's real name",
               "Budi" in wl, wl[:120])
        record("WISHLIST attribution has no placeholder",
               not any(f"oleh {b}" in wl for b in BANNED), wl[:120])

        # ---------- guest side sees the same canonical names ----------
        g_rows = await crew_rows(gp)
        record("GUEST view resolves the creator's real name",
               any("Ras" in r for r in g_rows), g_rows)
        record("GUEST view has no placeholder name",
               not any(name_is_role_word(r) for r in g_rows), g_rows)

        # ---------- permission: guest cannot read the whole profiles table ----------
        scope = await gp.evaluate(
            """async () => {
                const sb = window.MarkiAPI._getSb();
                const all = await sb.from('profiles').select('id');
                return { visible: (all.data || []).length, err: all.error ? all.error.message : null };
            }"""
        )
        record("PERMISSION guest cannot browse all profiles",
               scope["visible"] <= 2, scope)

        # ---------- no duplicate identity after churn ----------
        before = await crew_rows(op)
        await op.evaluate(
            """async () => {
                window.dispatchEvent(new Event('focus'));
                document.dispatchEvent(new Event('visibilitychange'));
                await loadIdentities(colState.group.id);
                await loadIdentities(colState.group.id);
                await reconcileTrip('identity-churn');
                renderCrewStatusList();
                renderCrewStatusList();
            }"""
        )
        await op.wait_for_timeout(3000)
        after = await crew_rows(op)
        record("NO DUPLICATE identity rows after churn",
               len(after) == len(before) and len(after) == len(set(after)), f"{before} -> {after}")
        record("NAMES stable after churn", sorted(after) == sorted(before), f"{before} -> {after}")

        await op.evaluate("() => { const b = document.getElementById('endJourneyBtn'); if (b) b.click(); }")
        await op.wait_for_timeout(2000)

        record("no uncaught JavaScript errors", not js_errors, js_errors[:3])

        for ctx in (octx, gctx):
            await ctx.close()
        await browser.close()

    summary_and_exit()


def summary_and_exit():
    print("\n" + "=" * 62)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"P0.7 IDENTITY CLEANUP: {passed}/{len(results)} PASS")
    print("=" * 62)
    for n, ok, d in results:
        if not ok:
            print(f"  FAILED: {n} | {d}")
    sys.exit(0 if passed == len(results) else 1)


asyncio.run(main())
