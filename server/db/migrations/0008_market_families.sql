-- =============================================================================
-- 0008_market_families.sql — extend the observation family taxonomy
-- -----------------------------------------------------------------------------
-- 0007's family_for_accel() mirrored src/lib/deal.js acceleratorFamily, which
-- only knew H200/MI300X/TPU/Ascend 910C; real vast.ai signals (H100 SXM/NVL,
-- A100, B200, GB200, L40S) fell through to their raw accelerator string,
-- fragmenting the Intel aggregation (one cell per SKU instead of per family).
--
-- This migration applies the additive extension to the LIVE function (0007 was
-- already applied to production before the taxonomy was extended, and applied
-- migrations are immutable). Signature note: CREATE OR REPLACE cannot rename a
-- parameter, so the parameter keeps 0007's exact name (`accelerator`).
-- Extension order matches the JS maps (src/lib/deal.js,
-- server/src/routes/intel.js — both updated in the same commit; sync tests
-- cover the vast.ai allowlist). Backfills existing rows so current signals
-- re-aggregate immediately.
-- =============================================================================

CREATE OR REPLACE FUNCTION family_for_accel(accelerator text)
RETURNS text
LANGUAGE sql
SET search_path = public
AS $$
  SELECT CASE
    WHEN accelerator ILIKE '%h200%'   THEN 'H200'
    WHEN accelerator ILIKE '%mi300%'  THEN 'MI300X'
    WHEN accelerator ILIKE '%mi3%'    THEN 'MI300X'
    WHEN accelerator ILIKE '%tpu%'    THEN 'TPU'
    WHEN accelerator ILIKE '%ascend%' OR accelerator ILIKE '%910c%' THEN 'Ascend 910C'
    WHEN accelerator ILIKE '%h100%'   THEN 'H100'
    WHEN accelerator ILIKE '%a100%'   THEN 'A100'
    WHEN accelerator ILIKE '%gb200%'  THEN 'GB200'
    WHEN accelerator ILIKE '%b200%'   THEN 'B200'
    WHEN accelerator ILIKE '%l40s%'   THEN 'L40S'
    ELSE accelerator
  END
$$;

-- Backfill: recompute family for all existing observations.
UPDATE market_observations
   SET family = family_for_accel(accelerator);
