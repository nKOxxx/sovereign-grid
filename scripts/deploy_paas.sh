#!/bin/zsh
# Sovereign Grid — one-shot PaaS deploy. Run AFTER `fly auth login` (device flow)
# or with RENDER_API_KEY exported. Idempotent; safe to re-run.
set -e
cd /Users/ares/sovereign-grid

echo "== 1/7 build frontend =="
npm run build

echo "== 2/7 fly app =="
fly status --app sovereign-grid 2>/dev/null || fly apps create sovereign-grid --org personal

echo "== 3/7 postgres =="
fly postgres list 2>/dev/null | grep -q sovereign-grid-db || fly postgres create --name sovereign-grid-db --org personal --region iad --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 3
fly postgres attach sovereign-grid-db --app sovereign-grid || true

echo "== 4/7 secrets (only if unset) =="
fly secrets list --app sovereign-grid 2>/dev/null | grep -q "^PORT" || fly secrets set --app sovereign-grid PORT=8080
fly secrets list --app sovereign-grid 2>/dev/null | grep -q "^SESSION_SECRET" || fly secrets set --app sovereign-grid "SESSION_SECRET=$(openssl rand -hex 32)"
# CORS: same-origin serving, but keep Pages origin working during transition
fly secrets list --app sovereign-grid 2>/dev/null | grep -q "^CORS_ORIGINS" || fly secrets set --app sovereign-grid "CORS_ORIGINS=https://nkoxxx.github.io"

echo "== 5/7 deploy =="
fly deploy --remote-only --app sovereign-grid

echo "== 6/7 migrate + seed =="
fly ssh console --app sovereign-grid -C "ls /app/server/db" 2>/dev/null || true
fly ssh console --app sovereign-grid -C "DATABASE_URL=$DATABASE_URL_URL npx --yes node server/src/db/migrate.js" 2>/dev/null || \
  echo "NOTE: run migration manually via fly ssh console (see DEPLOY.md)"

echo "== 7/7 smoke =="
sleep 4
curl -s https://sovereign-grid.fly.dev/api/health && echo
curl -s -o /dev/null -w "spa root: %{http_code}\n" https://sovereign-grid.fly.dev/
