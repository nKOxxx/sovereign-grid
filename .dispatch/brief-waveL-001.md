# Task: Market-intel signals pipeline — real observations backend + vast.ai ingest (Wave L)

## Context
Repo: Sovereign Grid. Floors: 177/177 root vitest, 130/130 server vitest (run in `server/`), build ✓ — do not regress.
Today `src/screens/MarketIntel.jsx` reads STATIC seed data (`marketObservations` from `src/data/seed.js`) with a DemoBadge "Illustrative". House law: "Never a live market price — observations are dated, evidence-specific, and feed an index". Your job: a real `market_observations` backend + an ingest job from a VERIFIED live public source + wire the screen to it with seed fallback.

VERIFIED SOURCE (orchestrator confirmed live, 200 OK): `GET https://console.vast.ai/api/v0/bundles/` → `{"offers":[...]}`. Fetch it ONCE yourself, save a trimmed sample (first ~25 offers, full field structure) as `server/test/fixtures/vast_sample.json`, and write the mapper against the REAL fields (relevant: gpu_name, num_gpus, dph_total, geolocation, id — verify exact names from the sample; do not guess).

## HARD RULES
1. Design law for any UI: `.sg-*` tokens only, dark, zero light classes, no native `<select>` (use `src/components/Select.jsx`), `sg-num` on figures. `src/design-law.test.jsx` will fail otherwise.
2. Do NOT modify: `server/src/routes/requests.js`, `listings.js`, `deals.js`, `e2e/golden_live.py`, `server/test/wave_c.test.js`, `design/tokens.css`, `src/lib/deal.js` (reuse `groupMarket`/`acceleratorFamily` as-is).
3. No live network in tests — fixture-based only.
4. RLS posture: mirror existing patterns (see `server/db/migrations/0002_auth.sql`, `0003_wave_c.sql` security-definer functions like `match_listings_for_match`).

## Task
A) **Migration `server/db/migrations/0007_market_observations.sql`:**
   - Table `market_observations`: id uuid pk default gen_random_uuid(), level text NOT NULL CHECK (level IN ('Indicative','Quoted','Transacted')), accelerator text NOT NULL, family text NOT NULL, region text NOT NULL DEFAULT 'Global', price numeric NOT NULL CHECK (price > 0), unit text NOT NULL DEFAULT 'usd/accel-hr', source text NOT NULL, source_ref text, observed_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), created_by uuid.
   - Index (level, family, region, observed_at desc). Unique partial index on (source, source_ref) WHERE source_ref IS NOT NULL — dedupe for repeated ingests.
   - RLS enable + deny-by-default; INSERT/SELECT policy for the app operator context (follow how eligibility_cases/fee policies do it in 0003). Public read ONLY through `market_observations_public()` SECURITY DEFINER (pinned search_path) returning the whitelisted columns — same precedent as `match_listings_for_match()`. GRANT EXECUTE to sg_app.
   - Family mapping: a small `family_for_accel(accelerator)` helper or CASE — mirror the families used by `acceleratorFamily` in `src/lib/deal.js` (read it; keep the same family strings: e.g. H100/H200 → 'Hopper-class' style — EXACT strings from lib).

B) **Routes `server/src/routes/intel.js` (mount in `server/src/app.js` under `/api/intel`, follow existing router registration):**
   - `GET /api/intel/observations` — public. Calls `market_observations_public()`, returns `{observations: rows}` ordered observed_at DESC limit 500.
   - `POST /api/intel/observations` — operator only (requireRole('operator')). zod: level enum, accelerator (1..80 chars), region optional (default 'Global'), price positive number, source (1..40), source_ref optional. Compute family server-side with the SAME mapping as the migration helper (duplicate the tiny map in JS, note it in a comment; keep strings in sync — add a unit test asserting the JS map covers every family the migration helper emits, via a shared fixture list).
   - `POST /api/intel/ingest/vast` — operator only. Uses an injectable fetch (app factory opts `fetchImpl`, default globalThis.fetch — check how createApp passes opts in `server/src/app.js`). Fetches the bundles URL (15s timeout), filters to DATACENTER accelerators only via allowlist regex: /(H100|H200|H800|A100|A800|MI300X|MI325X|L40S?|B200|GB200)/i on gpu_name. price = dph_total / max(num_gpus,1) (verify field semantics from the real sample; if dph_total is per-instance total, dividing by num_gpus yields $/accel-hr). region: map geolocation country → 'EU' | 'US' | 'GCC' | 'Asia' | 'Global' (small map, default Global). Upsert: ON CONFLICT (source, source_ref) DO UPDATE price, observed_at=now(). level='Indicative', source='vast.ai', source_ref=offer id. Response: `{inserted, updated, skipped}`. Never insert price<=0 rows.
C) **Tests (`server/test/intel.test.js`, scratch-DB harness):**
   - migration applies (extend migrate.test.js list ONLY by adding '0007_market_observations.sql' to the expected array — that file is NOT in the forbidden list, only wave_c is).
   - operator POST → row visible via public GET; anon POST → 401; buyer/seller POST → 403; public GET exposes ONLY whitelisted columns (assert no created_by leak).
   - ingest with stubbed fetchImpl returning the fixture: correct inserted count; second run (same fixture) → 0 inserted, N updated (dedupe works); consumer-only payload → 0 inserted.
   - family-map sync test (JS map vs migration CASE emit same families for the allowlist).
D) **UI `src/screens/MarketIntel.jsx`:** on mount fetch `/api/intel/observations`; if rows → use them (map to groupMarket's expected shape — check `groupMarket` in `src/lib/deal.js` for required fields), show `observed_at` dates (sg-num), badge text "Live — vast.ai + curated"; if fetch fails or empty → seed fallback, keep DemoBadge "Illustrative". Keep filters/aggregation unchanged. Add/extend a vitest for both branches (mock fetch module-level per existing screen-test patterns in `src/screens/listing-review.test.jsx`).

## Definition of done
- `npm run build` ✓ root; `npx vitest run` green in root AND `server/` (177+/130+ floors).
- Save the vast fixture. No e2e, no prod contact, orchestrator deploys + schedules the recurring ingest.
- End with EXACTLY:
ARM: DONE
SUMMARY: <one line <=200 chars>
FILES: <comma-separated>
