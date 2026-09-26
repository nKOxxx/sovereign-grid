# Sovereign Grid — Production Deployment

**Live:** https://sovereign-grid.fly.dev · Fly app (iad) ↔ Render Postgres (free, oregon)

Architecture: **one single Node process** serves both the API (`/api/*`) and the
static SPA (`SG_STATIC_DIR`). Migrations + idempotent seed run at boot
(`SG_BOOT_MIGRATE=1`). Postgres is the source of truth; the app connects with a
least-privilege role (`sg_app`) bound by RLS, and boot migrations run as the
schema-owner role (`sg_migrate`).

## Roles on a managed Postgres (Render)

| Role | Login | Purpose |
|---|---|---|
| `<db>_user` (managed admin) | yes | provisioning only; owns nothing in `public` |
| `sg_migrate` | NOLOGIN | owns all schema objects; boot migrates via `SET ROLE` |
| `sg_app` | yes | runtime serving; RLS-bound, no schema CREATE |

Grant chain (applied once via psql as the admin):

```sql
CREATE ROLE sg_migrate NOLOGIN;
CREATE ROLE sg_app LOGIN PASSWORD '<generated>';
GRANT sg_migrate TO sovereign_grid_db_user;   -- admin may adopt owner role
GRANT sg_migrate TO sg_app;                   -- app boot may SET ROLE sg_migrate
GRANT CREATE ON SCHEMA public TO sg_migrate;  -- not implicit for non-owners on managed PG
-- after first migrate/seed (objects may be admin-owned from earlier boots):
--   ALTER TABLE/SEQUENCE/VIEW ... OWNER TO sg_migrate  (loop over pg_class)
--   ALTER DEFAULT PRIVILEGES ... (as sg_migrate, for sg_app)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sg_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sg_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM sg_app;  -- append-only
```

Also required once: `CREATE EXTENSION IF NOT EXISTS citext;` — the local
template DB has it; fresh managed DBs do not.

Secrets (Fly):

- `DATABASE_URL` = `postgres://sg_app:<pw>@…render.com:5432/sovereign_grid_db?sslmode=require`
- No admin secret lives in Fly — provisioning/migration-adjacent SQL is run by
  an operator from a workstation with the admin URL, not from the app.

## The walls (in the order they were hit)

1. **Fly free managed Postgres idle-stops after ~5 min.** It ignores
   `--autostop=off` on the machine, fires even with open connections, and
   flycast cannot wake stopped machines (`host was not found in DNS`). The app
   died mid-migrate on every boot. **Verdict: unusable for an always-on app —
   we kept Render Postgres as the DB and let Fly serve HTTP.**
2. **node-pg ignores `sslmode` in connection URLs.** A `?sslmode=require` URL
   still connects plaintext → SSL-only Postgres kills the connection
   ("Connection terminated unexpectedly"). `src/db/pool.js` now parses
   `sslmode` itself and sets the `ssl` option. Applies to Render/Supabase/Neon.
3. **Render DBs created via API ship an EMPTY IP allow list** (deny-all, even
   localhost). PATCH it with entries that each carry a non-empty
   `description`, or every connection black-holes at TLS.
4. **Migration role handling assumed socket-trust.** Local `DATABASE_URL` has no
   password and boot force-rewrote the URL to the `sg_migrate` role. On managed
   PG the URL carries credentials and must never be rewritten;
   `src/db/migrate.js` now only `SET ROLE`s when the URL is passwordless, with
   best-effort `RESET ROLE` cleanup otherwise.
5. **Managed-DB roles/grants don't exist until you create them.** Local infra
   pre-creates `sg_migrate`/`sg_app`; 0001_init.sql does not (by design —
   roles are infra, not schema). Provision them once per environment (SQL
   above).
6. **`citext` missing** on fresh managed DBs → `CREATE EXTENSION` once.
7. **Boot-order ownership.** Any objects created by the admin during an earlier
   failed boot are admin-owned and block `sg_migrate` migrations
   (`permission denied for table schema_migrations`). Realign ownership once
   (SQL above), then boot converges via its own retry loop.
8. **API-only CSP blanked the served SPA.** `security-headers.js` shipped
   `default-src 'none'` globally when the server was JSON-only; the
   single-process deploy now serves HTML/assets too, so CSP is dual-mode:
   API stays `default-src 'none'`, SPA gets a strict self-hosting policy
   (no inline scripts, `'unsafe-inline'` styles only for Recharts/Radix
   style injection).

## Boot resilience (shipped regardless)

