"""LocalStorage Brand Migration Tests.

Tests the one-time migration from trippi_* keys to markicab_* keys.
Covers: legacy-only, new-only, both exist, malformed data, double migration.
"""
import asyncio, os, sys, time
from playwright.async_api import async_playwright

BASE = os.environ.get("TRIPPI_BASE_URL", "http://localhost:8080")

results = []


def record(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(detail)) if detail else ""))


async def clear_localStorage(page):
    await page.evaluate("() => localStorage.clear()")


async def test_legacy_only(page):
    """Legacy key exists, new key does not → migrate."""
    await clear_localStorage(page)
    await page.evaluate("""() => {
        localStorage.setItem('trippi_personal_planner_v2', JSON.stringify({trips:[{id:'t1',name:'Test'}],toGo:[]}));
        localStorage.setItem('trippi_display_name', 'LegacyUser');
    }""")
    # Reload to trigger migration
    await page.reload(wait_until="networkidle")
    await page.wait_for_timeout(1000)

    new_val = await page.evaluate("() => localStorage.getItem('markicab_personal_planner_v2')")
    old_val = await page.evaluate("() => localStorage.getItem('trippi_personal_planner_v2')")
    name_new = await page.evaluate("() => localStorage.getItem('markicab_display_name')")
    mig_v = await page.evaluate("() => window.__markicabLS.getMigVersion()")

    record("legacy-only: data migrated", new_val and 'Test' in new_val, new_val)
    record("legacy-only: display name migrated", name_new == 'LegacyUser', name_new)
    record("legacy-only: migration version set", mig_v == 1, mig_v)


async def test_new_only(page):
    """New key exists, no legacy → no change."""
    await clear_localStorage(page)
    await page.evaluate("""() => {
        localStorage.setItem('markicab_personal_planner_v2', JSON.stringify({trips:[{id:'t2',name:'NewData'}],toGo:[]}));
        localStorage.setItem('markicab_display_name', 'NewUser');
    }""")
    await page.reload(wait_until="networkidle")
    await page.wait_for_timeout(1000)

    new_val = await page.evaluate("() => localStorage.getItem('markicab_personal_planner_v2')")
    name_new = await page.evaluate("() => localStorage.getItem('markicab_display_name')")

    record("new-only: data preserved", new_val and 'NewData' in new_val, new_val)
    record("new-only: display name preserved", name_new == 'NewUser', name_new)


async def test_both_exist(page):
    """Both exist → new key wins, legacy untouched."""
    await clear_localStorage(page)
    await page.evaluate("""() => {
        localStorage.setItem('trippi_personal_planner_v2', JSON.stringify({trips:[{id:'t_old'}],toGo:[]}));
        localStorage.setItem('markicab_personal_planner_v2', JSON.stringify({trips:[{id:'t_new'}],toGo:[]}));
        localStorage.setItem('trippi_display_name', 'OldName');
        localStorage.setItem('markicab_display_name', 'NewName');
    }""")
    await page.reload(wait_until="networkidle")
    await page.wait_for_timeout(1000)

    new_val = await page.evaluate("() => localStorage.getItem('markicab_personal_planner_v2')")
    name_new = await page.evaluate("() => localStorage.getItem('markicab_display_name')")

    record("both-exist: new data wins", new_val and 't_new' in new_val, new_val)
    record("both-exist: new name wins", name_new == 'NewName', name_new)


async def test_malformed_legacy(page):
    """Malformed legacy data → migration skips gracefully."""
    await clear_localStorage(page)
    await page.evaluate("""() => {
        localStorage.setItem('trippi_personal_planner_v2', 'not-valid-json{{{');
        localStorage.setItem('trippi_display_name', 'BadData');
    }""")
    await page.reload(wait_until="networkidle")
    await page.wait_for_timeout(1000)

    name_new = await page.evaluate("() => localStorage.getItem('markicab_display_name')")
    mig_v = await page.evaluate("() => window.__markicabLS.getMigVersion()")

    record("malformed: display name migrated", name_new == 'BadData', name_new)
    record("malformed: migration version set", mig_v == 1, mig_v)


async def test_double_migration(page):
    """Migration runs twice → idempotent."""
    await clear_localStorage(page)
    await page.evaluate("""() => {
        localStorage.setItem('trippi_display_name', 'FirstRun');
    }""")
    await page.reload(wait_until="networkidle")
    await page.wait_for_timeout(500)

    # Manually call migration again
    await page.evaluate("() => window.__markicabLS.migrateLocalStorageKeys()")
    await page.wait_for_timeout(200)

    name_val = await page.evaluate("() => localStorage.getItem('markicab_display_name')")
    record("double-migration: idempotent", name_val == 'FirstRun', name_val)


async def test_consent_migration(page):
    """Consent keys migrated."""
    await clear_localStorage(page)
    await page.evaluate("""() => {
        localStorage.setItem('trippi_consent_group123_user456', 'granted');
    }""")
    await page.reload(wait_until="networkidle")
    await page.wait_for_timeout(500)

    new_consent = await page.evaluate("() => localStorage.getItem('markicab_consent_group123_user456')")
    old_consent = await page.evaluate("() => localStorage.getItem('trippi_consent_group123_user456')")

    record("consent: migrated to new key", new_consent == 'granted', new_consent)
    record("consent: old key removed", old_consent is None, old_consent)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context()
        page = await ctx.new_page()

        await page.goto(f"{BASE}/trip-planner.html", wait_until="networkidle")
        await page.wait_for_timeout(500)

        await test_legacy_only(page)
        await test_new_only(page)
        await test_both_exist(page)
        await test_malformed_legacy(page)
        await test_double_migration(page)
        await test_consent_migration(page)

        await browser.close()

    summary_and_exit()


def summary_and_exit():
    print("\n" + "=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"LS MIGRATION: {passed}/{len(results)} PASS")
    print("=" * 60)
    for n, ok, d in results:
        if not ok:
            print(f"  FAILED: {n} | {d}")
    sys.exit(0 if passed == len(results) else 1)


asyncio.run(main())
