// server/src/routes/calculator.js
// /api/calculator/quote — five-year TCO quote from structure inputs.
//
// Pure, stateless: validates inputs with zod, runs the verbatim port of
// src/lib/cost.js computeCalculator, returns identical numbers to the frontend
// Five-Year Calculator. Requires any authenticated user (deny by default).

import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { computeCalculator } from '../domain/calculator.js'

const quoteSchema = z.object({
  count: z.coerce.number().int().positive(),
  pricePerAccelHr: z.number().nonnegative(),
  onDemandPerAccelHr: z.number().nonnegative().optional(),
  utilization: z.number().min(0).max(1).optional().default(0.6),
  setupCost: z.number().nonnegative().optional().default(0),
  termYears: z.coerce.number().min(1).max(5).optional().default(1),
  resiliencePct: z.number().min(0).optional().default(0),
  sovereigntyPct: z.number().min(0).optional().default(0),
  financedPct: z.number().min(0).max(100).optional().default(0),
  financingRate: z.number().min(0).optional().default(0),
  resalePct: z.number().min(0).max(100).optional().default(0),
})

/** @param {{pool: import('pg').Pool}} opts */
export function createCalculatorRouter({ pool }) {
  const router = Router()
  router.use(requireAuth({ pool }))
  router.use(requireRole('any'))

  router.post('/quote', async (req, res, next) => {
    try {
      const body = quoteSchema.parse(req.body)
      const quote = computeCalculator({
        count: body.count,
        pricePerAccelHr: body.pricePerAccelHr,
        onDemandPerAccelHr: body.onDemandPerAccelHr ?? body.pricePerAccelHr,
        utilization: body.utilization,
        setupCost: body.setupCost,
        termYears: body.termYears,
        resiliencePct: body.resiliencePct,
        sovereigntyPct: body.sovereigntyPct,
        financedPct: body.financedPct,
        financingRate: body.financingRate,
        resalePct: body.resalePct,
      })
      res.status(200).json({ quote })
    } catch (err) {
      next(err)
    }
  })

  return router
}
