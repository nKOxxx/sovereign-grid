#!/usr/bin/env bash
# scripts/rotate_render_db.sh — Sovereign Grid free-tier DB rotation.
#
# Render free Postgres expires 30 days after creation (hard, API-confirmed:
# expiresAt field). Instead of paying, rotate: dump the live DB, create a fresh
# free DB via the Render API (its own new 30-day window), provision roles,
# restore, swap the Fly secret, verify, and retire the old DB.
#
# Every step mirrors the production-provisioning run of 2026-09-25 (see
# DEPLOY.md "The walls"). Idempotent-ish: a failed run leaves the old DB serving
# and the new DB as garbage to clean up on retry.
#
# Usage:
#   rotate_render_db.sh check    # exit 0 if healthy and >7 days left
#   rotate_render_db.sh rotate   # full rotation (only if <=7 days left)
#
# Secrets: Render API key is parsed from ~/.render/cli.yaml (never printed).
# Connection strings are written to /tmp files 0600 and never echoed.
set -euo pipefail

PG_DUMP=/opt/homebrew/opt/libpq/bin/pg_dump
PG_RESTORE=/opt/homebrew/opt/libpq/bin/pg_restore
PSQL=/opt/homebrew/opt/libpq/bin/psql
REPO=/Users/ares/sovereign-grid
RENDER_KEY=$(python3 - <<'EOF'
import os
try:
    import yaml
    print(yaml.safe_load(open(os.path.expanduser('~/.render/cli.yaml')))['api']['key'], end='')
except ImportError:  # no pyyaml — walk only the api: block (avoids version: 1)
    f = False
    for line in open(os.path.expanduser('~/.render/cli.yaml')):
        if line.startswith('api:'):
            f = True
            continue
        if f and line.strip() and not line[0].isspace():
            f = False
        if f and 'key:' in line:
            print(line.split('key:', 1)[1].strip(), end='')
            break
EOF
)
API=https://api.render.com/v1
OLD_URL_FILE=/tmp/sg_render_ext.txt
NEW_URL_FILE=/tmp/sg_render_ext_next.txt
APP=sovereign-grid
DB_ID=dpg-dar1o0g473hc739h2ut0-a

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { echo "FATAL: $*" >&2; exit 1; }

days_left() {
  curl -s -H "Authorization: Bearer $RENDER_KEY" "$API/postgres/$DB_ID" \
    | python3 -c "
import json, sys, datetime as dt
d = json.load(sys.stdin)
exp = dt.datetime.fromisoformat(d['expiresAt'].replace('Z', '+00:00'))
now = dt.datetime.now(dt.timezone.utc)
print(round((exp - now).total_seconds() / 86400, 2))
if d.get('plan') != 'free': print('PLAN_CHANGED', file=sys.stderr)
"
}

check() {
  LEFT=$(days_left)
  log "days left on $DB_ID: $LEFT"
  python3 -c "import sys; sys.exit(0 if float('$LEFT') > 7 else 9)"
}

