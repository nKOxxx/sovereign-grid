# Sovereign Grid — Session Resume Kit (written 2026-09-25 night)

Handoff file. If you (next session) are asked to "use the optimization we built", start here.
Memory tool was down when this was written — this file + BUILD_LEDGER.md + DEPLOY.md are the source of truth.

## What this is
GPU compute marketplace (Sovereign Grid), pilot-complete. The "optimization" = matching pipeline
(seller pool → hard filters → rank → golden allocation) + operator Fee Engine (fee sensitivity,
fee flow, partner split, live policy) — the thing that turns listing prices into buyer prices with
a platform fee and 93/90/87 golden outcome.

## Where it runs
- **Public:** https://sovereign-grid-zzxu.onrender.com — Render free web svc (docker runtime),
  ~50 s cold start after 15 min idle, no card, never expires.
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
  Snapshot: `backups/sg_prod_20260925.dump`.
- Subdomain immutable (`-zzxu` stays until a successor service is created; `POST /v1/services` was 500-ing
  9/25 eve — retry steps in DEPLOY.md).
- `/tmp/sg_render_ext.txt` (DB conn) and `/tmp` helpers die on reboot — long-term source is the Render env var.

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
