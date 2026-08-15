# TRIPPI Architecture

## Project
TRIPPI collaborative trip planner

## Frontend
- Single page application
- `trip-planner.html` is the main application
- Supabase client runs directly from frontend via `backend/supabase-client.js`
- Anonymous auth enabled
- Personal mode fallback when backend unavailable

## Backend
- Supabase
- PostgreSQL
- RLS enabled
- Realtime enabled via Postgres Changes

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
    ├── insert groups
    ├── insert group_members
    ├── open ?group=<uuid>
    └── realtime subscription via openGroup()
```

## Realtime Subscription
- Channel name: `group:<uuid>`
- Tables: `shared_items`, `group_members`, `group_expenses`
- Event: `*`
- Filter: `group_id=eq.<uuid>`
- Subscription must reach `SUBSCRIBED` state before UI renders
- Polling fallback: 3 seconds

## Deployment
- GitHub Pages: master branch
- Source: `trippi-deploy/` directory
- Live: https://gilacoding.github.io/trippi/trip-planner.html
