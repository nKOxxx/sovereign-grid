# Task: Listing review gate — pending-by-default + operator activation

## Context
Repo: Sovereign Grid (GPU compute marketplace). All floors green: 159/159 root vitest, 109/109 server vitest (in `server/`), build ✓. Do not break them.
Seller onboarding just shipped (`src/screens/SellerOnboarding.jsx`, `POST /api/listings` → defaults `status='active'`).
RISK: unreviewed listings enter the live pool and can shift matching outcomes. Your job: close that hole.

## HARD RULES
1. Read `design/tokens.css` + `src/screens/FeeEngine.jsx` + `src/screens/SellerOnboarding.jsx` first. New UI = `.sg-*` tokens ONLY, dark theme, single azure accent, custom `Select.jsx` (no native `<select>`), ZERO light classes (`bg-white`, `slate-*`, `amber-*`, `emerald-*`, `rose-*`, `sky-*`), `sg-num` on figures. Guard tests will fail otherwise.
2. Security: operator-only activation via existing `requireRole('operator')` middleware pattern; buyers/sellers must get 403. Follow existing zod validation + typed-error patterns.
3. Do NOT modify: `server/src/routes/requests.js`, `e2e/golden_live.py`, `server/test/wave_c.test.js`, `design/tokens.css`.
4. Golden compatibility: `server/test/wave_c.test.js` posts requests that allocate seeded listings — if seeding/migration creates listings with explicit `status`, ensure those remain 'active' (check `server/db/seed.js` + migrations). The golden tests MUST still pass unchanged.
5. Backward compat: existing rows in any DB may have status='active'; do not migrate them to pending.

## Task
A) **Backend (`server/src/routes/listings.js` + migration in `server/db/migrations/`):**
   - POST /api/listings now creates with `status='pending'` (ignore any client-supplied status — strip it in zod).
   - New: `PATCH /api/listings/:id/status` — **operator-only**, body `{status: 'active'|'rejected'}` (zod enum), 404 unknown id, 403 non-operator, audit log entry if the codebase has an audit pattern (check `server/src/` for existing audit usage and follow it).
   - New: `GET /api/listings?status=pending` — operator-only view of the review queue (seller/buyer gets 403; plain GET stays public for active only — verify GET filters `status='active'` for non-operators).
   - **Verify the matching pipeline reads only active listings** (check `server/src/domain/score.js` + wherever request matching queries the pool; if it doesn't filter by status, add the filter there too — this is the integrity core of the task).

B) **Tests (`server/test/listing_gate.test.js`, follow the scratch-DB harness in `server/test/seller_onboarding.test.js`):**
   - seller creates listing → status is 'pending', invisible in public GET.
   - seller token PATCH status → 403; unauthenticated → 401/403.
   - operator PATCH → 'active'; now visible in public GET.
   - operator GET ?status=pending lists queue.
   - (if matching pool query was touched): pending listing does NOT appear in match candidates; active does.

C) **Operator UI (add to `src/screens/OperatorConsole.jsx` if it exists — find it first; otherwise a new `src/screens/ListingReview.jsx` routed at `/review`, operator-only nav link):**
   - Review queue table: listing name, region, GPU, price (`sg-num`), status pill; Approve / Reject buttons (`sg-btn--primary` / danger variant); calls PATCH; optimistic refresh.

## Definition of done
- `npm run build` ✓ from repo root; `npx vitest run` in root AND in `server/` — ALL pass (159+ / 109+ new).
- Do NOT run e2e, do NOT touch prod DBs (scratch DB only), orchestrator handles deploy.
- End with EXACTLY:
ARM: DONE
SUMMARY: <one line <=200 chars>
FILES: <comma-separated>
