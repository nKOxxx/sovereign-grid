-- =============================================================================
-- 0010_deal_lifecycle.sql  —  party-driven deal lifecycle + transacted auto-observe
-- -----------------------------------------------------------------------------
-- Wave N. Two capabilities, both built on the existing schema with ZERO changes
-- to tables 0001–0009 (additive, new function objects only):
--
--   1) PARTY-DRIVEN TRANSITIONS. The parties (buyer/seller) drive the deal
--      lifecycle through the new party owned route POST /api/deals/:id/transitions
--      (see server/src/routes/deals.js). The UPDATE happens under the caller's
--      RLS context (deals_party_update); the operator keeps the legacy PATCH
--      route untouched. Every accepted transition writes an explicit
--      audit_log row (action='transition', details={from,to}) via the SECURITY
--      DEFINER audit_log_transition() below — required because audit_log has NO
--      INSERT policy for buyer/seller (0001 grants SELECT only), mirroring the
--      auth_log_reveal() precedent (0009). The existing trg_deals_status_audit
--      trigger still fires on the status UPDATE and logs its own 'update' row;
--      the 'transition' row is the party-owned, atomically-written trail entry.
--
--   2) AUTO-OBSERVATION ON `contracted` (the moat). The moment a party-
--           driven transition lands on `contracted`, a dated, evidence-specific
--      Transacted observation is written to market_observations for that deal:
--      source='transacted', source_ref='deal:'||id (deduped via the 0007
--      partial unique index market_observations_source_ref_uniq on
--      (source, source_ref) WHERE source_ref IS NOT NULL), observed_at=now(),
--      price = the deal's agreed unit price = the resolved listing's
--      committed_price (the only structured price a deal carries — through its
--      listing_id, or its offer's listing_id). Accelerator/family/region also
--      come from that listing; family uses the SAME canonical family_for_accel()
--      mapping (0007/0008) that intel.js mirrors and the sync test pins — no JS
--      duplication. House law: this is exactly a dated observation of a real
--      transaction (see docs/SOURCES.md — never a live market price).
--
-- WHY SECURITY DEFINER: a buyer cannot read the RLS-closed listings table
-- (listings_owner_all = the seller only) and neither party can INSERT into
-- market_observations (0007 = operator-only RLS) or audit_log (0001). So the
-- observation read+insert and the audit write are owner-run (sg_migrate, the
-- migration owner), the same precedent as offer_accept() (0006),
-- match_listings_for_match() (0003) and the auth_* / audit helpers. Both still
-- run INSIDE the caller's transaction (withUser BEGIN..COMMIT), so the
-- observation and the transition commit or roll back together.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) deal_contract_observation(uuid) — write the Transacted observation for a
--    deal that just reached `contracted`. No-op when the deal has no resolvable
--    price (no listing/offer committed_price) — a transition never blocks on
--    a missing price, and a price of NULL cannot satisfy price > 0 anyway.
--    Dedupe is silent via ON CONFLICT DO NOTHING against the 0007 partial
--    unique index market_observations_source_ref_uniq.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deal_contract_observation(p_deal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing_id uuid;
  v_gpu        text;
  v_region     text;
  v_price      numeric;
  v_family     text;
BEGIN
  -- Resolve the deal's commercial reference: prefer the accepted listing,
  -- else the offer's listing. gpu_model -> accelerator, region -> region,
  -- committed_price -> agreed unit price (per accel-hr).
  SELECT
    COALESCE(d.listing_id, o.listing_id),
    l.gpu_model,
    l.region,
    l.committed_price
  INTO v_listing_id, v_gpu, v_region, v_price
  FROM deals d
  LEFT JOIN offers o ON o.id = d.offer_id
  LEFT JOIN listings l ON l.id = COALESCE(d.listing_id, o.listing_id)
  WHERE d.id = p_deal_id;

  -- No resolvable commercial signal -> nothing to observe.
  IF v_gpu IS NULL OR v_price IS NULL THEN
    RETURN;
  END IF;

  v_family := family_for_accel(v_gpu);

  INSERT INTO market_observations
    (level, accelerator, family, region, price, unit, source, source_ref, created_by)
  VALUES
    ('Transacted', v_gpu, v_family, COALESCE(v_region, 'Global'), v_price,
     'usd/accel-hr', 'transacted', 'deal:' || p_deal_id, NULL)
  -- 0007 partial unique index (source, source_ref) WHERE source_ref IS NOT NULL.
  ON CONFLICT (source, source_ref) WHERE source_ref IS NOT NULL DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- 2) audit_log_transition(uuid, uuid, text, text) — write the explicit
--    party-owned transition audit row (action='transition', details={from,to}).
--    SECURITY DEFINER (owner = sg_migrate) so a buyer/seller can record the
--    trail without audit_log INSERT policy — same pattern as auth_log_reveal.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_log_transition(p_actor uuid, p_deal_id uuid, p_from text, p_to text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_log (actor, action, entity, entity_id, details)
  VALUES (p_actor, 'transition', 'deals', p_deal_id,
          jsonb_build_object('from', p_from, 'to', p_to));
END $$;

-- ---------------------------------------------------------------------------
-- 3) Least privilege: only the app role may execute them.
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION deal_contract_observation(uuid) TO sg_app;
GRANT EXECUTE ON FUNCTION audit_log_transition(uuid, uuid, text, text) TO sg_app;
