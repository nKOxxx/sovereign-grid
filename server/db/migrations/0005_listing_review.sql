-- =============================================================================
-- 0005_listing_review.sql  —  listing review gate: pending-by-default + operator
-- -----------------------------------------------------------------------------
-- Closes the "unreviewed listings shift matching outcomes" hole: seller
-- onboarding posts listings with status='active' on creation, so unreviewed
-- capacity immediately entered the live pool. This migration makes the review
-- gate hold at the data layer:
--
--   * New listing rows now DEFAULT to 'pending'. POST /api/listings (see
--     listings.js) sets status='pending' explicitly and zod strips any
--     client-supplied status.
--   * A listing enters the live pool ONLY when an operator approves it via
--     PATCH /api/listings/:id/status -> status='active'.
--   * Operator approve/reject transitions are recorded in the immutable
--     audit_log via the SAME trigger mechanism already used by deals status
--     changes (trg_deals_status_audit, 0001) and fee_policy / eligibility_cases
--     (0003). No app code writes audit rows directly.
--
-- INTEGRITY (verified, no change needed): both read paths that feed the live
-- pool already filter status='active' —
--     * match_listings_for_match()  (0003) — the buyer /matches candidate pool
--     * v_marketplace_listings        (0002) — the public marketplace view
-- so a 'pending' listing is structurally invisible to buyers and to public
-- market before any migration work here. This migration only enforces the
-- pending-by-default + audited-transition side of the gate.
--
-- BACKWARD COMPATIBILITY: existing rows are untouched (they keep 'active');
-- only the column DEFAULT changes for future INSERTs, and no seed data is
-- rewritten (seed.js sets 'active' explicitly, so the golden tests stay green).
--
-- Idempotent by construction (ALTER / DROP IF EXISTS + CREATE TRIGGER, mirroring
-- 0001/0003 conventions).
-- =============================================================================

-- New listings are created in pending review, not live.
ALTER TABLE listings ALTER COLUMN status SET DEFAULT 'pending';

-- Audit every listing status transition (approve -> active, reject -> rejected).
-- audit_triggered_row() is SECURITY DEFINER and records the actor from the
-- transaction's app.user_id (the operator who PATCHed), matching deals/approvals.
DROP TRIGGER IF EXISTS trg_listings_status_audit ON listings;
CREATE TRIGGER trg_listings_status_audit AFTER UPDATE OF status ON listings
  FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION audit_triggered_row();
