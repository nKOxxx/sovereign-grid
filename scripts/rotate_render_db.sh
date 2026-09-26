#!/usr/bin/env bash
# scripts/rotate_render_db.sh — Sovereign Grid free-tier DB rotation.
#
# Render free Postgres expires 30 days after creation (hard, API-confirmed:
# expiresAt field). Instead of paying, rotate: dump the live DB, create a fresh
# free DB via the Render API (its own new 30-day window), provision roles,
# restore, swap the app's DATABASE_URL env var, redeploy, verify, and retire
# the old DB.
#
# Hosting: the app runs as a Render FREE WEB SERVICE (srv-darmnvrncjis73e9c8jg (successor, primary since 9/26),
# https://sovereign-grid-zzxu.onrender.com) — free web services do NOT expire
# (unlike free Postgres) and need no card. Fly was retired 2026-09-25 (trial
# ended; app remains there but is suspended and unused).
#
# Usage:
#   rotate_render_db.sh check    # exit 0 if healthy and >7 days left
#   rotate_render_db.sh rotate   # full rotation (only if <=7 days left)
#   rotate_render_db.sh watch    # silent-when-healthy; alerts on outage/expiry
#
# Secrets: Render API key parsed from ~/.render/cli.yaml (never printed).
# Connection strings live in /tmp files 0600 and are never echoed.
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
RENDER_SID=srv-darmnvrncjis73e9c8jg          # web service sovereign-grid-o707 (successor, primary since 9/26)
RENDER_URL=https://sovereign-grid-o707.onrender.com
DB_ID=dpg-dar1o0g473hc739h2ut0-a

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { echo "FATAL: $*" >&2; exit 1; }

render_api() { # method path [json-payload]
  local method=$1 path=$2 payload=${3:-}
  if [ -n "$payload" ]; then
    curl -s -X "$method" -H "Authorization: Bearer $RENDER_KEY" \
      -H 'Content-Type: application/json' -d "$payload" "$API$path"
  else
    curl -s -X "$method" -H "Authorization: Bearer $RENDER_KEY" "$API$path"
  fi
}

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
  render_api POST /postgres '{
    "name": "sovereign-grid-db", "plan": "free", "version": "17",
    "region": "oregon", "databaseName": "sovereign_grid_db",
    "databaseUser": "sovereign_grid_db_user"
  }' | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])"
}

wait_available() {
  local id=$1 n=0
  while :; do
    S=$(curl -s -H "Authorization: Bearer $RENDER_KEY" "$API/postgres/$id" \
      | python3 -c "import json,sys; print(json.load(sys.stdin)['status'])")
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

# Capture the new DB's external connection string. The Render API returns
# credentials ONLY in the create response (reads show connectionInfo: null),
# so make_db must be called together with this in one pipeline if the shape
# ever changes. Writes 0600 file; never echoes.
capture_new_url() {
  local id=$1
  curl -s -H "Authorization: Bearer $RENDER_KEY" "$API/postgres/$id" > /tmp/sg_newdb_meta.json
  python3 - <<'EOF' > "$NEW_URL_FILE"
import json
d = json.load(open('/tmp/sg_newdb_meta.json'))
ci = d.get('connectionInfo') or {}
url = ''
if isinstance(ci, dict):
    url = ci.get('externalConnectionUri') or ''
elif isinstance(ci, str):
    url = ci
print(url.strip())
EOF
  chmod 600 "$NEW_URL_FILE"
  [ -s "$NEW_URL_FILE" ] || die "connectionInfo missing on read (API changed?) — new DB $id has no captured creds; delete it in the dashboard"
  grep -q "sslmode=" "$NEW_URL_FILE" || printf '?sslmode=require' >> "$NEW_URL_FILE"
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

# Swap the app's DATABASE_URL env var and redeploy the web service.
swap_app_database_url() { # new_serving_url
  local new_url=$1
  python3 - "$RENDER_KEY" "$RENDER_SID" "$new_url" <<'EOF'
import json, sys, urllib.request
key, sid, new_url = sys.argv[1], sys.argv[2], sys.argv[3]
def api(path, method='GET', payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request('https://api.render.com/v1' + path, data=data, method=method,
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req))
cur = api(f'/services/{sid}/env-vars')
items = []
for it in cur:
    e = it.get('envVar', it) if isinstance(it, dict) else it
    items.append({'key': e['key'], 'value': new_url if e['key'] == 'DATABASE_URL' else e['value']})
assert any(i['key'] == 'DATABASE_URL' for i in items), 'DATABASE_URL missing from service env'
api(f'/services/{sid}/env-vars', 'PUT', items)
dep = api(f'/services/{sid}/deploys', 'POST', {})
print(dep.get('id', ''))
EOF
}

wait_deploy_live() { # deploy_id
  local dep=$1 n=0
  while :; do
    S=$(render_api GET "/services/$RENDER_SID/deploys/$dep" \
      | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('deploy') or d).get('status',''))")
    log "deploy: $S"
    case "$S" in live) return 0 ;; build_failed|deploy_failed|canceled|deactivated) return 1 ;; esac
    n=$((n+1)); [ $n -gt 40 ] && return 1
    sleep 15
  done
}

