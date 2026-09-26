-- =============================================================================
-- 0006_deal_accept.sql  —  buyer offer-acceptance (close the marketplace loop)
-- -----------------------------------------------------------------------------
-- Buyers can now accept an ACTIVE listing themselves and open a deal, instead
-- of deals being operator-created only. This closes the loop that previously
-- ended at /matches. It is additive and idempotent:
--
--   * deals.listing_id  — the accepted deal now references the originating
--     listing (a plain ref, mirroring offer_id — no FK cycle). NULL for
--     operator-created deals, which are untouched.
--   * offer_accept()    — an atomic, owner-run (SECURITY DEFINER) routine that:
--         - verifies the listing EXISTS (-> 'not_found') and status='active'
--           (-> 'conflict' otherwise),
--         - enforces per-(buyer, listing) idempotency: if the buying user
--           already holds a non-terminal deal for that listing, it returns the
--           existing deal ('existing') instead of duplicating it,
--         - otherwise creates the deal (initial status = DEAL_STATUSES[0] =
--           'negotiating'), with the buyer + the listing's seller as its two
--           parties, and returns it ('created').
--
-- WHY SECURITY DEFINER: under the default-deny RLS a buyer can neither read the
-- RLS-closed `listings` table (seller_id) nor INSERT into deals/deal_parties
-- (no buyer-insert policies exist). offer_accept() is owner-run so it can do
-- this one controlled job — the same precedent as match_listings_for_match()
-- (0003) and the auth_* / audit helpers. It WRITES only the deal + parties the
-- accepting buyer may create and NEVER mutates listing.status, so golden
-- replays stay deterministic (no 'booked' listing states).
--
-- AUDIT: no migration/trigger is added for deal INSERTs. The 0001 triggers
-- cover only status UPDATEs (trg_deals_status_audit) and approvals — there is
-- no INSERT audit trigger on deals, and per the task this is noted in the
-- summary rather than extending the audit model.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) deals reference the originating listing (plain ref, no FK cycle).
-- ---------------------------------------------------------------------------
ALTER TABLE deals ADD COLUMN IF NOT EXISTS listing_id uuid;
CREATE INDEX IF NOT EXISTS deals_listing_idx ON deals (listing_id);

-- ---------------------------------------------------------------------------
-- 2) offer_accept() — atomic buyer accept (see header).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION offer_accept(
  p_buyer_id    uuid,
  p_listing_id  uuid,
  p_request_id  uuid DEFAULT NULL
) RETURNS TABLE (outcome text, deal jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing listings%ROWTYPE;
  v_deal    deals;
BEGIN
  -- Distinguish "unknown" (404) from "exists but not active" (409).
  SELECT * INTO v_listing FROM listings WHERE id = p_listing_id;
  IF NOT FOUND THEN
    outcome := 'not_found';
    RETURN NEXT;
    RETURN;
  END IF;
  IF v_listing.status <> 'active' THEN
    outcome := 'conflict';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Idempotency: same buyer already holds a non-terminal deal for this listing.
  SELECT d.* INTO v_deal
  FROM deals d
  JOIN deal_parties dp ON dp.deal_id = d.id
  WHERE d.listing_id = p_listing_id
    AND dp.user_id = p_buyer_id
    AND dp.role = 'buyer'
    AND d.status NOT IN ('cancelled','completed')
  ORDER BY d.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    outcome := 'existing';
    deal := to_jsonb(v_deal);
    RETURN NEXT;
    RETURN;
  END IF;

  -- Create the deal with the initial (first) lifecycle status, then its two
  -- parties: the accepting buyer and the listing's seller.
  INSERT INTO deals (name, status, listing_id)
  VALUES ('Deal — ' || v_listing.name, 'negotiating', p_listing_id)
  RETURNING * INTO v_deal;

  INSERT INTO deal_parties (deal_id, user_id, role) VALUES
    (v_deal.id, p_buyer_id, 'buyer'),
    (v_deal.id, v_listing.seller_id, 'seller');

  outcome := 'created';
  deal := to_jsonb(v_deal);
  RETURN NEXT;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Least privilege: only the app role may execute it.
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION offer_accept(uuid, uuid, uuid) TO sg_app;
