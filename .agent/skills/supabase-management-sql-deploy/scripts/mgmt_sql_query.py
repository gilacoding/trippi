#!/usr/bin/env python3
"""
Run read-only or DDL SQL via Supabase Management API SQL query endpoint.
Treats HTTP 201 as DDL success (NOT 200).

Usage:
  export SUPABASE_TOKEN=sbp_...
  export PROJECT_REF=ishflkcsdzlhhxtanhxf
  python3 mgmt_sql_query.py "SELECT current_user"
  python3 mgmt_sql_query.py -f my_migration.sql

Pitfall: This uses a DIRECT SQL connection (the Mgmt API database query pool),
which means NOTIFY pgrst from here DOES propagate — unlike the REST RPC layer.
"""
import urllib.request
import json
import sys
import os

REF = os.environ.get("PROJECT_REF", "ishflkcsdzlhhxtanhxf")
TOKEN = os.environ.get("SUPABASE_TOKEN")

if not TOKEN:
    print("❌ Export SUPABASE_TOKEN=sbp_...", file=sys.stderr)
    sys.exit(1)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

def sql_query(sql):
    """Execute SQL via Management API. Returns (status_code, result)."""
    url = f"https://api.supabase.com/v1/projects/{REF}/database/query"
    payload = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": UA
    })
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        body = resp.read().decode()
        # 201 = DDL success (empty body)
        # 200 = SELECT result (JSON array)
        if resp.status == 201 or not body:
            return 201, []
        return resp.status, json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:500]
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, body

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "-f":
        # Read SQL from file
        with open(sys.argv[2], encoding="utf-8") as f:
            sql = f.read()
    else:
        sql = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()

    status, result = sql_query(sql)

    if status in (200, 201):
        if status == 201:
            print(f"HTTP {status} — DDL executed (empty result)")
        else:
            print(json.dumps(result, indent=2, default=str)[:2000])
    else:
        print(f"HTTP {status}", file=sys.stderr)
        if isinstance(result, dict):
            print(json.dumps(result, indent=2), file=sys.stderr)
        else:
            print(result, file=sys.stderr)
        sys.exit(1)
