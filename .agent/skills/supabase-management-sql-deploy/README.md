# Files in this skill package
- `SKILL.md` — main instructions (read first)
- `references/mgmt-api-sql-deploy.md` — session-specific deployment notes + Cloudflare bypass + cache reload rules
- `references/postgrest-404-decision-tree.md` — PGRST202/404 troubleshooting decision tree
- `references/security-contract-test-patterns.md` — 8-case admission gate testing patterns with rotated JWTs
- `scripts/deploy_sql_via_mgmt_api.sh` — one-command deploy SQL file + NOTIFY reload
- `scripts/mgmt_sql_query.py` — run arbitrary SQL via Management API (201=DDL success, 200=SELECT)

## Prerequisites
```bash
export SUPABASE_TOKEN="sbp_..."      # Management API access token
export PROJECT_REF="ishflkcsdzlhhxtanhxf"  # Supabase project ref
```

## Quick deploy
```bash
./scripts/deploy_sql_via_mgmt_api.sh path/to/migration.sql
```
