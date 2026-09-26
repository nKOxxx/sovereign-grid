# Task: Trust bundle — make accounts + marketplace safe for real strangers (Wave M)

## Context
Repo: Sovereign Grid (GPU compute marketplace). Prod: https://sovereign-grid-o707.onrender.com
We are moving from "demo" to "running version": real counterparties must be able to
register, transact, and recover. Today: registration exists but has NO email
verification, NO password reset, NO rate limiting on auth/write endpoints, and
NO terms/privacy pages. Close exactly these four gaps. Do not refactor anything else.

## Hard floors (CI must stay green)
- Root vitest 185/185 (`npx vitest run` at repo root), server vitest 143/143
  (`cd server && npx vitest run` with DATABASE_URL exported), `npm run build` OK.
- e2e suite (`e2e/verify_demo.py`) and golden (`e2e/golden_live.py`) must still pass
  against prod after deploy — if your changes alter registration/login flows, keep
  the demo accounts working (seed them verified, see below).
- Design law: dark tokens only (design/tokens.css), no native <select>, tabular-nums
  via sg-num for figures, no new fonts. Design-law + LIGHT_SLOP guard tests exist —
  keep them green. New screens go in src/screens with tests.

## Work items
1. **Email verification on register** (server + minimal UI)
   - Migration 0009: `email_verifications` table (user_id, token_hash, purpose
     'verify'|'reset', expires_at, used_at) + `users.email_verified BOOLEAN NOT NULL
     DEFAULT false`; set email_verified=true for the SEEDED demo users in the same
     migration (idempotent UPDATE by email IN (...existing demo emails...)).
   - Registration now returns 201 + `verificationRequired: true`; login still works
     for unverified users, BUT gated actions return 403 `email_unverified`:
     creating listings (seller) and creating deals/accepting offers (buyer).
     Operator + operator actions are NOT gated.
   - `POST /api/auth/verify {token}` marks verified (token stored hashed; compare with
     sha256; single-use). `POST /api/auth/resend` re-issues (rate-limited).
   - NO SMTP is configured: do not send real email. When a verification token is
     created, log it via console.info with a prefix `VERIFY_TOKEN:` ONLY when
     `process.env.NODE_ENV !== 'production'`; in production expose the pending
     verification to OPERATORS via `GET /api/operator/verifications` (id, email,
     createdAt, NOT the token) and `POST /api/operator/verifications/:id/reveal`
     (returns token once, audited) so the human operator can hand it over until SMTP
     arrives. Document this in the route header comment.
   - Login response includes `emailVerified` so the UI can show a verify banner.
   - UI: after register, show "check your email" state; if a login comes back
     emailVerified=false, show a dismissible banner with a resend button. Keep it
     minimal, dark, consistent.
2. **Password reset**
   - `POST /api/auth/reset-request {email}` → always 200 (no account enumeration),
     creates purpose='reset' token (same table, 30min expiry).
   - `POST /api/auth/reset {token, password}` → single-use, invalidates existing
     sessions/tokens for that user if you have a session version column; if not,
     add `users.token_version INT NOT NULL DEFAULT 0` in 0009 and include it in JWT
     payload validation (bump on reset). Operator reveal path same as verify.
3. **Rate limiting**
   - Small dependency-free middleware (in-memory Map, per-IP fixed window) — NO new
     npm deps unless already present in package.json. Apply stricter limits to:
     /api/auth/login, /api/auth/register, /api/auth/reset-request, /api/auth/resend
     (e.g. 10/15min/IP) and moderate limits to all other /api writes (e.g. 60/min/IP).
     Return 429 { error: { code: 'rate_limited' } }. Unit-test the middleware with
     fake timers or direct calls.
4. **Terms + Privacy pages**
   - src/screens/Terms.jsx, src/screens/Privacy.jsx + routes /terms /privacy (public,
     reachable from Login footer and nav). Real, specific, plain-English marketplace
     text: what the platform is, indicative-vs-transacted pricing disclaimer (house
     law: never a live market price), account responsibilities, no-escrow notice
     (deals are bilateral; platform is not a party), data stored (emails, listings,
     observations), contact placeholder email `contact@sovereign-grid.example`
     (placeholder is fine for now, mark with a TODO comment).
   - Route-links in the footer of Login screen only (do not clutter the app nav).

## Forbidden files (do not touch)
scripts/rotate_render_db.sh, e2e/golden_live.py, e2e/verify_demo.py, docs/*, BUILD_LEDGER.md,
RESUME.md, design/tokens.css. If a seed file must change for demo-user verification,
use the migration UPDATE approach (do not edit seed JS if avoidable).

## Definition of done (print in SUMMARY)
- Floors: root/server test counts, build OK.
- Migration list (0009 expected).
- New routes/endpoints with auth matrix.
- Which e2e/golden flows you checked remain intact (do not run them; hub does).
SUMMARY: <fill when done> ARM: DONE
