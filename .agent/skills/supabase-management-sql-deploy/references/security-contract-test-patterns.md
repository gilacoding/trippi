# Security-Contract Test Patterns

## 8-case admission gate test pattern
Used to verify consent/privacy models at the DB level. Requires **distinct authenticated
identities** (JWT rotation) — each identity gets a separate sign-in via `/auth/v1/token`.

| Case | Identity | Scenario | Expected | Debug signal |
|---|---|---|---|---|
| 1 | None (no JWT) | Call RPC without auth | 401 / 403 | `auth.uid() IS NULL` → function raises |
| 2 | Non-member | Authenticated user not in group | 400 / `[]` | `is_group_member(group_id)` returns false |
| 3 | Member, no consent | Member without consent row | 400 / `[]` | `permission IS NULL` or `permission != 'granted'` |
| 4 | Member grants self | Member calls grant | 200, `user_id = auth.uid()` | Row written with caller's UID |
| 5 | Member revokes | Member calls revoke | 200, `permission = 'denied'` | Row updated with caller's UID |
| 6 | Owner "grants member" | Owner calls grant (no p_user_id) | 200, `user_id = owner's UID` | Owner writes OWN row, not member's |
| 7 | No active session | End journey, retry | 400 | `no active journey for this group` |
| 8 | Authorized + data | Active + consent | 200, `[]` if no location rows | Empty set is correct when no GPS pushed |

## JWT rotation pattern
```python
emails = ["owner@x.cab", "member@x.cab", "nonmember@x.cab"]
jwts = {}
for name, email in zip(["owner", "member", "nonmember"], emails):
    data = json.dumps({"email": email, "password": "Str0ngP@ss99!"}).encode()
    req = urllib.request.Request(f"{base}/auth/v1/token?grant_type=password",
        data=data, headers={"Content-Type":"application/json", "apikey": pub_key})
    resp = urllib.request.urlopen(req, timeout=10)
    jwts[name] = json.loads(resp.read())["access_token"]
```

## Identity verification via JWT decode
```python
parts = jwt.split('.')
payload = json.loads(base64.urlsafe_b64decode(parts[1] + '=='))
# payload['sub'] = the auth.uid() value
# payload['aud'] = 'authenticated' (not 'anon')
# payload['is_anonymous'] = true for anon identities
```
This is how you **prove** Check 6: the row's `user_id` must equal `owner_jwt_payload['sub']`,
NOT `member_jwt_payload['sub']`.

## Response shape normalization
Supabase RPC responses vary:
```python
def rpc(jwt, name, params):
    # returns: {status, data, error}
    # - 200 with jsonb return → data = parsed jsonb (list or object)
    # - 400 → function raised exception → error = {message, code, ...}
    # - 404 PGRST202 → function not registered in cache (stale cache or missing grant)
    
    # CRITICAL: 200 with data=[] (empty array) = authorized but no data
    # CRITICAL: 400 P0001 with message = business-logic rejection (e.g., "not a member")
    # Both are "DENIED" from the user's perspective but differ structurally
```
