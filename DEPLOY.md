# Sovereign Grid — Deploy (the access audit answer, 2026-09-25)

Question was: *what accesses/sites do we need so the product can be built and
shipped autonomously?* Answer after live verification: **one token from you.
Everything else already existed.**

## What already worked before any new access (verified by execution)
- GitHub via `gh` CLI (nKOxxx, keyring): repo admin, Actions, Pages deploys, CI — this is what "GitHub connected" means; browser GitHub sessions are logged out (Goliath + Chrome profile both checked), and that does not matter.
- Full local pipeline: Postgres 15, server 105 tests, frontend 139 tests, e2e 26/26, playwright, orchestrator + worker fleet.
- Vercel CLI installed but unauthenticated; every other PaaS CLI absent; no PaaS env tokens set.

## The one human step (pick ONE; my default = Fly.io)
PaaS CLIs all support device-flow login — run it, open the printed URL on any
device (phone is fine), tap "Authorize with GitHub", done. No copy-pasting of
secrets at all.

    # Option A (default): Fly.io
    fly auth login            # device flow; covers app + Postgres + TLS + cert
    bash scripts/deploy_paas.sh   # then: build -> app -> free Postgres -> secrets -> deploy -> smoke

    # Option B: Render (Blueprint, zero CLI needed)
    #   dashboard.render.com -> sign in with GitHub -> New + -> Blueprint ->
    #   select nKOxxx/sovereign-grid -> Apply. render.yaml in repo root does the rest.

    # Option C: Railway (dashboard or CLI)
    #   railway.app -> Login with GitHub -> New project -> Deploy from repo.
    #   Needs a start command override: SG_BOOT_MIGRATE=1 SG_STATIC_DIR=<dist> node server/src/boot.js

## Why the stack is deploy-ready in one process
- `server/src/boot.js` + `SG_BOOT_MIGRATE=1`: boot = validate env -> migrate -> idempotent seed (golden numbers 93/90/87 guaranteed on any fresh DB) -> listen. Proven locally 2026-09-25.
- `SG_STATIC_DIR`: the API serves the built SPA (same-origin `/api`, no CORS) while `/api` keeps JSON 404s. Proven locally; 105 server tests + 4 static-mode tests.
- `Dockerfile` (Fly/any Docker host) and `render.yaml` (Render Blueprint incl. free Postgres) are committed.
- GitHub Pages (current demo) stays untouched: static mode is opt-in; Pages deploy remains green (wave G1 run 36100252073).

## Verified-not-taken-for-granted gotchas
- `seed()` ends the pool it receives (documented contract) — boot passes it a dedicated pool, never the serving one (first live run 500'd marketplace; caught + fixed + re-proven).
- Server requires `PORT` env explicitly (wave E strictness) — set in Dockerfile + Render config.
- Render free tier sleeps after 15 min idle; Fly shared-cpu-1x stays up. Golden numbers must read 93/90/87 after first boot — checked in deploy script smoke step.

## Cost
Free tier covers demo + GCC pilot traffic on both Fly and Render. Paid tier
only matters when real 24/7 traffic exists (Fly ~$3-6/mo, Render $7/mo).
