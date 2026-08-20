#!/usr/bin/env bash
# Deploy SQL to Supabase via Management API + reload PostgREST cache.
# Usage: SUPABASE_TOKEN=<token> PROJECT_REF=<ref> ./deploy_sql_via_mgmt_api.sh <sql_file>
set -e

TOKEN="${SUPABASE_TOKEN:?export SUPABASE_TOKEN=sbp_...}"
REF="${PROJECT_REF:?export PROJECT_REF=ishflkcsdzlhhxtanhxf}"
SQL_FILE="$1"
[ -z "$SQL_FILE" ] && { echo "Usage: SUPABASE_TOKEN=... PROJECT_REF=... $0 <sql_file>"; exit 1; }

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

echo "[1/4] Verifying token scope..."
curl -sfS "https://api.supabase.com/v1/user" \
  -H "Authorization: Bearer $TOKEN" -H "User-Agent: $UA" >/dev/null || \
  { echo "❌ Token invalid or insufficient scope"; exit 1; }
echo "  ✅ Token valid"

echo "[2/4] Verifying owner identity..."
OWNER=$(curl -sS "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -H "User-Agent: $UA" \
  -d '{"query":"SELECT current_user"}' | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['current_user'])")
echo "  ✅ DB owner: $OWNER"
[ "$OWNER" = "postgres" ] || { echo "  ⚠️  WARNING: owner is $OWNER, SECURITY DEFINER functions will inherit this"; }

echo "[3/4] Deploying SQL..."
SQL=$(cat "$SQL_FILE")
# Escape for JSON payload (handles quotes and newlines)
ESCAPED=$(printf '%s' "$SQL" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().replace('\"','\\\\\"')))")
STATUS=$(curl -sS -o /tmp/deploy_result -w "%{http_code}" "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -H "User-Agent: $UA" \
  -d "{\"query\":$ESCAPED}")

if [ "$STATUS" = "201" ] || [ "$STATUS" = "200" ]; then
  echo "  ✅ DDL deployed (HTTP $STATUS)"
else
  echo "  ❌ Deploy failed (HTTP $STATUS)"
  cat /tmp/deploy_result
  exit 1
fi

echo "[4/4] Notifying PostgREST cache reload..."
curl -sS "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -H "User-Agent: $UA" \
  -d "{\"query\":\"NOTIFY pgrst, 'reload schema'\"}" >/dev/null
echo "  ✅ Cache reloaded"

echo ""
echo "Deploy complete. Verify with:"
echo "  python3 references/../../scripts/mgmt_sql_query.py -s \"SELECT proname FROM pg_proc WHERE proname = '<function>'\""
