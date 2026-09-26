# Wave N — sg-p1-waveN-001: party-facing deal lifecycle + transacted auto-observation

## Context
Sovereign Grid GPU-compute marketplace. Deal lifecycle states exist (negotiating → commercially_agreed → contracted → delivered → completed, plus cancelled) but transitions are operator-only via `PATCH /api/deals/:id/status` (plain UPDATE, no validation). We need the parties themselves to drive the lifecycle, and we want a proprietary signal: a real transacted-price observation written to `market_observations` the moment a deal hits `contracted`.

Read first: `server/src/routes/deals.js`, `server/db/migrations/0007_market_observations.sql`, `0008_market_families.sql` (family taxonomy + `familyForAccel` in `server/src/routes/intel.js`), `server/src/db/pool.js` (withUser + RLS), `docs/SOURCES.md` (house law: observations are dated, evidence-specific — never a live market price).

## Deliverables

### 1. Party-driven transitions — `POST /api/deals/:id/transitions`
- Body: `{ to: <status> }` with the existing statusSchema enum.
- Permission: caller must be the deal's buyer or seller (req.user.id from the RLS context; deal fetched by id first). Operator keeps the existing PATCH route untouched. Non-participant → 403 `forbidden`.
- Legal-transition table (explicit, in code, exported for tests):
  - negotiating → commercially_agreed (seller only)
  - commercially_agreed → contracted (buyer only)
  - contracted → delivered (seller only)
  - delivered → completed (buyer only)
  - negotiating | commercially_agreed → cancelled (either party)
  - Anything else → 409 `invalid_transition` (include from/to in the message).
- On success: UPDATE status, and INSERT an `audit_log` row (actor = caller id, action = 'transition', entity = 'deals', entity_id = deal id, details = JSON {from, to}). Same transaction, both-or-neither.
- 0009 note: audit_log SELECT is RLS'd to operators — that's fine, parties just don't read it back.

### 2. Auto-observation on `contracted` (THE moat)
- When a transition to `contracted` succeeds, in the SAME transaction insert one `market_observations` row:
  - source = 'transacted', source_ref = 'deal:' || deal.id (dedupe: ON CONFLICT (source, source_ref) DO NOTHING — check the 0007 unique constraint name and reuse it),
  - observed_at = now(), observed price = the deal's agreed unit price (check the deals schema for the actual column — offer_price or similar),
  - accelerator / family via the same family mapping used by intel.js (reuse `familyForAccel` logic — extract to a shared module if needed, do NOT duplicate drift),
  - region if the deal/listing carries one, else NULL.
- This row must survive only if the transition commits (same transaction). Never blocks the transition: wrap the insert in a try/catch that logs and swallows DB errors ONLY if constraint-violation-on-dedupe; any other error propagates (transaction rolls back — correct behavior).
- House law: this is a dated observation of a real transaction — exactly what the law wants. No new migration expected; if you truly need one it must be ADDITIVE with new object names only (never CREATE OR REPLACE or DROP functions owned by earlier migrations — prod ownership makes that fatal; see 0009 history).

### 3. Tests (server suite)
- Lifecycle matrix: each legal transition by the right party → 200 + status changed + audit row exists.
- Wrong-party matrix: buyer attempting seller-only moves → 403; stranger → 403 (404-safe: don't leak existence is NOT required here, participant listing already exists).
- Illegal jumps (negotiating→delivered, completed→anything) → 409.
- Auto-observation: after contracting, `/api/intel/observations` scratch query or direct table read shows one source='transacted' row for the deal; re-running the same transition is impossible (409) — dedupe instead tested by calling the insert path twice via two deals sharing nothing + a unit-level double-call if simpler.
- Cancel rules incl. cancelled is terminal.
- Existing suites must stay green.

## Constraints (binding)
- Gates: root `npx vitest run` green (195), server `cd server && npx vitest run` green (154), `npm run build` green. Expected: server grows by your new tests; root unchanged unless you add UI (NOT in scope — API only).
- DO NOT touch: migrations 0001–0008, auth functions from 0002, design/tokens.css, CI files, e2e/golden_live.py (may ADD e2e checks in a NEW file only if trivial).
- Do not create new secrets, do not log credentials, no new npm deps without justification in the report.
- REPORT: final summary MUST list files changed, new routes, and test counts (before/after). Empty summary = failed run.

## Done when
All gates green with new tests included, transitions endpoint live behind the same express app, auto-observation verified in scratch-DB test, report written.
