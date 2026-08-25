"""Fase D acceptance test — Journey + Location.

Proves the location-sharing loop end to end in a real browser, for BOTH a
registered creator and an anonymous joined guest:

  journey start -> prompt -> consent -> browser sends location
                -> creator sees status/position -> stop journey

Also asserts the locked Fase D rules:
  - consent prompt copy is "Bagikan lokasi kamu ke grup?" with Izinkan / Nanti
  - 3-state crew list (Online / Offline / Tidak berbagi)
  - no blank map: empty state text when nothing is shared
  - GPS denied does NOT revoke the server-side consent
  - guest (anonymous) can open Journey Mode and consent
  - only the creator can start/end a journey
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("TRIPPI_BASE_URL", "http://localhost:8080")
OWNER_EMAIL = os.environ["TRIPPI_TEST_OWNER_EMAIL"]
OWNER_PASS = os.environ["TRIPPI_TEST_OWNER_PASS"]

results = []
def record(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(detail)) if detail else ""))


async def login(page, email, pw):
    await page.evaluate("() => document.querySelector('#newTripBtn').click()")
    await page.wait_for_timeout(500)
    await page.locator("#authModal").first.wait_for(state="visible", timeout=15000)
    if "Daftar" in (await page.locator("#authTitle").text_content()):
        await page.locator("#authToggle").click(); await page.wait_for_timeout(200)
    await page.fill("#authEmail", email)
    await page.fill("#authPassword", pw)
    await page.locator("#authSubmit").click()
    await page.wait_for_timeout(3500)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # Creator context: geolocation granted, fixed coordinate (Jakarta)
        octx = await browser.new_context(
            permissions=["geolocation"],
            geolocation={"latitude": -6.2000, "longitude": 106.8166},
        )
        op = await octx.new_page()
        await op.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await op.wait_for_timeout(700)
        await login(op, OWNER_EMAIL, OWNER_PASS)

        made = await op.evaluate("""async () => {
            const g = await window.TrippiAPI.createGroup({
                name: 'Fase D Journey ' + Date.now(),
                destination: 'Jakarta',
                start_date: '2026-09-01',
                end_date: '2026-09-03'
            });
            if (g.error) return { error: String(g.error.message || g.error) };
            return { id: g.data.id, name: g.data.name };
        }""")
        if made.get("error"):
            record("owner: create trip", False, made["error"])
            await browser.close(); return
        record("owner: create trip", True, made["name"])
        gid = made["id"]

        await op.evaluate("(id) => openGroup(id, false)", gid)
        await op.wait_for_timeout(2500)

        async def open_journey(page):
            await page.evaluate("""() => document.querySelectorAll('.view-tab')
                .forEach(t => { if (t.textContent.trim() === 'Journey Mode') t.click(); })""")
            await page.wait_for_timeout(2500)

        # ---------- journey not started yet ----------
        await open_journey(op)
        pre = await op.evaluate("""() => ({
            startBtn: !!document.getElementById('startJourneyBtn'),
            endBtn: !!document.getElementById('endJourneyBtn'),
            consent: !!document.getElementById('consentBanner'),
            crewVisible: (() => {
                const c = document.getElementById('crewMapContainer');
                return !!c && getComputedStyle(c).display !== 'none';
            })(),
        })""")
        record("owner: Start Journey available", pre["startBtn"], pre)
        record("owner: no consent prompt before journey", not pre["consent"])
        # P2 supersedes the original Fase D expectation: Crew is now the ONE member
        # roster, so the panel stays visible before a journey starts. What must be
        # absent beforehand is the MAP surface and the consent prompt, both asserted
        # here and below.
        pre_map = await op.evaluate(
            """() => {
                const m = document.getElementById('crewMap');
                return { mapHidden: !m || getComputedStyle(m).display === 'none',
                         crewRows: document.querySelectorAll('#crewStatusList .to-go-item').length };
            }"""
        )
        record("owner: no map surface before journey", pre_map["mapHidden"], pre_map)
        record("owner: Crew roster available before journey", pre_map["crewRows"] > 0, pre_map)

        # ---------- creator starts the journey ----------
        await op.evaluate("() => document.getElementById('startJourneyBtn').click()")
        await op.wait_for_timeout(4000)
        await open_journey(op)

        started = await op.evaluate("""() => {
            const banner = document.getElementById('consentBanner');
            const txt = banner ? banner.innerText : '';
            const share = document.getElementById('shareLocationBtn');
            const deny = document.getElementById('denyLocationBtn');
            const c = document.getElementById('crewMapContainer');
            const map = document.getElementById('crewMap');
            const empty = document.getElementById('crewEmpty');
            return {
                endBtn: !!document.getElementById('endJourneyBtn'),
                promptText: txt,
                shareLabel: share ? share.textContent.trim() : null,
                denyLabel: deny ? deny.textContent.trim() : null,
                crewVisible: !!c && getComputedStyle(c).display !== 'none',
                mapHidden: !map || getComputedStyle(map).display === 'none',
                emptyText: empty ? empty.textContent.trim() : null,
                crewRows: document.querySelectorAll('#crewStatusList .to-go-item').length,
            };
        }""")
        record("owner: End Journey shown when active", started["endBtn"])
        record("prompt copy is the locked Indonesian text",
               "Bagikan lokasi kamu ke grup?" in started["promptText"],
               started["promptText"][:70])
        record("prompt buttons are Izinkan / Nanti",
               started["shareLabel"] == "Izinkan" and started["denyLabel"] == "Nanti",
               f"{started['shareLabel']} / {started['denyLabel']}")
        record("crew panel visible without own consent", started["crewVisible"])
        record("no blank map before any location", started["mapHidden"], f"mapHidden={started['mapHidden']}")
        record("empty state says nothing shared yet",
               (started["emptyText"] or "").startswith("Belum ada lokasi"), started["emptyText"])
        record("crew list rendered (3-state rows)", started["crewRows"] > 0, f"rows={started['crewRows']}")

        # every member starts as "Tidak berbagi"
        pre_state = await op.evaluate("""() => Array.from(
            document.querySelectorAll('#crewStatusList .to-go-item')
        ).map(r => r.innerText.replace(/\\s+/g, ' ').trim())""")
        record("before consent: shows 'Tidak berbagi'",
               any("Tidak berbagi" in r for r in pre_state), pre_state[:3])

        # ---------- creator consents -> browser sends a location ----------
        await op.evaluate("() => document.getElementById('shareLocationBtn').click()")
        await op.wait_for_timeout(5000)
        await open_journey(op)

        shared = await op.evaluate("""() => {
            const map = document.getElementById('crewMap');
            const rows = Array.from(document.querySelectorAll('#crewStatusList .to-go-item'))
                .map(r => r.innerText.replace(/\\s+/g, ' ').trim());
            return {
                stopBtn: !!document.getElementById('stopSharingBtn'),
                mapVisible: !!map && getComputedStyle(map).display !== 'none',
                pins: document.querySelectorAll('#crewMap .crew-pin').length,
                rows: rows,
                online: rows.filter(r => r.indexOf('Online') !== -1).length,
                crewStatus: (document.getElementById('crewStatus') || {}).textContent || '',
                consentState: colState.locationConsent,
            };
        }""")
        record("owner: Stop berbagi offered after consent", shared["stopBtn"])
        record("owner: consent recorded as granted", shared["consentState"] == "granted", shared["consentState"])
        record("map renders once a location exists", shared["mapVisible"], f"pins={shared['pins']}")
        record("map has a marker for the sharer", shared["pins"] > 0, f"pins={shared['pins']}")
        record("crew list shows 🟢 Online", shared["online"] > 0, shared["rows"][:3])
        record("crew status counter shows online", "online" in shared["crewStatus"], shared["crewStatus"])

        # ---------- anonymous guest joins and gets Journey Mode ----------
        inv = await op.evaluate("""async (gid) => {
            const r = await window.TrippiAPI.createInvitation(gid);
            return { data: r.data, error: r.error ? String(r.error.message || r.error) : null };
        }""", gid)
        d = inv.get("data")
        if isinstance(d, list) and d: d = d[0]
        token = d.get("token") if isinstance(d, dict) else (d if isinstance(d, str) else None)
        if not token:
            record("guest: invitation created", False, str(inv)[:120])
            await browser.close(); return
        record("guest: invitation created", True, str(token)[:12] + "...")

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
        await gp.wait_for_timeout(7000)

        gstate = await gp.evaluate("""() => {
            const banner = document.getElementById('consentBanner');
            const share = document.getElementById('shareLocationBtn');
            const deny = document.getElementById('denyLocationBtn');
            return {
                journeySection: !!document.getElementById('crewStatusList'),
                promptText: banner ? banner.innerText : '',
                shareLabel: share ? share.textContent.trim() : null,
                denyLabel: deny ? deny.textContent.trim() : null,
                crewRows: document.querySelectorAll('#crewStatusList .to-go-item').length,
                startBtn: !!document.getElementById('startJourneyBtn'),
                endBtn: !!document.getElementById('endJourneyBtn'),
            };
        }""")
        record("guest: Journey Mode visible", gstate["journeySection"], gstate["journeySection"])
        record("guest: same locked prompt copy",
               "Bagikan lokasi kamu ke grup?" in gstate["promptText"], gstate["promptText"][:70])
        record("guest: Izinkan / Nanti buttons",
               gstate["shareLabel"] == "Izinkan" and gstate["denyLabel"] == "Nanti",
               f"{gstate['shareLabel']} / {gstate['denyLabel']}")
        record("guest: sees crew status list", gstate["crewRows"] > 0, f"rows={gstate['crewRows']}")
        record("guest: cannot start journey", not gstate["startBtn"] and not gstate["endBtn"], gstate)

        # guest consents -> its own location must land, and the creator must see it
        clicked = await gp.evaluate(
            "() => { const b = document.getElementById('shareLocationBtn'); if (!b) return false; b.click(); return true; }"
        )
        record("guest: consent button clickable", clicked, clicked)
        await gp.wait_for_timeout(6000)

        gafter = await gp.evaluate("""() => ({
            stopBtn: !!document.getElementById('stopSharingBtn'),
            consentState: colState.locationConsent,
            pins: document.querySelectorAll('#crewMap .crew-pin').length,
        })""")
        record("guest: consent granted", gafter["consentState"] == "granted", gafter["consentState"])
        record("guest: Stop berbagi offered", gafter["stopBtn"])
        record("guest: sees markers on map", gafter["pins"] > 0, f"pins={gafter['pins']}")

        # creator must now see two people online
        await op.evaluate("() => loadCrewMap()")
        await op.wait_for_timeout(3000)
        crew = await op.evaluate("""() => {
            const rows = Array.from(document.querySelectorAll('#crewStatusList .to-go-item'))
                .map(r => r.innerText.replace(/\\s+/g, ' ').trim());
            return {
                rows: rows,
                online: rows.filter(r => r.indexOf('Online') !== -1).length,
                pins: document.querySelectorAll('#crewMap .crew-pin').length,
                guestListed: rows.some(r => r.indexOf('Budi') !== -1),
            };
        }""")
        record("creator sees the guest in crew list", crew["guestListed"], crew["rows"][:4])
        record("creator sees 2 online", crew["online"] >= 2, f"online={crew['online']}")
        record("creator sees 2 markers", crew["pins"] >= 2, f"pins={crew['pins']}")

        # ---------- background / hidden tab behaviour ----------
        watch_before = await gp.evaluate("() => !!colState.locationWatchId")
        await gp.evaluate("""() => {
            Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true});
            Object.defineProperty(document, 'hidden', {value: true, configurable: true});
            document.dispatchEvent(new Event('visibilitychange'));
        }""")
        await gp.wait_for_timeout(1200)
        hidden = await gp.evaluate("() => ({ watch: !!colState.locationWatchId, consent: colState.locationConsent })")
        record("hidden tab: geolocation watch released", watch_before and not hidden["watch"],
               f"before={watch_before} after={hidden['watch']}")
        record("hidden tab: consent NOT revoked", hidden["consent"] == "granted", hidden["consent"])

        # ---------- GPS denied must not revoke server consent ----------
        dctx = await browser.new_context()  # geolocation NOT granted
        dp = await dctx.new_page()
        await dp.goto(f"{BASE}/trip-planner.html?gt={token}", wait_until="networkidle")
        await dp.wait_for_timeout(1800)
        await dp.evaluate("() => { const b = document.getElementById('guestJoinBtn'); if (b) b.click(); }")
        await dp.wait_for_timeout(1200)
        await dp.fill("#guestNameInput", "Sari")
        await dp.click("#guestNameSubmit")
        await dp.wait_for_timeout(7000)
        await dp.evaluate("""() => { window.alert = () => {}; }""")
        denied = await dp.evaluate("""async () => {
            // Consent on the server, then make the browser refuse the fix and run
            // the real handler (not just the button, which may not be mounted yet).
            const grant = await window.TrippiAPI.grantLocationConsent();
            navigator.geolocation.getCurrentPosition = (ok, err) =>
                err({ code: 1, PERMISSION_DENIED: 1, message: 'User denied Geolocation' });
            try { await shareLocationHandler(); } catch (e) {}
            await new Promise(r => setTimeout(r, 2500));
            const check = await window.TrippiAPI.getCrewLocations();
            return {
                granted: !grant.error,
                blocked: !!colState.locationBlocked,
                // server still lets us read => consent row survived the GPS refusal
                serverStillConsented: !(check.error && String(check.error.message || '')
                    .indexOf('location permission not granted') !== -1),
            };
        }""")
        record("GPS denied: server consent survives",
               denied["granted"] and denied["serverStillConsented"], denied)
        record("GPS denied: flagged as device-blocked", denied["blocked"], denied["blocked"])

        # ---------- creator ends the journey ----------
        await open_journey(op)
        await op.evaluate("() => { const b = document.getElementById('endJourneyBtn'); if (b) b.click(); }")
        await op.wait_for_timeout(4000)
        ended = await op.evaluate("""() => ({
            startBtn: !!document.getElementById('startJourneyBtn'),
            watch: !!colState.locationWatchId,
            journey: colState.journey && colState.journey.status,
        })""")
        record("journey ended: Start offered again", ended["startBtn"], ended)
        record("journey ended: watch stopped", not ended["watch"], f"watch={ended['watch']}")

        guest_after_end = await gp.evaluate("""async () => {
            const r = await window.TrippiAPI.getCrewLocations();
            return String((r.error && r.error.message) || 'ok');
        }""")
        record("journey ended: guest loses crew read",
               "no active journey" in guest_after_end, guest_after_end[:60])

        for ctx in (octx, gctx, dctx):
            await ctx.close()
        await browser.close()

    print("\n" + "=" * 56)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"FASE D JOURNEY+LOCATION: {passed}/{len(results)} PASS")
    print("=" * 56)
    for n, ok, d in results:
        if not ok:
            print(f"  FAILED: {n} | {d}")
    sys.exit(0 if passed == len(results) else 1)

asyncio.run(main())
