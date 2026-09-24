-- =============================================================================
-- 0004_wave_c_fix.sql  —  approved eligibility-case evidence reader (buyer path)
-- -----------------------------------------------------------------------------
-- The /api/requests/:id/matches endpoint must let a BUYER see the approved
-- evidence that unlocks a previously-disqualified route (the Ascend → bookable
-- path), so "eligibility approve ⇒ deal becomes bookable" is observable through
-- the buyer-facing API (Wave C spec: evidence-driven disqualification, never a
-- blanket geography exclusion).
--
-- eligibility_cases (0003) is operator-internal: its only RLS policy is
-- operator_all, so a buyer-context SELECT returns nothing and the merge in
-- requests.js /matches silently dropped approved cases. Mirror the established
-- SECURITY DEFINER read pattern (auth_user_by_email 0002, match_listings_for_match
-- 0003): a controlled owner-run function returning ONLY {listing_id, evidence}
-- for a request's APPROVED cases — never the case's status / missing / reason
-- internals, and only for the requested request_id. It reads; it never writes.
-- Base tables keep their RLS invariants intact.
-- =============================================================================

CREATE OR REPLACE FUNCTION approved_eligibility_evidence(p_request uuid)
RETURNS TABLE (listing_id uuid, evidence jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT listing_id, evidence
  FROM eligibility_cases
  WHERE request_id = p_request AND status = 'approved'
$$;

GRANT EXECUTE ON FUNCTION approved_eligibility_evidence(uuid) TO sg_app;