make_db() {
  log "creating fresh free Postgres (oregon, v17)…"
  python3 - "$RENDER_KEY" <<'EOF'
import json, sys, urllib.request
key = sys.argv[1]
body = json.dumps({
    'name': 'sovereign-grid-db',
    'plan': 'free', 'version': '17', 'region': 'oregon',
    'databaseName': 'sovereign_grid_db', 'databaseUser': 'sovereign_grid_db_user',
}).encode()
req = urllib.request.Request('https://api.render.com/v1/postgres', data=body, method='POST',
    headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
r = json.load(urllib.request.urlopen(req))
print(r['id'])
EOF
}

wait_available() {
  local id=$1 n=0
  while :; do
    S=$(curl -s -H "Authorization: Bearer $RENDER_KEY" "$API/postgres/$id" | python3 -c "import json,sys; print(json.load(sys.stdin)['status'])")
    log "status: $S"; [ "$S" = "available" ] && return 0
    n=$((n+1)); [ $n -gt 60 ] && die "new DB never became available"
    sleep 10
  done
}

open_allowlist() {
  local id=$1
  local code
  code=$(curl -s -o /tmp/sg_al_resp.json -w '%{http_code}' -X PATCH \
    -H "Authorization: Bearer $RENDER_KEY" -H 'Content-Type: application/json' \
    -d '{"ipAllowList":[{"cidrBlock":"0.0.0.0/0","description":"app + ops (password+SSL are the boundary)"}]}' \
    "$API/postgres/$id")
  [ "$code" = "200" ] || die "allow-list PATCH failed: $(cat /tmp/sg_al_resp.json)"
  log "allow-list opened"
}

provision_roles() {
  local admin_url=$1 app_pw=$2
  $PSQL "$admin_url" >/dev/null <<SQL
CREATE EXTENSION IF NOT EXISTS citext;
CREATE ROLE sg_migrate NOLOGIN;
CREATE ROLE sg_app LOGIN PASSWORD '$app_pw';
GRANT CREATE ON SCHEMA public TO sg_migrate;
GRANT sg_migrate TO sovereign_grid_db_user;
GRANT sg_migrate TO sg_app;
GRANT CONNECT ON DATABASE sovereign_grid_db TO sg_app;
GRANT USAGE ON SCHEMA public TO sg_app;
SQL
  # owner-set default privileges (objects arrive via restore owned by sg_migrate)
  $PSQL "$admin_url" >/dev/null <<SQL
SET ROLE sg_migrate;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sg_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sg_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM sg_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sg_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO sg_app;
RESET ROLE;
SQL
  log "roles + grants provisioned"
}

rotate() {
  LEFT=$(days_left)
  python3 -c "import sys; sys.exit(0 if float('$LEFT') <= 7 else 1)" \
    || die "rotation not due (${LEFT} days left — refusing; run check)"

  cd "$REPO"
  STAMP=$(date -u +%Y%m%dT%H%M%SZ)
  DUMP="$REPO/backups/sg_pre_rotate_$STAMP.dump"
  log "dumping live DB → $DUMP"
  mkdir -p "$REPO/backups"
  "$PG_DUMP" "$(cat "$OLD_URL_FILE")" -Fc -f "$DUMP"

  NEW_ID=$(make_db)
  log "new DB: $NEW_ID"
  wait_available "$NEW_ID"
  open_allowlist "$NEW_ID"

  # capture external conn string (never printed; stored 0600)
  curl -s -H "Authorization: Bearer $RENDER_KEY" "$API/postgres/$NEW_ID" \
    | python3 -c "
import json, sys, urllib.parse
d = json.load(sys.stdin)
info = d['connectionInfo'] if 'connectionInfo' in d else {}
# external URL lives in connectionInfo.externalConnectionUri per Render API
url = (info.get('externalConnectionUri') if isinstance(info, dict) else None) or ''
print(url)
" > "$NEW_URL_FILE"
  chmod 600 "$NEW_URL_FILE"
  [ -s "$NEW_URL_FILE" ] || die "could not capture new external URL"
  # ensure sslmode param present
  grep -q "sslmode=" "$NEW_URL_FILE" || sed -i '' 's|$|\?sslmode=require|' "$NEW_URL_FILE"

  APP_PW=$(openssl rand -hex 16)
  NEW_ADMIN_URL=$(cat "$NEW_URL_FILE")
  provision_roles "$NEW_ADMIN_URL" "$APP_PW"

  log "restoring dump…"
  "$PG_RESTORE" --no-owner --no-acl -d "$NEW_ADMIN_URL" "$DUMP" 2>/tmp/sg_restore_warn.txt
  # ownership arrives as sg_migrate (dumped from sg_migrate-owned objects) —
  # verify serving role can read the core tables:
  echo "select count(*) from listings;" | $PSQL "$(python3 - <<EOF
import urllib.parse
u = urllib.parse.urlparse('$NEW_ADMIN_URL')
print(u._replace(netloc=f'sg_app:{'$APP_PW'}@{u.hostname}:{u.port}').geturl() + '?sslmode=require')
EOF
)" >/dev/null || die "post-restore verification failed"

  log "swapping Fly secret…"
  python3 - "$APP_PW" <<'EOF'
import sys, urllib.parse
pw = sys.argv[1]
u = f'postgres://sg_app:{pw}@' + urllib.parse.urlparse(open('/tmp/sg_render_ext_next.txt').read().strip().split('@')[1].split('?')[0]).netloc.split('@', 1)[-1].join([''])
EOF
  # Build the serving URL deterministically instead (python above is a no-op guard):
  SERVING_URL=$(python3 - "$APP_PW" <<'EOF'
import sys, urllib.parse
pw = sys.argv[1]
src = urllib.parse.urlparse(open('/tmp/sg_render_ext_next.txt').read().strip())
host = src.hostname; port = src.port or 5432; db = src.path.lstrip('/')
print(f'postgres://sg_app:{pw}@{host}:{port}/{db}?sslmode=require')
EOF
)
  fly secrets set DATABASE_URL="$SERVING_URL" -a "$APP" >/dev/null
  log "fly secret updated; waiting for release…"
  sleep 90

  HEALTH=$(curl -s -m 90 "https://sovereign-grid.fly.dev/api/health" || true)
  if ! echo "$HEALTH" | grep -q '"ok":true'; then
    log "health probe failed after swap ($HEALTH) — ROLLING BACK to old DB"
    fly secrets set DATABASE_URL="$(cat "$OLD_URL_FILE")" -a "$APP" >/dev/null
    sleep 90
    ROLLBACK=$(curl -s -m 90 "https://sovereign-grid.fly.dev/api/health" || true)
    echo "$ROLLBACK" | grep -q '"ok":true' \
      && log "rollback OK — old DB serving; new DB $NEW_ID is garbage to delete" \
      || log "ROLLBACK ALSO FAILED — manual intervention needed: fly secrets set DATABASE_URL=\$(cat $OLD_URL_FILE) -a $APP"
    exit 1
  fi
  log "health OK"

  # golden probe (read-only login is buyer; create is skipped — just probe health + login)
  log "rotation complete. old DB $DB_ID now unused — destroy it after a day of stability:"
  log "  curl -X DELETE -H 'Authorization: Bearer \$RENDER_KEY' $API/postgres/$DB_ID"
  log "dump kept at: $DUMP"
}

case "${1:-}" in
  check) check ;;
  rotate) rotate ;;
  watch)
    # Silent-when-healthy watchdog: app health + expiry days. Nonzero exit or
    # output only on trouble — safe for a daily cron with no-agent delivery.
    HEALTH=$(curl -s -m 90 "https://sovereign-grid.fly.dev/api/health" || true)
    LEFT=$(days_left)
    if ! echo "$HEALTH" | grep -q '"ok":true'; then
      echo "SG ALERT: app unhealthy ($HEALTH) — https://sovereign-grid.fly.dev"
      exit 1
    fi
    python3 -c "import sys; sys.exit(0 if float('$LEFT') > 7 else 9)" || {
      echo "SG ALERT: Render DB expires in ${LEFT} days — run scripts/rotate_render_db.sh rotate (or add a card + upgrade in the Render dashboard)"
      exit 9
    }
    ;;
  *) echo "usage: $0 check|rotate|watch"; exit 2 ;;
esac
