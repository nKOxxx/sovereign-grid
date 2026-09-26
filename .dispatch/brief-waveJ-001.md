# Task: Buyer offer-acceptance → deal creation (close the marketplace loop)

## Context
Repo: Sovereign Grid (GPU marketplace). Floors: 166/166 root vitest, 121/121 server vitest (run in `server/`), build ✓. Do not regress.
Flow today: buyer submits request → /matches scores active listings (MatchResults.jsx) → …dead end: deals are created ONLY by operators (`POST /api/deals`, `requireRole('operator')` in `server/src/routes/deals.js`). Your job: buyers accept an offer themselves.

## HARD RULES
1. Read `design/tokens.css` + `src/screens/MatchResults.jsx` + `src/screens/SellerOnboarding.jsx` first. New UI = `.sg-*` tokens ONLY, dark, single azure accent, custom `Select.jsx` (no native `<select>`), ZERO light classes (`bg-white`, `slate-*`, `amber-*`, `emerald-*`, `rose-*`, `sky-*`), `sg-num` on figures. Include a LIGHT_SLOP-style guard assertion in your test file.
2. Do NOT modify: `server/src/routes/requests.js`, `server/src/routes/listings.js`, `e2e/golden_live.py`, `server/test/wave_c.test.js`, `design/tokens.css`. Do NOT change `POST /api/deals` (operator path stays).
3. Golden safety: do NOT mutate listing status on acceptance (no 'booked' listing states). Deals are separate rows; the listing pool must stay untouched so golden replays stay deterministic.
4. Backward compat: existing deals tests (`server/test/wave_e.test.js` — follow its harness, extend if needed, don't rewrite).

## Task
A) **Backend — extend `server/src/routes/deals.js`:**
   - New: `POST /api/deals/accept` — **buyer only** (`requireRole('buyer')`).
     Body (zod): `{ listingId: uuid, requestId: uuid.optional() }`.
     Semantics: verify the listing EXISTS and status='active' — unknown → 404, non-active (pending/rejected) → 409 `{error:{code:'conflict'}}`. Create a deal: buyer_id = self, seller_id = listing's seller, listing_id, initial status = the FIRST value of the existing `DEAL_STATUSES` (find where it's defined — `grep -rn DEAL_STATUSES server/src` — and reuse it; do not invent a new status). Return 201 `{deal}`.
     Idempotency guard: if the SAME buyer already has a non-terminal deal for the same (buyer, listing) pair, return the existing deal with 200 instead of duplicating (single simple SELECT; keep it cheap).
     All SQL parameterized; follow the file's existing withUser/RLS + typed-error patterns. Acceptance should land in audit_log if an existing trigger covers deals inserts — check 0001 triggers; if none covers INSERT, do NOT add a migration, note it in the summary instead.
   - Operator PATCH /:id/status flow stays as-is (operator moves the accepted deal through its lifecycle).

B) **Tests — `server/test/deal_accept.test.js` (scratch-DB harness, copy the pattern from `server/test/listing_gate.test.js`):**
   - buyer accepts active listing → 201, deal has buyer_id=self, seller_id from listing, status = DEAL_STATUSES[0].
   - repeat same accept → 200 with same deal id (idempotent).
   - unknown listingId → 404; pending listing → 409; seller token → 403; no token → 401/403.
   - operator can PATCH the accepted deal to the next status (existing transition works on it).

C) **UI — `src/screens/MatchResults.jsx`:** per result row, an "Accept offer" button (visible only when logged in as buyer; hidden otherwise — check existing auth hook, e.g. `src/lib/auth.js` useAuth/setToken patterns used in other screens). Click → POST accept → inline success state on that row ("Accepted — deal <short-id> · <status>", `sg-num` for ids) or error message (409 → "No longer available"). No modals, keep the data-dense table layout.

## Definition of done
- `npm run build` ✓ root; `npx vitest run` green in root AND in `server/` (166+/121+ new floors).
- Do NOT run e2e, do NOT touch prod/real DBs (scratch only). Orchestrator deploys.
- End with EXACTLY:
ARM: DONE
SUMMARY: <one line <=200 chars>
FILES: <comma-separated>
