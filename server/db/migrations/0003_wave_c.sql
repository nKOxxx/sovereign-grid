-- =============================================================================
-- 0003_wave_c.sql  —  Sovereign Grid Phase 1 · Wave C (Domain API) schema
-- -----------------------------------------------------------------------------
-- Adds the persistence + read-model pieces the Wave C domain API needs, on top
-- of 0001 (base schema) and 0002 (auth). It is additive: it does NOT change or
-- weaken any Wave A/B object, policy, grant or audit invariant. It only
--   1) relaxes the coarse listings.region CHECK to admit the demo's CN/US
--      regions (the China listing in the demo dataset lives in Shenzhen; the
--      US Cascades listing in Oregon — neither is GCC nor EU). This is a
--      widening, never a tightening.
--   2) adds two LISTING columns the demo's own matching math reads
--      (lead_time_weeks, provisioning.onTimePct — see src/lib/market.js
--      scoreAvailabilityDelivery). They must exist for the server port to
--      reproduce the exact 0-100 scores.
--   3) adds fee_policy          — operator-editable platform fee policy; the
--      PUT route writes audit rows via an audit trigger (like deals/approvals).
--   4) adds eligibility_cases   — persisted, evidence-driven, per-(listing,
--      request) eligibility decisions. audit_logged on every mutation.
--   5) adds match_listings_for_match() — a SECURITY DEFINER owner-run read that
--      returns EVERY active listing joined with its aggregated evidence, so the
--      authenticated buyer's /matches endpoint can run the exact demo scoring
--      (which needs committed_price + evidence + facility) against RLS-closed
--      tables. This is the same pattern as auth_user_by_email (0002): a
--      security-definer function doing one controlled job. It bypasses RLS only
--      to READ; it never writes. The base listings/evidence tables stay
--      RLS-protected; the public marketplace view (no committed_price, no
--      seller_id) is unchanged.
--
-- Idempotent by construction (IF NOT EXISTS / CREATE OR REPLACE / drop-then-
-- create, mirroring 0001/0002 conventions).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) listings: widen the coarse region enum to admit the demo's CN/US rows.
--    (Postgres auto-named the inline column CHECK "listings_region_check".)
-- ---------------------------------------------------------------------------
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_region_check;
ALTER TABLE listings ADD CONSTRAINT listings_region_check
  CHECK (region IN ('GCC', 'EU', 'CN', 'US'));

-- ---------------------------------------------------------------------------
-- 2) listings: matching columns the demo scoring reads (src/lib/market.js).
-- ---------------------------------------------------------------------------
ALTER TABLE listings ADD COLUMN IF NOT EXISTS lead_time_weeks integer;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS provisioning jsonb;

-- ---------------------------------------------------------------------------
-- 3) fee_policy — operator-editable platform fee policy (SPEC §9, demo default
--    is 8%, see src/store/MarketContext.jsx DEFAULT_PLATFORM_FEE).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_policy (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL UNIQUE,
  value      jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fee_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_policy_operator_all ON fee_policy;
CREATE POLICY fee_policy_operator_all ON fee_policy FOR ALL
  USING (current_setting('app.user_role', true) = 'operator')
  WITH CHECK (current_setting('app.user_role', true) = 'operator');

-- Anyone may read the current policy (the GET /api/fees/policy route); only the
-- operator may write it.
DROP POLICY IF EXISTS fee_policy_any_select ON fee_policy;
CREATE POLICY fee_policy_any_select ON fee_policy FOR SELECT
  USING (current_setting('app.user_role', true) IN ('buyer', 'seller', 'operator'));

-- Audit: every policy write is recorded in the immutable audit_log.
DROP TRIGGER IF EXISTS trg_fee_policy_audit ON fee_policy;
CREATE TRIGGER trg_fee_policy_audit AFTER INSERT OR UPDATE OR DELETE ON fee_policy
  FOR EACH ROW EXECUTE FUNCTION audit_triggered_row();

GRANT SELECT, INSERT, UPDATE, DELETE ON fee_policy TO sg_app;

-- ---------------------------------------------------------------------------
-- 4) eligibility_cases — persisted, evidence-driven eligibility decisions.
--    status/evidence drive the /matches disqualified->bookable path: when an
--    operator PATCHes the missing evidence onto a case and approves it, the
--    listing's evidence for THAT request is complete, so the route gate passes
--    and the offer becomes bookable (the Ascend evidence path).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eligibility_cases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  request_id  uuid REFERENCES requests(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'conditional', 'approved', 'rejected')),
  reason      text,
  missing     jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by  uuid,
  approved_by uuid,
  decided_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eligibility_cases_listing_idx ON eligibility_cases (listing_id);
