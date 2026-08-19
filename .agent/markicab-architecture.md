# Markicab Product Architecture

Single source of truth for **Markicab** — the zero-courier trip platform.
Status reflects what is *shipped live* (`master` / `marki.cab`) plus the staged roadmap.

> Conventions: "group" = a collaborative trip (legacy `groups` table name is kept
> for backwards compatibility; in prose it is a **trip**). "Member" = any
> authenticated user on a trip. "Guest" = an invite-token viewer, outside
> membership, never able to write.

---

## 1. Vision & Staging (M1 → M6)

| Milestone | Name | User outcome | Status |
|---|---|---|---|
| M1 | Identity + Auth | One identity across email + social | ✅ Email + Google OAuth |
| M2 | Data Foundation | Supabase = source of truth; trips persist; shared-trip security | ✅ Closed (manual E2E passed) |
| M3 | Trip Core | Membership roles + ownership/permissions + trip UX | ✅ Phase 1 (roles) + Phase 2 (itinerary/expenses/payer) + M3.5 (OAuth) |
| M4 | Journey Mode | Map + route + offline + live location | ⏳ Next |
| M5 | Social | Feeds, reactions, followers, public discovery | ⏭ Future |
| M6 | Marketplace | Guides, booking, community commerce | ⏭ Future |

Non-goals at every stage (guarded against scope creep):
- M3 scope excluded: ❌ social feed ❌ likes/comments ❌ public discovery ❌ followers ❌ AI planning ❌ booking ❌ marketplace.
- M5+ features must not be shipped before M4 journey model exists.

---

## 2. System Layers (live)

```
MARKICAB APP (SPA)                       https://marki.cab/trip-planner.html
  │ HTML + CSS + inline JS                 (deployed: master -> gh-pages)
  │   ├── Service worker: trip-planner-sw.js (network-first HTML; personal cache)
  │   └── localStorage keys:
  │       trippi_personal_planner_v2 (cache/offline drafts)
  │       trippi_display_name
  │       trippi_migration_v
  │
  │  calls API.*() — NO direct supabase client in HTML
  ▼
trippi-api.js  (backend/trippi-api.js)    STABLE CONTRACT (window.TrippiAPI)
  │  wraps supabase client: .from().select() for reads, .rpc() for mutations
  │  ensureAuth() singleton; email + Google OAuth; signed-in required for writes
  ▼
supabase-client.js  (backend/supabase-init.js)  lazy loader: @supabase/supabase-js v2 from CDN
  ▼
Supabase (ishflkcsdzlhhxtanhxf)
  ├── Auth        email/password + Google OAuth (anon auth DISABLED)
  ├── Postgres    RLS enforced server-side
  └── Realtime    channel group:<uuid> · tables: shared_items, group_members, group_expenses
```

Notes:
- `backend/travelo-api.js` and `backend/supabase-client.js` are inert scaffolds (M0); not on the live path.
- Reads go through PostgREST (`.from().select()`); business mutations go through RPCs so ownership/permission logic is centralized and auditable.

---

## 3. Identity & Auth (M1)

```
                     Markicab Auth
                       auth.uid()
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
     Google              Email               (future: Apple)
      OAuth             Password
```

- `auth.users.id` is THE identity for every row (`created_by`, `group_members.user_id`, `group_expenses.paid_by`).
- Email/password still supported → "Continue with Google" is additive.
- Anonymous Auth: **disabled** (guests use the publishable anon *key* in RPC-scoped calls only — never user creation).
- `mailer_autoconfirm = false` → real users confirm by email. (Test accounts: founder confirms.)

---

## 4. Permission Model (M3 Phase 1) — source of truth

Roles (stored `group_members.role`, only `owner`/`member`):

| Action | Owner (creator) | Member | Guest (token) |
|---|---|---|---|
| View trip | ✅ | ✅ | token-only ✅ |
| Edit itinerary | ✅ | ✅ | ❌ |
| Add expense | ✅ | ✅ | ❌ |
| `paid_by` on expense (anyone) | ✅ | ✅ | ❌ |
| Delete trip | ✅ | ❌ | ❌ |
| Invite people / share trip link | ✅ | ❌ | ❌ |
| Manage members (remove) | ✅ | ❌ | ❌ |
| View live location | future | consent | ❌ |

