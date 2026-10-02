# Sovereign Grid — Session Resume Kit (written 2026-09-25 night)

Handoff file. If you (next session) are asked to "use the optimization we built", start here.
Memory tool was down when this was written — this file + BUILD_LEDGER.md + DEPLOY.md are the source of truth.

## What this is
GPU compute marketplace (Sovereign Grid), pilot-complete. The "optimization" = matching pipeline
(seller pool → hard filters → rank → golden allocation) + operator Fee Engine (fee sensitivity,
fee flow, partner split, live policy) — the thing that turns listing prices into buyer prices with
a platform fee and 93/90/87 golden outcome.

## Where it runs
- **Public:** https://sovereign-grid-o707.onrender.com — Render free web svc (docker runtime),
  ~50 s cold start (svc srv-darmnvrncjis73e9c8jg; zzxu=legacy fallback) after 15 min idle, no card, never expires.
- **Local:** from repo root:
  ```
  npm run build   # if dist/ is stale (design pass b354e19 ships self-hosted fonts into dist)
  export DATABASE_URL="$(cat /tmp/sg_render_ext.txt)"   # [REDACTED] — never echo/cat
  export SG_STATIC_DIR=$PWD/dist PORT=8787
  caffeinate -dism node server/src/boot.js   # → http://127.0.0.1:8787
  ```
- **Code:** /Users/ares/sovereign-grid @ `5ea1546` (chain: fc0bcea hygiene → b354e19 design pass → 5ea1546 ledger).

## Golden outcome (the number to protect)
Project Falcon scenario: **93/90/87** — Nordic H200 $2.15→$3.31 · MI300X $1.85→$2.85 ·
GulfGrid $2.20→$3.38 · Ascend DQ'd (D15 verbatim) · 2 hard-filtered. Fee default 0.08.
Replay (self-cleaning, safe on prod):
```
export DATABASE_URL="$(cat /tmp/sg_render_ext.txt)"
TOKEN=$(node scripts/op_session.mjs)
SG_E2E_BASE=http://127.0.0.1:8787 SG_OP_TOKEN="$TOKEN" python3 e2e/golden_live.py   # expect 6/6
```

## Test floors (all green at snapshot)
- server suite **106/106** · frontend vitest **153/153** (incl. 3 design-guard tests) · e2e **26/26** (`e2e/verify_demo.py`) · golden_live **6/6** local + prod.
- e2e needs the local server up: `SG_E2E_BASE=http://127.0.0.1:8787 ~/venvs/fcc/bin/python e2e/verify_demo.py`.

## Auth
- Buyer demo: `falcon@demo.local` (works).
- Operator password is **rotated** — never use the dev password; mint sessions: `node scripts/op_session.mjs`.

## Infra facts
- Render service `srv-dar8u8id0e5s73bucs30`, auto-deploy on push to main. CLI: `/opt/homebrew/bin/render` (key in ~/.render/cli.yaml [REDACTED]).
- DB `dpg-dar1o0g473hc739h2ut0-a` = Render free Postgres, **hard expiry 2026-10-25T07:00Z** →
  rotation script `scripts/rotate_render_db.sh check|rotate|watch`, watchdog cron `bd6bc7747401` daily 09:00.
  Snapshot: `backups/sg_prod_20260925.dump` + `backups/sg_public_20261002.dump` (clean, validated 10/2).
- Subdomain immutable (`-zzxu` stays until a successor service is created; `POST /v1/services` was 500-ing
  9/25 eve — retry steps in DEPLOY.md).
- `/tmp/sg_render_ext.txt` (DB conn) and `/tmp` helpers die on reboot — long-term source is the Render env var.

## Rotation rehearsal findings (2026-10-02, real API probes — script patched accordingly)
1. **Raw `POST /v1/postgres` now 404s** (API changed since 9/25). `make_db` now shells out to
   `render postgres create … --confirm -o json` (works).
2. **Free tier = ONE active free PG.** Create with the old DB alive → 400
   "cannot have more than one active free tier database". Rotate() now: dump →
   `pg_restore --list` validate → DELETE old (`render postgres delete --confirm`) →
   create new → restore. Rollback artifact = the validated pre-rotate dump, NOT the old DB.
3. **Dumps must be `--schema=public`**: SG tables are RLS-on but not FORCED (owner dumps fine);
   the co-tenant `alleadz` schema is FORCE-RLS and blocks pg_dump COPY without app.tenant_id.
4. **alleadz co-tenancy**: alleadz.onrender.com's DATABASE_URL points at THIS DB (free-PG-1
   limit). Rotation now re-runs alleadz migrations into the new DB after restore. alleadz
   DATA (if any) is NOT backed up by this script — export separately before rotating.
5. **App env drifted from role separation**: service DATABASE_URL is currently the
   `sovereign_grid_db_user` (admin) URL, not the `sg_app` serving URL from 9/25. Restore of
   proper role separation is a pending fix; rotation's swap writes a proper sg_app URL.
6. `/tmp/sg_render_ext.txt` regenerated 10/2 from the service env-var API (that path works).

## Rules that must survive the restart
- **NO PAID HOSTING** (binding). Free tier only.
- **Design law binding:** any UI change → load `world-class-frontend` skill + `design/tokens.css` first;
  guard tests now enforce (native selects / light-theme classes fail CI).
- 18-point security baseline on every build (CSP stays strict; fonts are self-hosted, don't add CDNs).
- Hermes config only via `hermes config set`. Autonomy: loop and build, don't ask.

## Open items (small)
1. Successor Render service for a clean URL — blocked on Render create-endpoint outage (retry per DEPLOY.md).
2. Real sellers / partner thread follow-ups (non-code, user's leads).
3. Old SESSION_SECRET rotation (dies with old service anyway).

## Flight-loop update (2026-09-27)
- Wave O SHIPPED (fd135a8, live on prod): Azure Retail Prices ingest —
  211 indicative rows (H100/A100/H200/MI300X), docs-verified GPU-count map,
  recurring via sg_ingest.sh (now both sources, 6h). Ledger: BUILD_LEDGER.md
  "Wave O". Floors now: server 180/180 · root 195/195 · e2e 26/26 · golden 6/6.
- Subdomain live with own cert: https://sovereign-grid.nikolastojanow.com
  (use this URL in partner material going forward; onrender URL still works).
- Pages apex cert (nikolastojanow.com) still in GitHub's issuance queue —
  DNS verified, left alone; self-lands. Check with: curl -svI https://nikolastojanow.com
- Open items updated: successor-service item MOOT (custom domain covers it);
  next ingest candidate = AWS bulk index (verify SKU→GPU counts first).
- Outreach: targets vetted + openers written (docs/OUTREACH_TARGETS.md);
  NO send channel on this Mac (no mail client/creds) — sends need user.