CREATE INDEX IF NOT EXISTS eligibility_cases_request_idx ON eligibility_cases (request_id);

ALTER TABLE eligibility_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eligibility_operator_all ON eligibility_cases;
CREATE POLICY eligibility_operator_all ON eligibility_cases FOR ALL
  USING (current_setting('app.user_role', true) = 'operator')
  WITH CHECK (current_setting('app.user_role', true) = 'operator');

-- Audit + updated_at on the case.
DROP TRIGGER IF EXISTS trg_eligibility_cases_audit ON eligibility_cases;
CREATE TRIGGER trg_eligibility_cases_audit AFTER INSERT OR UPDATE OR DELETE ON eligibility_cases
  FOR EACH ROW EXECUTE FUNCTION audit_triggered_row();

DROP TRIGGER IF EXISTS trg_eligibility_cases_updated_at ON eligibility_cases;
CREATE TRIGGER trg_eligibility_cases_updated_at BEFORE UPDATE ON eligibility_cases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON eligibility_cases TO sg_app;

-- ---------------------------------------------------------------------------
-- 5) match_listings_for_match() — owner-run read for the authenticated buyer's
--    /matches endpoint. Returns every active listing as ONE jsonb, flattened to
--    the exact shape the server port of src/lib/market.js consumes, including
--    committed_price (a quote, intended for the matched buyer) and the listing's
--    aggregated evidence. SECURITY DEFINER (owned by sg_migrate) so it reads the
--    RLS-closed listings/evidence_items base tables; it never writes. The public
--    marketplace view (0002) remains the anonymized, price-less read model.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_listings_for_match()
RETURNS TABLE (listing jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', l.id,
    'name', l.name,
    'provider_type', l.provider_type,
    'gpu_model', l.gpu_model,
    'region', l.region,
    'count', l.count,
    'node', l.node,
    'interconnect', l.interconnect,
    'memory', l.memory,
    'software', l.software,
    'portability', l.portability,
    'facility', l.facility,
    'data_residency', l.data_residency,
    'firmness', l.firmness,
    'start_date', to_char(l.start_date, 'YYYY-MM-DD'),
    'min_term_months', l.min_term_months,
    'max_term_months', l.max_term_months,
    'committed_price', l.committed_price,
    'on_demand_price', l.on_demand_price,
    'currency', l.currency,
    'billing_unit', l.billing_unit,
    'commercial', l.commercial,
    'commitment', l.commitment,
    'resilience', l.resilience,
    'sovereign', l.sovereign,
    'power', l.power,
    'verification_status', l.verification_status,
    'evidence_confidence', l.evidence_confidence,
    'status', l.status,
    'lead_time_weeks', l.lead_time_weeks,
    'provisioning', l.provisioning,
    'evidence', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type', e.type, 'status', e.status, 'issuer', e.issuer,
        'issued_at', to_char(e.issued_at, 'YYYY-MM-DD')
      ))
      FROM evidence_items e
      WHERE e.listing_id = l.id
    ), '[]'::jsonb)
  ) AS listing
  FROM listings l
  WHERE l.status = 'active'
  ORDER BY l.name;
$$;

GRANT EXECUTE ON FUNCTION match_listings_for_match() TO sg_app;
