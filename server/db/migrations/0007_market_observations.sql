-- =============================================================================
-- 0007_market_observations.sql  —  real market-intel observations backend
-- -----------------------------------------------------------------------------
-- Turns the Market Intelligence screen's static seed data (src/data/seed.js)
-- into a real, operator-fed observations store with a verified live ingest
-- source (vast.ai bundle listings). House law: NEVER a live market price —
-- every row is a dated, evidence-specific observation (source + source_ref)
-- that feeds an indicative index, labelled by evidence level:
--
--   'Indicative'  — public / advertised pricing (e.g. vast.ai bundles)
--   'Quoted'      — a seller offer on Sovereign Grid with stated validity
--   'Transacted'  — an executed, anonymized & aggregated deal
--
--   * market_observations   — the base table. Default-deny RLS; only the app
--     operator context may INSERT/SELECT/UPDATE/DELETE. Public reads go ONLY
--     through market_observations_public() (SECURITY DEFINER) which exposes a
--     column WHITELIST (no created_by — the operator identity never leaks).
--   * family_for_accel()    — accelerator -> family label, mirroring EXACTLY
--     the families returned by src/lib/deal.js `acceleratorFamily` (H200,
--     MI300X, TPU, Ascend 910C, or the raw accelerator string). The JS port of
--     this map lives in server/src/routes/intel.js; a sync test keeps the two
--     identical for the vast.ai allowlist.
--   * market_observations_public() — the public read model (SECURITY DEFINER,
--     pinned search_path, whitelisted columns, ordered observed_at DESC) —
--     the same precedent as match_listings_for_match() (0003) / auth_* (0002).
--
-- RLS posture mirrors 0003 (eligibility_cases / fee_policy): operator-only
-- policy reading the per-transaction app.user_role GUC set by withUser().
--
-- Idempotent by construction (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY
-- IF EXISTS), mirroring 0001-0006 conventions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) market_observations — evidence-specific, dated price observations.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_observations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level       text NOT NULL CHECK (level IN ('Indicative','Quoted','Transacted')),
  accelerator text NOT NULL,
  family      text NOT NULL,
  region      text NOT NULL DEFAULT 'Global',
  price       numeric NOT NULL CHECK (price > 0),
  unit        text NOT NULL DEFAULT 'usd/accel-hr',
  source      text NOT NULL,
  source_ref  text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid
);

-- Primary read shape for the screen: per level/family/region, latest first.
CREATE INDEX IF NOT EXISTS market_observations_lookup_idx
  ON market_observations (level, family, region, observed_at DESC);

-- Dedupe repeated ingests on the (source, source_ref) evidence identity.
CREATE UNIQUE INDEX IF NOT EXISTS market_observations_source_ref_uniq
  ON market_observations (source, source_ref)
  WHERE source_ref IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Row-Level Security — default-deny; operator context only (mirrors 0003).
-- ---------------------------------------------------------------------------
ALTER TABLE market_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_observations_operator_all ON market_observations;
CREATE POLICY market_observations_operator_all ON market_observations FOR ALL
  USING (current_setting('app.user_role', true) = 'operator')
  WITH CHECK (current_setting('app.user_role', true) = 'operator');

-- Public reads never touch the base table directly — they go through the
-- SECURITY DEFINER read model below. Least privilege for the app role.
GRANT SELECT, INSERT, UPDATE, DELETE ON market_observations TO sg_app;

-- ---------------------------------------------------------------------------
-- 3) family_for_accel(accelerator) — label helper mirroring src/lib/deal.js
--    `acceleratorFamily` EXACTLY (same order, same strings). The JS duplicate
--    lives in server/src/routes/intel.js and is kept in sync by a unit test.
--    NOTE: like the lib, unmatched accelerators pass through as themselves, so
--    the vast.ai allowlist families are H100/H200/H800/A100/A800/MI300X/
--    L40/L40S/B200/GB200 — EXACT strings from the lib, never invented labels.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION family_for_accel(accelerator text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN accelerator ILIKE '%h200%' THEN 'H200'
    WHEN accelerator ILIKE '%mi300%' THEN 'MI300X'
    WHEN accelerator ILIKE '%mi3%'   THEN 'MI300X'
    WHEN accelerator ILIKE '%tpu%'   THEN 'TPU'
    WHEN accelerator ILIKE '%ascend%' OR accelerator ILIKE '%910c%' THEN 'Ascend 910C'
    WHEN accelerator ILIKE '%h100%' THEN 'H100'
    WHEN accelerator ILIKE '%a100%' THEN 'A100'
    WHEN accelerator ILIKE '%gb200%' THEN 'GB200'
    WHEN accelerator ILIKE '%b200%' THEN 'B200'
    WHEN accelerator ILIKE '%l40s%' THEN 'L40S'
    ELSE accelerator
  END
$$;

GRANT EXECUTE ON FUNCTION family_for_accel(text) TO sg_app;

-- ---------------------------------------------------------------------------
-- 4) market_observations_public() — the ONLY public read path.
--    SECURITY DEFINER (owned by sg_migrate) so it reads the RLS-closed base
--    table as the owner; exposes ONLY the safe column whitelist. created_by
--    and any internal columns are deliberately excluded. Ordered latest-first
--    so the route just limits the result.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION market_observations_public()
RETURNS TABLE (
  id          uuid,
  level       text,
  accelerator text,
  family      text,
  region      text,
  price       numeric,
  unit        text,
  source      text,
  source_ref  text,
  observed_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mo.id, mo.level, mo.accelerator, mo.family, mo.region,
         mo.price, mo.unit, mo.source, mo.source_ref, mo.observed_at
  FROM market_observations mo
  ORDER BY mo.observed_at DESC;
$$;

GRANT EXECUTE ON FUNCTION market_observations_public() TO sg_app;