- `server/src/boot.js` — retry-wrapped migrate+seed (12 attempts, 5 s backoff).
  Both phases are idempotent (ledger table + `ON CONFLICT DO NOTHING` seed).
- `server/src/db/keepalive.js` — 60 s `SELECT 1` so free-tier Postgres never
  looks idle to the platform.
- `server/src/db/pool.js` — honors `sslmode`; serving pool uses `sg_app`.

## Deploy (Render — primary since 2026-09-25)

Live: **https://sovereign-grid-zzxu.onrender.com** (free web service
`srv-dar8u8id0e5s73bucs30`, runtime **docker**, Dockerfile at repo root,
auto-deploy on push to `main`). Free web services **do not expire** and need
no card — unlike free Postgres (30-day clock) and Fly (trial ended).

```bash
curl -s https://sovereign-grid-zzxu.onrender.com/api/health
```

Ops notes:
- Free web services **spin down after ~15 min idle** and cold-start in ~50 s.
  First hit after idle may be slow; not an error.
- `DATABASE_URL` env var points at the current DB (swap via API during
  rotation — `scripts/rotate_render_db.sh`).
- Trigger a manual deploy:
  `render deploys create srv-dar8u8id0e5s73bucs30 --output json` or the API.

Fly (`sovereign-grid.fly.dev`) is **retired** — trial ended 2026-09-25 and the
machine is suspended. It still holds the same commit if a paid fallback is
ever wanted.

## Render REST quirks (v1 API) — for future automation

- DB endpoint is `/postgres`, not `/databases` (404 otherwise).
- Create DB requires `version: "17"` and plan literal `free`
  (`postgres_free` → 400).
- PATCH allow-list: **every entry needs a non-empty `description`**.
- Service create: `POST /v1/services` with `type: web_service`, `ownerId` =
  workspace id (`owner.id` on an existing resource — the field is `owner`, an
  object, on reads), and **`serviceDetails.envSpecificDetails` is REQUIRED**
  for non-static, non-docker runtimes. With runtime `docker`, supply
  `dockerfilePath`/`dockerContext` inside `serviceDetails` instead.
- `rootDir: server` + `dockerfilePath: ./Dockerfile` resolves to
  `/server/Dockerfile` — keep `rootDir` unset for a root Dockerfile
  (instant build_failed with no surfaced reason otherwise).
- Logs API returned no rows for this service (params `startTime`/`endTime`
  ms epoch + `ownerId` tried); the CLI (`render v2.28`) is the working path.
- Free-tier note: Render free Postgres expires after 30 days on some accounts —
  add a card or upgrade before then to keep the DB.
- Subdomains are **immutable**: `PATCH /services/{id}` renames the dashboard
  display name only; the creation-time slug stays. **[RESOLVED 2026-09-26]**
  Successor service created after the Render create-API 500 outage ended:
  primary = `sovereign-grid-o707` (https://sovereign-grid-o707.onrender.com,
  `srv-darmnvrncjis73e9c8jg`); old svc renamed `sovereign-grid-legacy` (zzxu)
  as fallback during burn-in — pause/delete after 24–48 h. Note: `sovereign-grid`
  alone was unavailable (name collision with the renamed old service), forcing
  the `-o707` suffix; only a custom domain yields a suffix-free URL. Rotate
  script + watchdog now target the successor.

## DB expiry & rotation (free, automated)

Render free Postgres expires 30 days after creation (API field `expiresAt`;
current DB: 2026-10-25T07:00Z). Plan changes are NOT accepted via API
(PATCH → 500) — a dashboard card is the paid alternative. The free path:

`scripts/rotate_render_db.sh rotate` — dumps the live DB, creates a fresh free
DB (new 30-day window), provisions roles, restores, swaps the app's
`DATABASE_URL` env var, redeploys, verifies health; automatic rollback to the
prior env var if the health probe fails. `check` exits nonzero when ≤7 days
remain; `watch` is silent-when-healthy (cron `bd6bc7747401`, daily 09:00).
Caveat: new-DB credentials are only returned in the **create response** — if
the API ever drops them, the script fails safely with the old DB still serving.

Pre-rotation dumps live in `backups/` (gitignored). Baseline:
`backups/sg_prod_20260925.dump` (14 tables, verified).

## e2e

Local full suite: `~/venvs/fcc/bin/python e2e/verify_demo.py` (26 checks) with
the compose stack up. `SG_E2E_BASE` can point at a live URL; the sweep is
read-only-by-construction (clicks only, no form submits), but demo-data writes
should still be cleaned after manual golden runs
(`DELETE FROM requests WHERE buyer_id = '<falcon>'`).
