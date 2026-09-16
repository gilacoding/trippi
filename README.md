# MarkiCab — Group Trip Planner

> Rencana bareng. Cabut bareng.

MarkiCab is a collaborative group-trip organizer that covers the full journey: **plan → travel → remember**. Built as a vanilla-JS SPA on Supabase, deployed to GitHub Pages.

## What It Does

- **Trip planning** — itinerary, day tabs, budget estimates, wishlist
- **Group collaboration** — real-time editing, shared expenses, crew management
- **Journey Mode** — live group map with location sharing during the trip
- **Guest access** — join via link, no account required (name only)
- **Trip memory** — gallery with photos/videos per trip

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS (ES modules), single-page app |
| Backend | Supabase (Postgres + Realtime + Auth + Storage) |
| Deployment | GitHub Pages (auto-deploy from `master`) |
| Caching | Service Worker (versioned cache) |

### Source of Truth

**The database is the only source of truth.** Client state (`colState`) is a reactive cache that converges toward the DB on every render cycle. All mutations go through RPCs with server-side authorization.

### Privacy Model

- Trip creator owns the trip
- Members can collaborate (edit itinerary, add expenses, view gallery)
- Guests can join via `?gt=` link — read-only + own location sharing
- Personal expenses are private to the owner
- Trip expenses are visible to all members

## Local Development

```bash
cd trippi-deploy
# Serve locally (any static server)
npx serve .
# or
python -m http.server 8000
```

Open `http://localhost:8000/trip-planner.html`

## Deployment

Push to `master` → auto-deploys to GitHub Pages → `https://marki.cab`

**Important:** After any change to `trip-planner.html` or its JS modules, bump `CACHE_VERSION` in `markicab-sw.js`:

```js
const CACHE_VERSION = 'markicab-personal-v66'; // increment
```

## Database

- **URL:** `https://ishflkcsdzlhhxtanhxf.supabase.co`
- **Auth:** Email/password + anonymous guests
- **RLS:** All tables have Row Level Security enabled
- **RPCs:** All mutations go through `SECURITY DEFINER` functions

### Key Tables

| Table | Purpose |
|-------|---------|
| `trips` | Trip metadata (name, dates, destination) |
| `group_members` | Trip membership |
| `shared_items` | Itinerary items |
| `group_expenses` | Trip expenses |
| `wishlist_items` | Group wishlist |
| `journey_sessions` | Journey Mode state |
| `member_locations` | Live location data |
| `location_permissions` | Location consent |
| `product_events` | Activation telemetry |

## Telemetry

Minimal activation funnel (no PII):

| Event | Fires After |
|-------|-------------|
| `trip_created` | Group creation succeeds |
| `guest_joined` | Guest redeems invite |
| `journey_started` | Journey Mode activates |

Query via:
```sql
SELECT event_name, count(*) FROM product_events GROUP BY event_name;
```

## License

Proprietary — Gilang Rasaqi / marki.cab
