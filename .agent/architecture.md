# TRIPPI Architecture

## Project
TRIPPI collaborative trip planner

## Frontend
|- Single page application
|- `trip-planner.html` is the main application
|- Supabase access is funneled through `backend/trippi-api.js` (API boundary layer)
|- `backend/supabase-client.js` is the inert loader that injects supabase-js
|- Anonymous auth via `API.ensureAuth()` singleton
|- Personal mode fallback when backend unavailable

## Backend
|- Supabase
|- PostgreSQL
|- RLS enabled (permissive — enforced at application layer)
|- Realtime enabled via Postgres Changes

## Architecture Layers
```
TRIPPI UI (trip-planner.html)
    │  calls API.*() — no direct Supabase access
    ▼
trippi-api.js (backend/trippi-api.js)   ← STABLE CONTRACT
    │  wraps supabase client (.from(), .rpc())
    ▼
Supabase JS Client (CDN, injected by supabase-client.js)
    │
    ├────────────────────────────────── (reads)
    │  direct .from().select()
    │
    ▼  (business mutations)
Supabase RPC Layer  ← Phase 4 (DRAFT: 003_rpc_collaboration.sql)
    │
    ▼
PostgreSQL + Realtime
```
- Reads stay as direct PostgREST queries (getGroup, getItems, getMembers, getExpenses).
- Mutations will route through RPCs (create_group, join_group, create_shared_item, create_expense) for transactional safety.
- All Supabase table mutations/queries go through `API.*` methods.
- The frontend never calls `sb.from()` directly.

## Data Model (Group-first)
```
groups
 ├── group_members
 ├── shared_items
 ├── group_expenses
 └── locations
```

## Creation Flow
```
Create Trip
    │
    ▼
createGroupDirectly()
    │
    ├── API.createGroup() → INSERT groups
    ├── API.joinGroup() → INSERT group_members
    ├── openGroup() → realtime subscription via API._getSb().channel()
    ├── ?group=<uuid>
    └── renderGroupPlanner()
```

## Realtime Subscription
|- Channel created via `API._getSb().channel('group:<uuid>')`
|- Tables: `shared_items`, `group_members`, `group_expenses`
|- Event: `*`
|- Filter: `group_id=eq.<uuid>`
|- Subscription must reach `SUBSCRIBED` state before UI renders
|- Polling fallback: 3 seconds

## Deployment
|- GitHub Pages: master branch
|- Source: `trippi-deploy/` directory
|- Live: https://gilacoding.github.io/trippi/trip-planner.html
|- Backend scripts: `trippi-deploy/backend/` (supabase-client.js, trippi-api.js)