app_healthy() {
  curl -s -m 90 "$RENDER_URL/api/health" | grep -q '"ok":true'
}

# The app's current serving URL = its live DATABASE_URL env var (sg_app role).
# Read it at rotation start so rollback restores the exact prior value.
current_serving_url() {
  render_api GET "/services/$RENDER_SID/env-vars" | python3 -c "
import json, sys
for it in json.load(sys.stdin):
    e = it.get('envVar', it) if isinstance(it, dict) else it
    if e.get('key') == 'DATABASE_URL':
        print(e.get('value', ''))
        break
"
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
  capture_new_url "$NEW_ID"

  APP_PW=$(openssl rand -hex 16)
  NEW_ADMIN_URL=$(cat "$NEW_URL_FILE")
  provision_roles "$NEW_ADMIN_URL" "$APP_PW"

  log "restoring dump…"
  "$PG_RESTORE" --no-owner --no-acl -d "$NEW_ADMIN_URL" "$DUMP" 2>/tmp/sg_restore_warn.txt
  # objects arrive owned by sg_admin (no-owner mode); sg_app still gets its
  # grants via ALTER DEFAULT PRIVILEGES only for NEW tables — so re-grant
  # explicitly as superuser for the restored ones:
  $PSQL "$NEW_ADMIN_URL" >/dev/null <<SQL
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sg_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sg_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM sg_app;
SQL
  log "restore + grants done"

  OLD_SERVING=$(current_serving_url)
  [ -n "$OLD_SERVING" ] || die "could not read current DATABASE_URL from service $RENDER_SID"
  # ops handle now points at new DB admin URL
  echo "$NEW_ADMIN_URL" > "$OLD_URL_FILE"
  chmod 600 "$OLD_URL_FILE"

  # serving URL for the app: sg_app role over the new external host
  SERVING_URL=$(python3 - "$APP_PW" <<'EOF'
import sys, urllib.parse
pw = sys.argv[1]
src = urllib.parse.urlparse(open('/tmp/sg_render_ext_next.txt').read().strip())
print(f'postgres://sg_app:{pw}@{src.hostname}:{src.port or 5432}{src.path}?sslmode=require')
EOF
)

  log "swapping app DATABASE_URL + redeploying…"
  DEP=$(swap_app_database_url "$SERVING_URL")
  [ -n "$DEP" ] && wait_deploy_live "$DEP" || sleep 90

  if app_healthy; then
    log "health OK — now serving from $NEW_ID"
    log "old DB $DB_ID now unused — destroy after a day of stability:"
    log "  curl -X DELETE -H 'Authorization: Bearer \$RENDER_KEY' $API/postgres/$DB_ID"
    log "dump kept at: $DUMP"
  else
    log "health FAILED after swap — rolling back"
    echo "$OLD_SERVING" > "$OLD_URL_FILE"
    chmod 600 "$OLD_URL_FILE"
    RDEP=$(swap_app_database_url "$OLD_SERVING")
    [ -n "$RDEP" ] && wait_deploy_live "$RDEP" || sleep 90
    if app_healthy; then
      log "rollback OK — old DB serving; new DB $NEW_ID is garbage to delete in dashboard"
    else
      log "ROLLBACK ALSO FAILED — manual fix: set DATABASE_URL on service $RENDER_SID"
    fi
    exit 1
  fi
}

case "${1:-}" in
  check) check ;;
  rotate) rotate ;;
  watch)
    # Silent-when-healthy watchdog: app health + expiry days. Output/nonzero
    # exit only on trouble — safe for a daily cron with no-agent delivery.
    if ! app_healthy; then
      echo "SG ALERT: app unhealthy — $RENDER_URL (Render free tier cold-starts after 15m idle; if alert repeats hourly, investigate)"
      exit 1
    fi
    LEFT=$(days_left)
    python3 -c "import sys; sys.exit(0 if float('$LEFT') > 7 else 9)" || {
      echo "SG ALERT: Render DB expires in ${LEFT} days — run scripts/rotate_render_db.sh rotate (or add a card + upgrade in the Render dashboard)"
      exit 9
    }
    ;;
  *) echo "usage: $0 check|rotate|watch"; exit 2 ;;
esac
