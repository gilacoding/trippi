"""Guest Trip UI revision — acceptance test.

Covers the locked criteria: branding, canonical identity (no role words used as
names, no duplicates after realtime), Peserta removed / Crew as the only member
list, creator-parity itinerary layout, guest Group Wishlist (add but never
convert), informative map, Indonesian consent copy, idempotent re-render,
creator-only edit, and guest leave removing the membership row.
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("TRIPPI_BASE_URL", "http://localhost:8080")
OWNER_EMAIL = os.environ["TRIPPI_TEST_OWNER_EMAIL"]
OWNER_PASS = os.environ["TRIPPI_TEST_OWNER_PASS"]

BANNED = ["Creator", "Guest", "anggota", "member", "kamu"]

results = []


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
    await page.wait_for_timeout(3500)


async def open_journey(page):
    await page.evaluate(
        """() => document.querySelectorAll('.view-tab')
            .forEach(t => { if (t.textContent.trim() === 'Journey Mode') t.click(); })"""
    )
    await page.wait_for_timeout(2500)


async def crew_rows(page):
    return await page.evaluate(
        """() => Array.from(document.querySelectorAll('#crewStatusList .to-go-item'))
            .map(r => r.innerText.replace(/\\s+/g, ' ').trim())"""
    )


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        octx = await browser.new_context(
            permissions=["geolocation"],
            geolocation={"latitude": -6.2000, "longitude": 106.8166},
        )
        op = await octx.new_page()
        await op.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await op.wait_for_timeout(700)

        # ---------- branding ----------
        brand = await op.evaluate(
            """() => ({
                title: document.title,
                body: document.body.innerText,
            })"""
        )
        record("brand: MarkiCab present", "MarkiCab" in brand["title"] or "MarkiCab" in brand["body"], brand["title"])
        record("brand: no Trippi/Trippy in visible text",
               "Trippi" not in brand["body"] and "Trippy" not in brand["body"])
        record("brand: no wrong domain", "markicab.com" not in brand["body"] and "trippi." not in brand["body"])

        # creator identity is a real name, set before creating the trip
        await op.evaluate("() => localStorage.setItem('trippi_display_name', 'Ras')")
        await login(op, OWNER_EMAIL, OWNER_PASS)

        made = await op.evaluate(
            """async () => {
                const g = await window.TrippiAPI.createGroup({
                    name: 'Guest UI ' + Date.now(), destination: 'Nigeria',
                    start_date: '2026-08-26', end_date: '2026-08-27', display_name: 'Ras'});
                if (g.error) return { error: String(g.error.message || g.error) };
                const gid = g.data.id;
                await window.TrippiAPI.addItem({group_id: gid, title: 'Hura-hura',
                    date: '2026-08-26', time: '17:00', budget: 150000});
                await window.TrippiAPI.addItem({group_id: gid, title: 'Kemana aja',
                    date: '2026-08-27', time: '08:00', budget: 500000});
                return { id: gid, name: g.data.name };
            }"""
        )
        if made.get("error"):
            record("owner: create trip", False, made["error"])
            summary_and_exit()
        record("owner: create trip", True, made["name"])
        gid = made["id"]

        await op.evaluate("(id) => openGroup(id, false)", gid)
        await op.wait_for_timeout(3000)

        # ---------- creator-only edit ----------
        edit = await op.evaluate(
            """() => {
                const b = document.getElementById('editGroupBtn');
                return { exists: !!b, visible: !!b && getComputedStyle(b).display !== 'none' };
            }"""
        )
        record("creator: Edit trip button visible", edit["visible"], edit)

        renamed = await op.evaluate(
            """async (gid) => {
                const r = await window.TrippiAPI.updateGroup(gid, {name: 'Guest UI Renamed'});
                if (r.error) return { error: String(r.error.message || r.error) };
                return { name: r.data && r.data.name };
            }""",
            gid,
        )
        record("creator: can edit trip fields", renamed.get("name") == "Guest UI Renamed", renamed)

        # start the journey so the guest sees the full Journey Mode surface
        await open_journey(op)
        await op.evaluate("() => { const b = document.getElementById('startJourneyBtn'); if (b) b.click(); }")
        await op.wait_for_timeout(4000)
        await open_journey(op)
        await op.evaluate("() => { const b = document.getElementById('shareLocationBtn'); if (b) b.click(); }")
        await op.wait_for_timeout(5000)

        # ---------- guest joins ----------
        inv = await op.evaluate(
            """async (gid) => {
                const r = await window.TrippiAPI.createInvitation(gid);
                return r.data;
            }""",
            gid,
        )
        d = inv[0] if isinstance(inv, list) else inv
        token = d.get("token") if isinstance(d, dict) else d
        record("guest: invitation created", bool(token), str(token)[:12])

        gctx = await browser.new_context(
            permissions=["geolocation"],
            geolocation={"latitude": -6.2100, "longitude": 106.8300},
        )
        gp = await gctx.new_page()
        await gp.goto(f"{BASE}/trip-planner.html?gt={token}", wait_until="networkidle")
        await gp.wait_for_timeout(2000)
        await gp.evaluate("() => { const b = document.getElementById('guestJoinBtn'); if (b) b.click(); }")
        await gp.wait_for_timeout(1200)
        await gp.fill("#guestNameInput", "Budi")
        await gp.click("#guestNameSubmit")
        await gp.wait_for_timeout(8000)

        # ---------- header hierarchy, no invented capacity ----------
        head = await gp.evaluate(
            """() => ({
                name: (document.getElementById('guestTripName') || {}).textContent || '',
                meta: (document.getElementById('guestTripMeta') || {}).textContent || '',
                summary: (document.getElementById('guestParticipantSummary') || {}).innerText || '',
            })"""
        )
        record("header: trip name shown", bool(head["name"].strip()), head["name"])
        record("header: destination + dates + duration", "Nigeria" in head["meta"] and "hari" in head["meta"], head["meta"])
        record("header: no invented capacity number", "/ 10" not in head["summary"], head["summary"].strip())

        # ---------- Peserta removed, Crew is the only list ----------
        lists = await gp.evaluate(
            """() => ({
                pesertaHeading: document.body.innerText.indexOf('Peserta') !== -1,
                oldList: !!document.getElementById('guestParticipantList'),
                crewList: !!document.getElementById('crewStatusList'),
            })"""
        )
        record("Peserta section removed", not lists["pesertaHeading"] and not lists["oldList"], lists)
        record("Crew is the member list", lists["crewList"], lists["crewList"])

        # ---------- itinerary parity + read-only ----------
        itin = await gp.evaluate(
            """() => {
                const el = document.getElementById('guestItineraryList');
                return {
                    dayHeads: el.querySelectorAll('.section-head').length,
                    cards: el.querySelectorAll('article.item').length,
                    times: Array.from(el.querySelectorAll('.item-time')).map(t => t.textContent.trim()),
                    titles: Array.from(el.querySelectorAll('.item-title')).map(t => t.textContent.trim()),
                    costs: el.querySelectorAll('.item-cost').length,
                    editControls: el.querySelectorAll('[data-gtime],[data-gcost],[data-gdel],.delete-item').length,
                };
            }"""
        )
        record("itinerary: grouped by day", itin["dayHeads"] >= 2, f"dayHeads={itin['dayHeads']}")
        record("itinerary: card layout like creator", itin["cards"] == 2, f"cards={itin['cards']}")
        record("itinerary: time prominent", "17:00" in itin["times"] and "08:00" in itin["times"], itin["times"])
        record("itinerary: titles rendered", "Hura-hura" in itin["titles"], itin["titles"])
        record("itinerary: cost shown", itin["costs"] >= 2, f"costs={itin['costs']}")
        record("itinerary: guest read-only", itin["editControls"] == 0, f"controls={itin['editControls']}")

        # ---------- guest Group Wishlist ----------
        wl = await gp.evaluate(
            """() => ({
                section: document.body.innerText.indexOf('Wishlist Grup') !== -1,
                list: !!document.getElementById('guestWishList'),
                addPanel: !!document.getElementById('guestWishlistPanel'),
                convertBtn: document.querySelectorAll('[data-convert]').length,
            })"""
        )
        record("wishlist: section present for guest", wl["section"] and wl["list"], wl)
        record("wishlist: guest has add form", wl["addPanel"])
        record("wishlist: guest has NO Add to Itin", wl["convertBtn"] == 0, f"convert={wl['convertBtn']}")

        await gp.evaluate("() => { const p = document.getElementById('guestWishlistPanel'); if (p) p.open = true; }")
        await gp.wait_for_timeout(600)
        await gp.fill("#guestWishlistTitle", "Museum Nasional")
        await gp.fill("#guestWishlistNote", "Wajib mampir kalau sempat")
        await gp.click("#guestWishlistForm button[type='submit']")
        await gp.wait_for_timeout(4000)

        wl2 = await gp.evaluate(
            """() => {
                const el = document.getElementById('guestWishList');
                const txt = el ? el.innerText : '';
                return {
                    items: el ? el.querySelectorAll('.to-go-item').length : 0,
                    hasTitle: txt.indexOf('Museum Nasional') !== -1,
                    suggested: txt.indexOf('Disarankan oleh Budi') !== -1,
                    convertBtn: document.querySelectorAll('[data-convert]').length,
                };
            }"""
        )
        record("wishlist: guest can add", wl2["items"] > 0 and wl2["hasTitle"], wl2)
        record("wishlist: attributed to real name", wl2["suggested"], wl2["suggested"])
        record("wishlist: still no convert for guest", wl2["convertBtn"] == 0)

        # creator sees it and CAN convert (reopen so the wishlist reloads)
        await op.evaluate("(id) => openGroup(id, false)", gid)
        await op.wait_for_timeout(3000)
        await op.evaluate(
            """() => document.querySelectorAll('.view-tab')
                .forEach(t => { if (t.textContent.trim() === 'Wishlist') t.click(); })"""
        )
        await op.wait_for_timeout(3000)
        cwl = await op.evaluate(
            """() => ({
                text: (document.getElementById('groupWishList') || {}).innerText || '',
                convert: document.querySelectorAll('[data-convert]').length,
            })"""
        )
        record("wishlist: creator sees guest item", "Museum Nasional" in cwl["text"], cwl["text"][:60])
        record("wishlist: creator CAN Add to Itin", cwl["convert"] > 0, f"convert={cwl['convert']}")

        # ---------- consent copy (guest) ----------
        consent = await gp.evaluate(
            """() => {
                const b = document.getElementById('consentBanner');
                return { text: b ? b.innerText : '', stop: !!document.getElementById('stopSharingBtn') };
            }"""
        )
        record("consent: Indonesian copy or already sharing",
               ("Bagikan lokasi kamu ke grup?" in consent["text"]) or consent["stop"], consent["text"][:70])
        record("consent: no English copy", "Share my location" not in consent["text"])

        # ---------- guest consents, then identity + map + idempotency ----------
        await gp.evaluate("() => { const b = document.getElementById('shareLocationBtn'); if (b) b.click(); }")
        await gp.wait_for_timeout(6000)

        rows = await crew_rows(gp)
        record("crew: real names shown", any("Budi" in r for r in rows) and any("Ras" in r for r in rows), rows)
        offenders = [r for r in rows if any(r.split(" ")[1:2] == [b] for b in BANNED)]
        record("crew: no role word used as a name", not offenders, offenders or rows)
        # Role must be present as its own metadata column, never as the name.
        # NOTE: group_members stores an anonymous guest with role='member', so the
        # correct expectation is "owner reads Trip Creator, everyone else reads a
        # role label that is not their name" — not a literal 'Guest' badge.
        record("crew: role is separate metadata",
               any("Trip Creator" in r for r in rows)
               and all(("Trip Creator" in r) or ("Member" in r) or ("Guest" in r) for r in rows),
               rows)
        record("crew: 3-state status present",
               any("Online" in r or "Offline" in r or "Tidak berbagi" in r for r in rows), rows)

        mp = await gp.evaluate(
            """() => {
                const map = document.getElementById('crewMap');
                const empty = document.getElementById('crewEmpty');
                return {
                    mapVisible: !!map && getComputedStyle(map).display !== 'none',
                    pins: document.querySelectorAll('#crewMap .crew-pin').length,
                    labels: Array.from(document.querySelectorAll('#crewMap .crew-pin b')).map(b => b.textContent.trim()),
                    emptyText: empty ? empty.textContent.trim() : '',
                    emptyShown: !!empty && getComputedStyle(empty).display !== 'none',
                };
            }"""
        )
        record("map: visible with markers, not an empty box", mp["mapVisible"] and mp["pins"] > 0, mp)
        record("map: markers labelled with canonical names",
               any("Budi" in l for l in mp["labels"]), mp["labels"])
        record("map: informative empty state when nothing shared",
               (not mp["emptyShown"]) or mp["emptyText"].startswith("Belum ada lokasi"), mp["emptyText"])

        # idempotency: refresh twice, DOM must not grow or duplicate
        before = await gp.evaluate(
            """() => ({
                crew: document.querySelectorAll('#crewStatusList .to-go-item').length,
                pins: document.querySelectorAll('#crewMap .crew-pin').length,
                wish: document.querySelectorAll('#guestWishList .to-go-item').length,
                itin: document.querySelectorAll('#guestItineraryList article.item').length,
            })"""
        )
        await gp.evaluate("async () => { await loadCrewMap(); await loadCrewMap(); await renderGuestWishlist(); }")
        await gp.wait_for_timeout(2500)
        after = await gp.evaluate(
            """() => ({
                crew: document.querySelectorAll('#crewStatusList .to-go-item').length,
                pins: document.querySelectorAll('#crewMap .crew-pin').length,
                wish: document.querySelectorAll('#guestWishList .to-go-item').length,
                itin: document.querySelectorAll('#guestItineraryList article.item').length,
            })"""
        )
        record("idempotent: crew rows not duplicated", before["crew"] == after["crew"], f"{before['crew']} -> {after['crew']}")
        record("idempotent: markers not duplicated", before["pins"] == after["pins"], f"{before['pins']} -> {after['pins']}")
        record("idempotent: wishlist not duplicated", before["wish"] == after["wish"], f"{before['wish']} -> {after['wish']}")
        record("idempotent: itinerary not duplicated", before["itin"] == after["itin"], f"{before['itin']} -> {after['itin']}")

        names_after = await crew_rows(gp)
        dup = len(names_after) != len(set(names_after))
        record("idempotent: no duplicate names after refresh", not dup, names_after)

        # ---------- guest leaves: membership row must disappear ----------
        members_before = await op.evaluate(
            """async (gid) => {
                const r = await window.TrippiAPI.getMembers(gid);
                return (r.data || []).map(m => m.display_name);
            }""",
            gid,
        )
        record("leave: guest listed before leaving", "Budi" in members_before, members_before)

        await gp.evaluate("() => { window.confirm = () => true; }")
        await gp.evaluate("() => { const b = document.getElementById('guestLeaveBtn'); if (b) b.click(); }")
        await gp.wait_for_timeout(5000)

        members_after = await op.evaluate(
            """async (gid) => {
                const r = await window.TrippiAPI.getMembers(gid);
                return (r.data || []).map(m => m.display_name);
            }""",
            gid,
        )
        record("leave: guest button exists and worked", "Budi" not in members_after, members_after)
        record("leave: creator still a member", "Ras" in members_after, members_after)

        for ctx in (octx, gctx):
            await ctx.close()
        await browser.close()

    summary_and_exit()


def summary_and_exit():
    print("\n" + "=" * 58)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"GUEST UI REVISION: {passed}/{len(results)} PASS")
    print("=" * 58)
    for n, ok, d in results:
        if not ok:
            print(f"  FAILED: {n} | {d}")
    sys.exit(0 if passed == len(results) else 1)


asyncio.run(main())