Enforcement:
- Server-side: RLS + SECURITY DEFINER RPCs (`create_group`, `join_group`, `create_shared_item`, `create_expense`, `remove_member`, `delete_group`, `leave_group`, `trip_permissions`, `create_invitation`, `redeem_invitation`, `get_guest_trip`, etc.).
- UI only *hides* controls (`applyPermsUI`: hides `inviteGroupBtn`/`shareTrip` for non-owners); the RPCs independently reject — defense in depth.
- **Guest security** (verbatim constraint): guests cannot create/share trips; only the trip creator can share; trip membership does *not* grant sharing/invitation; live location stays trip-scoped and consent-based.

Trip identity: `trip_permissions(p_group_id)` returns the full matrix (is_member/is_owner/can_view/can_edit/can_add_expense/can_delete/can_invite/can_manage_members) — the single source of truth for UI gating.

---

## 5. Trip Object = the container (M3 Phase 2)

```
Trip (= groups row)
├── Identity
│   ├── title            groups.name
│   ├── destination      groups.destination
│   ├── start_date       groups.start_date
│   ├── end_date         groups.end_date
│   ├── cover            groups.cover_image  (future: trip_media)
│   └── creator          groups.created_by  (owner)
├── People
│   ├── owner            group_members (role='owner')
│   └── members          group_members (role='member')
├── Plan
│   ├── agenda           shared_items   (DAY n · k stops · 📍 pins · map links)
│   ├── expenses         group_expenses (amount / payer / category / linked item)
│   └── future locations trip_locations  (future, M4)
└── Memories  (future, M4/M5)
```

Future-proofing: shared items/media/locations/activity hang off `trip_*` tables, **not** directly on `groups` (avoids the `trip -> image/location/social` anti-pattern).

### Agenda = operating plan, not a todo list
Model: `shared_items` rows tagged by `date` + `time`.
- Presentation: day-bucketed, time-sorted timeline.
- Day header: `Hari N · {date} · {k} titik` (stop count).
- Items with a map link render a 📍 location pin (prep for M4 maps / meeting points / live location).
- This is the "mission plan" for a group moving through space+time.

### Expenses (kept small — data quality foundation)
```
group_expenses
├── amount        numeric
├── paid_by       uuid  → auth.users  (who paid; defaults to logger)
├── category      text
├── note          text
├── date          text   (M3 used text to match existing column type; future: typed date)
└── created_by    uuid  → auth.users  (logger)
```
M3 goal = data quality only. Settlement ("calculate balances → settle → archive") is a post-trip M4/M5 feature.

---

## 6. Guest flow (M2 security patch, unchanged by M3)
```
Open trip link (?gt={token})
   ↓  (publishable anon key, RPC-scoped)
Read-only trip view  (itinerary / members / expenses)
   ↓  guest wants to do more
"Continue with Google" (or email)
   ↓  SIGNED_IN fires onAuthChange
redeem_invitation(token, displayName)  →  becomes real member
```
Guest link = acquisition channel. `redeem_invitation` accepts authenticated users (so OAuth login converts a guest into a member of the trip they landed on).

---

## 7. Deployment
- Static: GitHub `master` → GitHub Pages (custom domain `marki.cab`).
- Source: `trippi-deploy/` (deploy from here only, never `mockup/`).
- SW: network-first HTML (so logic updates ship on next load; one reload for legacy SW users).
- CDN propagation: ~20s lag after push (Pages edge) — watch for it.
- Auth redirect: `https://ishflkcsdzlhhxtanhxf.supabase.co/auth/v1/callback`.

## 8. M4 roadmap (next)
1. Map foundation
2. Route / waypoint model (`trip_locations` table)
3. Offline cache (SW + IndexedDB; localStorage already the cache layer)
4. Live location — consent-based, **after** map+route model exists (NOT first)
5. Trip memories
