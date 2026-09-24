// server/src/routes/marketplace.js
// /api/marketplace — public active-listings read model.
//
// Served for anonymous clients through the security-definer owned VIEW
// v_marketplace_listings (0002_auth.sql), which exposes ONLY the safe /
// anonymized column whitelist — NO seller_id, NO committed_price. The base
// `listings` table stays RLS-protected. This is a sibling of the existing
// /api/listings/marketplace route (Wave B), exposed at the top-level path Wave C
// specifies.

import { Router } from 'express'

/** @param {{pool: import('pg').Pool}} opts */
export function createMarketplaceRouter({ pool }) {
  const router = Router()

  router.get('/', async (_req, res, next) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM v_marketplace_listings ORDER BY created_at DESC',
      )
      res.status(200).json({ listings: rows })
    } catch (err) {
      next(err)
    }
  })

  return router
}
