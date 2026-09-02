"""Fase A acceptance test — group session lifecycle.

Acceptance (per user spec):
  open trip A -> subscription A active
  back to Semua Trip -> subscription A removed, polling A stopped, state A cleared
  open trip B -> only B's data/subscription active
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("TRIPPI_BASE_URL", "http://localhost:8080")
OWNER_EMAIL = os.environ["TRIPPI_TEST_OWNER_EMAIL"]
OWNER_PASS = os.environ["TRIPPI_TEST_OWNER_PASS"]

results = []
def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(detail)) if detail else ""))


async def probe(page):
    """Read live lifecycle state from the page."""
    return await page.evaluate("""() => {
        const sb = (window.MarkiAPI && window.MarkiAPI._getSb) ? window.MarkiAPI._getSb() : null;
        const chans = sb && sb.getChannels ? sb.getChannels().map(c => c.topic) : [];
        return {
            channels: chans,
            groupChannels: chans.filter(t => t.indexOf('group:') !== -1),
            locChannels: chans.filter(t => t.indexOf('member_locations') !== -1 || t.indexOf('journey') !== -1),
            groupName: (document.getElementById('groupName') || {}).textContent || '',
            // P2: the separate '#memberList' (Anggota) section was removed on purpose;
            // Crew is now the single roster. Count from colState, which both render.
            memberCount: (colState.members || []).length,
            agendaCount: document.querySelectorAll('#sharedList .agenda-item, #sharedList article').length,
        };
    }""")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context()
        page = await ctx.new_page()
        page.on("pageerror", lambda e: record("no pageerror", False, str(e)))

        await page.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await page.wait_for_timeout(800)

        # login
        await page.evaluate("() => { document.querySelector('#newTripBtn').click(); }")
        await page.wait_for_timeout(600)
        await page.locator("#authModal").first.wait_for(state="visible", timeout=15000)
        if "Daftar" in (await page.locator("#authTitle").text_content()):
            await page.locator("#authToggle").click(); await page.wait_for_timeout(250)
        await page.fill("#authEmail", OWNER_EMAIL)
        await page.fill("#authPassword", OWNER_PASS)
        await page.locator("#authSubmit").click()
        await page.wait_for_timeout(3500)

        # collect at least 2 groups from the home list
        groups = await page.evaluate("""async () => {
            const r = await window.MarkiAPI.listMyGroups();
            return (r.data || []).slice(0, 2).map(g => ({ id: g.id, name: g.name }));
        }""")
        if len(groups) < 2:
            record("two groups available", False, f"only {len(groups)} group(s)")
            print("\nNeed >=2 groups for the A->home->B assertion. Aborting.")
            await browser.close(); return
        record("two groups available", True, f"{groups[0]['name']} / {groups[1]['name']}")

        A, B = groups[0], groups[1]

        # ---- open trip A ----
        await page.evaluate("(id) => openGroup(id, false)", A["id"])
        await page.wait_for_timeout(3000)
        sA = await probe(page)
        record("A: exactly 1 group channel", len(sA["groupChannels"]) == 1, sA["groupChannels"])
        record("A: channel topic matches A", any(A["id"] in t for t in sA["groupChannels"]), sA["groupChannels"])
        record("A: poll interval running", await page.evaluate("() => !!colState.poll"))
        record("A: group name rendered", A["name"] in sA["groupName"], sA["groupName"])

        # ---- back to Semua Trip ----
        await page.evaluate("() => document.querySelector('#groupView [data-home]').click()")
        await page.wait_for_timeout(2000)
        sHome = await probe(page)
        record("home: group channel removed", len(sHome["groupChannels"]) == 0, sHome["groupChannels"])
        record("home: location channel removed", len(sHome["locChannels"]) == 0, sHome["locChannels"])
        cleared = await page.evaluate("""() => ({
            poll: colState.poll, channel: colState.channel, group: colState.group,
            items: colState.items.length, members: colState.members.length,
            expenses: colState.expenses.length, perms: colState.perms, journey: colState.journey
        })""")
        record("home: poll handle nulled", cleared["poll"] is None, cleared["poll"])
        record("home: channel handle nulled", cleared["channel"] is None, cleared["channel"])
        record("home: colState.group nulled", cleared["group"] is None)
        record("home: items/members/expenses cleared",
               cleared["items"] == 0 and cleared["members"] == 0 and cleared["expenses"] == 0, cleared)
        record("home: perms+journey cleared", cleared["perms"] is None and cleared["journey"] is None, cleared)

        # ---- open trip B ----
        await page.evaluate("(id) => openGroup(id, false)", B["id"])
        await page.wait_for_timeout(3000)
        sB = await probe(page)
        record("B: exactly 1 group channel (no leak)", len(sB["groupChannels"]) == 1, sB["groupChannels"])
        record("B: channel topic matches B", any(B["id"] in t for t in sB["groupChannels"]), sB["groupChannels"])
        record("B: no channel left for A", not any(A["id"] in t for t in sB["groupChannels"]), sB["groupChannels"])
        # Identity assertion is ID-based: group names in this project are often
        # duplicated across test trips, so name comparison is not authoritative.
        record("B: group name rendered", bool(sB["groupName"].strip()), sB["groupName"])
        record("B: colState.group.id == B", await page.evaluate("(id)=>colState.group&&colState.group.id===id", B["id"]))
        record("B: colState.group.id != A (no stale A)", await page.evaluate("(id)=>colState.group&&colState.group.id!==id", A["id"]))
        record("B: data loaded without refresh", sB["memberCount"] > 0, f"members={sB['memberCount']}")

        await browser.close()

    print("\n" + "=" * 52)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"FASE A LIFECYCLE: {passed}/{len(results)} PASS")
    print("=" * 52)
    for n, ok, d in results:
        if not ok:
            print(f"  FAILED: {n} | {d}")
    sys.exit(0 if passed == len(results) else 1)

asyncio.run(main())
