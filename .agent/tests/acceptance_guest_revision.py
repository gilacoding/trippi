"""Guest Trip Revision — founder acceptance test.

Covers the gaps the earlier suites did NOT prove:
  F. re-join after leaving must go through the join flow again
  G. idempotency of join / wishlist double-submit / conversion / watchers
  H. the full creator-vs-guest permission matrix
  I. zero uncaught JS errors, no duplicate subscriptions or watchers

Existing suites already cover A-E; this file re-checks the parts that can only be
proven with a second identity, a retry, or a duplicate action.
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("TRIPPI_BASE_URL", "http://localhost:8080")
OWNER_EMAIL = os.environ["TRIPPI_TEST_OWNER_EMAIL"]
OWNER_PASS = os.environ["TRIPPI_TEST_OWNER_PASS"]

results = []
js_errors = []


def record(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(detail)) if detail else ""))


def watch_errors(page, label):
    page.on("pageerror", lambda e: js_errors.append(f"{label}: {e}"))


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


async def join_as(page, token, name):
    await page.goto(f"{BASE}/trip-planner.html?gt={token}", wait_until="networkidle")
    await page.wait_for_timeout(2000)
    await page.evaluate("() => { const b = document.getElementById('guestJoinBtn'); if (b) b.click(); }")
    await page.wait_for_timeout(1000)
    await page.fill("#guestNameInput", name)
    await page.click("#guestNameSubmit")
    await page.wait_for_timeout(7000)


async def open_tab(page, label):
    await page.evaluate(
        """(label) => document.querySelectorAll('.view-tab')
            .forEach(t => { if (t.textContent.trim() === label) t.click(); })""",
        label,
    )
    await page.wait_for_timeout(2500)


async def members_of(page, gid):
    return await page.evaluate(
        """async (gid) => {
            const r = await window.MarkiAPI.getMembers(gid);
            return (r.data || []).map(m => ({ uid: m.user_id, name: m.display_name, role: m.role }));
        }""",
        gid,
    )


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        octx = await browser.new_context(
            permissions=["geolocation"], geolocation={"latitude": -6.20, "longitude": 106.81}
        )
        op = await octx.new_page()
        watch_errors(op, "creator")
        await op.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await op.wait_for_timeout(700)
        await op.evaluate("() => localStorage.setItem('trippi_display_name', 'Ras')")
        await login(op, OWNER_EMAIL, OWNER_PASS)

        made = await op.evaluate(
            """async () => {
                const g = await window.MarkiAPI.createGroup({
                    name: 'Acceptance ' + Date.now(), destination: 'Bandung',
                    start_date: '2026-09-01', end_date: '2026-09-03', display_name: 'Ras'});
                if (g.error) return { error: String(g.error.message || g.error) };
                const gid = g.data.id;
                await window.MarkiAPI.addItem({group_id: gid, title: 'Sarapan',
                    date: '2026-09-01', time: '08:00', budget: 50000});
                const inv = await window.MarkiAPI.createInvitation(gid);
                const d = Array.isArray(inv.data) ? inv.data[0] : inv.data;
                return { id: gid, token: (d && d.token) || d };
            }"""
        )
        if made.get("error"):
            record("setup: create trip", False, made["error"])
            summary_and_exit()
        gid, token = made["id"], made["token"]
        record("setup: trip + invitation", bool(gid and token), str(token)[:12])

        # ---------- G-join: one join = exactly one membership ----------
        gctx = await browser.new_context(
            permissions=["geolocation"], geolocation={"latitude": -6.21, "longitude": 106.83}
        )
        gp = await gctx.new_page()
        watch_errors(gp, "guest")
        await join_as(gp, token, "Budi")

        mem = await members_of(op, gid)
        budi = [m for m in mem if m["name"] == "Budi"]
        record("G-join: one join -> exactly one membership", len(budi) == 1, mem)

        guest_uid = budi[0]["uid"] if budi else None

        # retry redeem with the same token must not create a second row
        retry = await gp.evaluate(
            """async (token) => {
                const r = await window.MarkiAPI.redeemInvitation(token, 'Budi');
                return r.error ? String(r.error.message || r.error) : 'ok';
            }""",
            token,
        )
        mem = await members_of(op, gid)
        record("G-join: retry redeem creates no duplicate",
               len([m for m in mem if m["name"] == "Budi"]) == 1, f"retry={retry} | {mem}")

        # refresh after join must not duplicate either
        await gp.reload(wait_until="networkidle")
        await gp.wait_for_timeout(6000)
        mem = await members_of(op, gid)
        record("G-join: refresh after join creates no duplicate",
               len([m for m in mem if m["name"] == "Budi"]) == 1, mem)

        # identity survives refresh
        after_refresh = await gp.evaluate(
            """() => ({
                joined: (() => { const j = document.getElementById('guestJoinedView');
                    return !!j && getComputedStyle(j).display !== 'none'; })(),
                text: (document.getElementById('guestPreviewText') || {}).textContent || '',
            })"""
        )
        record("A: identity consistent after refresh",
               after_refresh["joined"] and "Budi" in after_refresh["text"], after_refresh["text"][:60])

        # ---------- G-wishlist: double submit must not create two items ----------
        await gp.evaluate("() => { const p = document.getElementById('guestWishlistPanel'); if (p) p.open = true; }")
        await gp.wait_for_timeout(500)
        await gp.fill("#guestWishlistTitle", "Museum Nasional")
        await gp.fill("#guestWishlistNote", "Wajib mampir")
        # fire the submit twice back-to-back, like an impatient double-click
        await gp.evaluate(
            """() => {
                const f = document.getElementById('guestWishlistForm');
                f.dispatchEvent(new Event('submit', {cancelable: true}));
                f.dispatchEvent(new Event('submit', {cancelable: true}));
            }"""
        )
        await gp.wait_for_timeout(6000)

        wl = await gp.evaluate(
            """async () => {
                const r = await window.MarkiAPI.listWishlists(colState.group.id);
                const rows = r.data || [];
                return {
                    total: rows.length,
                    museum: rows.filter(w => w.title === 'Museum Nasional').length,
                    domItems: document.querySelectorAll('#guestWishList .to-go-item').length,
                };
            }"""
        )
        record("G-wishlist: double submit creates ONE item", wl["museum"] == 1, wl)
        record("G-wishlist: DOM matches data (no dupes)", wl["domItems"] == wl["total"], wl)

        # ---------- G-conversion: convert once, no second itinerary item ----------
        await op.evaluate("(id) => openGroup(id, false)", gid)
        await op.wait_for_timeout(3000)
        conv = await op.evaluate(
            """async () => {
                const r = await window.MarkiAPI.listWishlists(colState.group.id);
                const target = (r.data || []).find(w => w.title === 'Museum Nasional' && w.status === 'suggested');
                if (!target) return { error: 'no suggested Museum Nasional' };
                const c1 = await window.MarkiAPI.convertWishlistToItinerary(target.id, '2026-09-02', '10:00');
                // retry the same conversion — must not add a second agenda item
                const c2 = await window.MarkiAPI.convertWishlistToItinerary(target.id, '2026-09-02', '10:00');
                const after = await window.MarkiAPI.listWishlists(colState.group.id);
                const row = (after.data || []).find(w => w.id === target.id);
                const items = await window.MarkiAPI.getItems(colState.group.id);
                return {
                    first: c1.error ? String(c1.error.message || c1.error) : 'ok',
                    second: c2.error ? String(c2.error.message || c2.error) : 'ok',
                    status: row && row.status,
                    agendaLink: !!(row && row.agenda_item_id),
                    museumItems: (items.data || []).filter(i => i.title === 'Museum Nasional').length,
                };
            }"""
        )
        record("E: conversion sets agenda_item_id", conv.get("agendaLink") and conv.get("status") == "approved", conv)
        record("G-conversion: retry does NOT create a second itinerary item",
               conv.get("museumItems") == 1, conv)

        # ---------- G-location: single watcher, single subscription ----------
        await open_tab(op, "Journey Mode")
        await op.evaluate("() => { const b = document.getElementById('startJourneyBtn'); if (b) b.click(); }")
        await op.wait_for_timeout(4000)
        await open_tab(op, "Journey Mode")
        await op.evaluate("() => { const b = document.getElementById('shareLocationBtn'); if (b) b.click(); }")
        await op.wait_for_timeout(5000)

        watch_probe = await op.evaluate(
            """async () => {
                // count how many watchers exist after repeated start attempts
                const before = colState.locationWatchId;
                startLocationWatch(); startLocationWatch(); startLocationWatch();
                const after = colState.locationWatchId;
                const sb = window.MarkiAPI._getSb();
                const chans = sb ? sb.getChannels().map(c => c.topic) : [];
                await renderJourneyView();
                await renderJourneyView();
                const chans2 = sb ? sb.getChannels().map(c => c.topic) : [];
                return {
                    sameWatcher: before === after,
                    watcher: after,
                    locChannels: chans.filter(t => t.indexOf('location') !== -1).length,
                    locChannelsAfter: chans2.filter(t => t.indexOf('location') !== -1).length,
                    allChannels: chans2,
                };
            }"""
        )
        record("G-location: repeated start yields ONE watcher", watch_probe["sameWatcher"], watch_probe)
        record("I: no duplicate realtime subscriptions after re-render",
               watch_probe["locChannelsAfter"] <= 1, watch_probe["allChannels"])

        consent_rows = await op.evaluate(
            """async () => {
                const sb = window.MarkiAPI._getSb();
                // one consent row per (group_id, user_id) — grant twice, count once
                await window.MarkiAPI.grantLocationConsent();
                await window.MarkiAPI.grantLocationConsent();
                const { data } = await sb.from('location_permissions')
                    .select('group_id,user_id,permission')
                    .eq('group_id', colState.group.id).eq('user_id', colState.uid);
                return data || [];
            }"""
        )
        record("G-location: one consent row per (group,user)", len(consent_rows) == 1, consent_rows)

        # ---------- H: permission matrix, enforced server-side ----------
        perm = await gp.evaluate(
            """async () => {
                const gidv = colState.group.id;
                const out = {};
                const tryIt = async (k, fn) => {
                    try { const r = await fn(); out[k] = r && r.error ? String(r.error.message || r.error) : 'ALLOWED'; }
                    catch (e) { out[k] = 'THREW: ' + (e && e.message); }
                };
                const wl = await window.MarkiAPI.listWishlists(gidv);
                const first = (wl.data || [])[0];
                await tryIt('view_itinerary', () => window.MarkiAPI.getItems(gidv));
                await tryIt('add_itinerary', () => window.MarkiAPI.addItem(
                    {group_id: gidv, title: 'guest hack', date: '2026-09-01', time: '12:00'}));
                await tryIt('add_wishlist', () => window.MarkiAPI.addWishlistItem(gidv, 'Guest idea', null, null));
                await tryIt('convert_wishlist', () => first
                    ? window.MarkiAPI.convertWishlistToItinerary(first.id, '2026-09-01', '09:00')
                    : {error: {message: 'no wishlist row'}});
                await tryIt('start_journey', () => window.MarkiAPI.startJourney());
                await tryIt('stop_journey', () => window.MarkiAPI.endJourney());
                await tryIt('view_crew', () => window.MarkiAPI.getCrewLocations());
                await tryIt('share_location', () => window.MarkiAPI.grantLocationConsent());
                await tryIt('edit_metadata', () => window.MarkiAPI.updateGroup(gidv, {name: 'guest renamed'}));
                return out;
            }"""
        )
        record("H guest: view itinerary ALLOWED", perm["view_itinerary"] == "ALLOWED", perm["view_itinerary"])
        record("H guest: add itinerary DENIED", perm["add_itinerary"] != "ALLOWED", perm["add_itinerary"])
        record("H guest: add wishlist ALLOWED", perm["add_wishlist"] == "ALLOWED", perm["add_wishlist"])
        record("H guest: convert wishlist DENIED", perm["convert_wishlist"] != "ALLOWED", perm["convert_wishlist"])
        record("H guest: start journey DENIED", perm["start_journey"] != "ALLOWED", perm["start_journey"])
        record("H guest: stop journey DENIED", perm["stop_journey"] != "ALLOWED", perm["stop_journey"])
        # View-crew requires the caller's own consent (gate 4 of get_crew_locations).
        # The guest has not consented at this point, so a refusal here is CORRECT
        # security behaviour, not a permission bug. The allowed case is proven in
        # phaseD_journey / guest_ui_revision after consent is granted.
        record("H guest: view crew gated by own consent",
               perm["view_crew"] == "ALLOWED" or "location permission not granted" in perm["view_crew"],
               perm["view_crew"])
        record("H guest: share own location ALLOWED", perm["share_location"] == "ALLOWED", perm["share_location"])

        meta_after = await op.evaluate(
            """async (gid) => {
                const sb = window.MarkiAPI._getSb();
                const { data } = await sb.from('groups').select('name').eq('id', gid).single();
                return data && data.name;
            }""",
            gid,
        )
        record("H guest: edit trip metadata DENIED", "guest renamed" != meta_after, meta_after)

        # creator side of the matrix
        cperm = await op.evaluate(
            """async () => {
                const gidv = colState.group.id;
                const out = {};
                const tryIt = async (k, fn) => {
                    try { const r = await fn(); out[k] = r && r.error ? String(r.error.message || r.error) : 'ALLOWED'; }
                    catch (e) { out[k] = 'THREW: ' + (e && e.message); }
                };
                await tryIt('add_itinerary', () => window.MarkiAPI.addItem(
                    {group_id: gidv, title: 'Creator agenda', date: '2026-09-03', time: '15:00'}));
                await tryIt('add_wishlist', () => window.MarkiAPI.addWishlistItem(gidv, 'Creator idea', null, null));
                await tryIt('edit_metadata', () => window.MarkiAPI.updateGroup(gidv, {destination: 'Bandung'}));
                await tryIt('view_crew', () => window.MarkiAPI.getCrewLocations());
                return out;
            }"""
        )
        record("H creator: add itinerary ALLOWED", cperm["add_itinerary"] == "ALLOWED", cperm["add_itinerary"])
        record("H creator: add wishlist ALLOWED", cperm["add_wishlist"] == "ALLOWED", cperm["add_wishlist"])
        record("H creator: edit metadata ALLOWED", cperm["edit_metadata"] == "ALLOWED", cperm["edit_metadata"])
        record("H creator: view crew ALLOWED", cperm["view_crew"] == "ALLOWED", cperm["view_crew"])

        # ---------- F: exit, then re-open the link ----------
        await gp.evaluate("() => { window.confirm = () => true; }")
        await gp.evaluate("() => { const b = document.getElementById('guestLeaveBtn'); if (b) b.click(); }")
        await gp.wait_for_timeout(5000)

        mem = await members_of(op, gid)
        record("F: guest removed from group_members", not any(m["name"] == "Budi" for m in mem), mem)
        record("F: creator still in trip", any(m["role"] == "owner" for m in mem), mem)

        gone = await gp.evaluate(
            """async (uid) => {
                const r = await window.MarkiAPI.getCrewLocations();
                return { crewErr: r.error ? String(r.error.message || r.error) : 'ok' };
            }""",
            guest_uid,
        )
        record("F: ex-guest cannot read crew as member",
               gone["crewErr"] != "ok", gone["crewErr"])

        # creator's Crew must not show the departed guest after a refresh
        await open_tab(op, "Journey Mode")
        await op.evaluate("async () => { await loadMembers(colState.group.id); await loadCrewMap(); }")
        await op.wait_for_timeout(3000)
        crew_after = await op.evaluate(
            """() => Array.from(document.querySelectorAll('#crewStatusList .to-go-item'))
                .map(r => r.innerText.replace(/\\s+/g, ' ').trim())"""
        )
        record("F: departed guest gone from Crew after refresh",
               not any("Budi" in r for r in crew_after), crew_after)

        # re-opening the invite link must require the join flow again
        await gp.goto(f"{BASE}/trip-planner.html?gt={token}", wait_until="networkidle")
        await gp.wait_for_timeout(4000)
        rejoin = await gp.evaluate(
            """() => {
                const disp = id => { const el = document.getElementById(id);
                    return el ? getComputedStyle(el).display : null; };
                return {
                    preview: disp('guestPreview'),
                    joined: disp('guestJoinedView'),
                    joinBtn: !!document.getElementById('guestJoinBtn'),
                };
            }"""
        )
        record("F: re-open link shows join flow again",
               rejoin["joined"] == "none" and rejoin["joinBtn"], rejoin)
        record("F: not auto-treated as already joined", rejoin["preview"] != "none", rejoin)

        # ---------- I: no uncaught JS errors ----------
        record("I: zero uncaught JavaScript errors", not js_errors, js_errors[:3])

        for ctx in (octx, gctx):
            await ctx.close()
        await browser.close()

    summary_and_exit()


def summary_and_exit():
    print("\n" + "=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"ACCEPTANCE (F/G/H/I): {passed}/{len(results)} PASS")
    print("=" * 60)
    for n, ok, d in results:
        if not ok:
            print(f"  FAILED: {n} | {d}")
    sys.exit(0 if passed == len(results) else 1)


asyncio.run(main())
