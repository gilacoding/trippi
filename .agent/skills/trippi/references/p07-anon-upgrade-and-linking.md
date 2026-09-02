# P0.7 — Anonymous Auth Upgrade & Account Linking (CORRECTED 2026-08-29)

## Supabase Anonymous Auth DOES NOT Upgrade In-Place

**Evidence (corrected):** When an anonymous user signs up via `signUpWithEmail()`, Supabase Auth creates a **NEW user** with a **NEW UID**. The anonymous user is NOT upgraded in-place.

Measured via debug:
```
Session BEFORE signup: uid=8f534004-..., is_anonymous=true, email=""
Session AFTER signup:  uid=47a9a155-..., is_anonymous=false, email="converted_...@marki.cab"
```

**Consequences:**
- `transfer_anonymous_identity(oldUid, newUid, ...)` IS needed and DOES work (different UIDs)
- The anon membership row must be migrated to the new UID
- The anon identity must be deleted after transfer

## Root Cause of Transfer Not Firing

**Bug:** The signup flow called `API.getUserObject()` AFTER `signUpWithEmail()`, so it returned the NEW user (not anonymous). `wasAnon` evaluated to `false`, skipping the transfer entirely.

**Fix:** Capture anon state BEFORE signup using the session claim:
```javascript
var oldUid = colState.uid;
var oldUser = await API.getUserObject();  // CALL BEFORE signup!
var wasAnon = !!(oldUser && oldUser.is_anonymous);
var s = await API.signUpWithEmail(email, pw);
// ... after signup ...
if (wasAnon && s && s.data && s.data.user) {
    var uid = s.data.user.id;
    await API.transferAnonymousIdentity(oldUid, uid, nm || colState.name || null);
}
```

## Account Linking RPC

### `transfer_anonymous_identity(p_old_user_id uuid, p_new_user_id uuid, p_display_name text default null) → jsonb`

**Purpose:** Migrates all attribution, memberships, and references from an anonymous UID to a new registered UID, then deletes the anon identity.

**Behavior:**
- Guard: source MUST be an anonymous user (checks `auth.users.is_anonymous`), otherwise raises exception
- Transfers: `wishlist_items.suggested_by`, `shared_items.created_by`, `group_expenses.created_by/paid_by`, `groups.created_by`, `invitations.created_by`, `journey_sessions.enabled_by`
- Membership: replaces anon row with new UID, preserves earliest `joined_at`, sets `is_anonymous = false`
- Profile: creates one for new UID if missing (from most recent non-placeholder per-trip name)
- Deletes the anon identity (cascades to `auth.identities`, `auth.sessions`)
- Idempotent: if old UID has no rows left, it's simply deleted

## is_anonymous Flag on group_members

**Bug:** After transfer, converted users still showed as "Guest" in Crew list because `get_group_identities` read `is_anonymous` from `auth.users` (stale), not from `group_members`.

**Fix:**
1. Added `is_anonymous` column to `group_members` (nullable, default false)
2. `redeem_invitation` now sets `is_anonymous` based on caller's auth state
3. `transfer_anonymous_identity` now sets `is_anonymous = false` on the membership row
4. `get_group_identities` now reads `gm.is_anonymous` as source of truth (not `auth.users`)

## Test Pattern for Conversion

```python
# Verify via API (deterministic, not DOM)
async def check_merged_api():
    result = await gp.evaluate("""async () => {
        const sb = window.TrippiAPI._getSb();
        const r = await sb.from('group_members').select('user_id, display_name, role, is_anonymous').eq('group_id', '%s');
        return r.data || [];
    }""" % gid)
    ras = [m for m in result if m.get('role') == 'owner']
    budi_non_anon = [m for m in result if m.get('display_name') == 'Budi' and not m.get('is_anonymous')]
    budi_anon = [m for m in result if m.get('display_name') == 'Budi' and m.get('is_anonymous')]
    if len(ras) == 1 and len(budi_non_anon) == 1 and len(budi_anon) == 0:
        return result
    return None
```

**Note:** DOM-based assertions are flaky because the Crew list may not be rendered when the check runs. API-based checks are deterministic.
