// server/src/routes/intel.js
// /api/intel — market-intelligence observations backend (Wave L).
//
//   GET  /api/intel/observations    PUBLIC   — read model via the SECURITY
//                                              DEFINER market_observations_public()
//                                              (whitelisted columns only; ordered
//                                              observed_at DESC, limited to 500).
//   POST /api/intel/observations    operator — operator-curated observation
//                                              (level, accelerator, price, ...).
//                                              family computed server-side with the
//                                              SAME mapping as the migration helper.
//   POST /api/intel/ingest/vast     operator — ingest a verified live source
//                                              (vast.ai bundle listings). Injectable
//                                              fetch (app factory opts.fetchImpl,
//                                              default globalThis.fetch); 15s timeout;
//                                              datacenter allowlist filter; upsert by
//                                              (source, source_ref) so repeats dedupe.
//   POST /api/intel/ingest/azure    operator — ingest the Azure Retail Prices API
//                                              (public, no auth). Per-SKU queries for
//                                              a FIXED map of SKUs whose datacenter
//                                              GPU counts were verified against
//                                              Microsoft Learn (2026-09-27). Dedicated
//                                              Linux PAYG rows only (Consumption,
//                                              USD, no Windows, no Spot/Low Priority).
//                                              Unknown SKU -> skipped, NEVER priced
//                                              (house rule: no guessed per-GPU math).
//
// House law: never a live market price. Every row is a dated, evidence-specific
// observation feeding an indicative index. Ingested rows are level='Indicative'
// (public/advertised pricing), source='vast.ai', source_ref=<offer id>.

import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { withUser } from '../db/pool.js'

export const VAST_BUNDLES_URL = 'https://console.vast.ai/api/v0/bundles/'

// ---------------------------------------------------------------------------
// Azure Retail Prices ingest (verified 2026-09-27).
//
// AZURE_GPU_COUNTS maps the only armSkuName values we will ever price. Each
// count was read from the "Accelerator (GPUs, FPGAs, etc.)" table on the
// corresponding learn.microsoft.com size-series page (docs pulled and checked
// the same day). Adding a SKU REQUIRES a fresh docs verification — do not
// infer counts from SKU names, marketing pages, or other clouds.
//
//   ND H100 v5  https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/gpu-accelerated/nd-h100-v5-series   (ND96isr_H100_v5 = 8)
//   ND H200 v5  https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/gpu-accelerated/nd-h200-v5-series   (ND96isr_H200_v5 = 8)
//   ND MI300X v5 https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/gpu-accelerated/nd-mi300x-v5-series (ND96isr_MI300X_v5 = 8)
//   NCads H100 v5 https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/gpu-accelerated/ncadsh100v5-series (NC40ads=1, NC80adis=2)
//   NC A100 v4  https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/gpu-accelerated/nca100v4-series      (24ads=1, 48ads=2, 96ads=4)
// ---------------------------------------------------------------------------
export const AZURE_PRICES_URL = 'https://prices.azure.com/api/retail/prices'
export const AZURE_GPU_COUNTS = Object.freeze({
  Standard_ND96isr_H100_v5: 8,
  Standard_ND96isr_H200_v5: 8,
  Standard_ND96isr_MI300X_v5: 8,
  Standard_NC40ads_H100_v5: 1,
  Standard_NC80adis_H100_v5: 2,
  Standard_NC24ads_A100_v4: 1,
  Standard_NC48ads_A100_v4: 2,
  Standard_NC96ads_A100_v4: 4,
})

/**
 * True when a Retail Prices row is the evidence we want: Dedicated (pay as you
 * go) Linux meter in USD. Anything else (Reservations, DevTest, Spot, Low
 * Priority, Windows rates, non-USD) is rejected.
 */
export function isAzureDedicatedLinuxPayg(row) {
  return Boolean(row)
    && row.type === 'Consumption'
    && row.currencyCode === 'USD'
    && row.unitOfMeasure === '1 Hour'
    && !/windows/i.test(String(row.productName || ''))
    && !/spot|low priority/i.test(String(row.skuName || ''))
    && Number.isFinite(Number(row.retailPrice))
    && Number(row.retailPrice) > 0
}

/**
 * acceleratorForAzureSku('Standard_NC40ads_H100_v5') -> 'H100'.
 * Returns null for SKUs outside the verified map (caller must skip, never
 * guess a GPU count).
 */
export function acceleratorForAzureSku(sku) {
  const m = /(H100|H200|MI300X|A100)/.exec(String(sku || ''))
  return m ? m[1] : null
}

/**
 * Azure armRegionName ("westeurope", "uaenorth", "southcentralus") -> SG region.
 * Azure US regions all end in "us" or "us<N>" (eastus, westus2, centralus...);
 * guard against substrings like "aus".
 */
export function regionForAzureRegion(armRegion) {
  const r = String(armRegion || '').trim().toLowerCase()
  if (!r) return 'Global'
  if (/us$|us\d/.test(r) && !/aus|rus/.test(r)) return 'US'
  if (/uaenorth|uaecentral|qatarcentral/.test(r)) return 'GCC'
  if (/(germany|france|netherlands|sweden|switzerland|norway|europe|uk|poland|italy|spain|belgium|austria|denmark|finland|ireland|portugal|greece)/.test(r)) return 'EU'
  if (/(israel|jioindia|centralindia|southindia|westindia|korea|japan|southeastasia|eastasia|malaysia|indonesia|thailand|vietnam|taiwan|hongkong|china)/.test(r)) return 'Asia'
  return 'Global'
}

// Datacenter-accelerator allowlist. Only offers whose gpu_name matches are
// ingested; consumer cards (RTX/V100/... ) are skipped. Verified against the
// real `gpu_name` values in server/test/fixtures/vast_sample.json.
export const VAST_ALLOWLIST_RE = /(H100|H200|H800|A100|A800|MI300X|MI325X|L40S?|B200|GB200)/i

// The concrete accelerator tokens the allowlist can emit. Shared fixture list
// the family-map sync test iterates to prove the JS map and the SQL
// family_for_accel() helper stay in lockstep.
export const VAST_ALLOWLIST = [
  'H100', 'H200', 'H800', 'A100', 'A800',
  'MI300X', 'MI325X', 'L40', 'L40S', 'B200', 'GB200',
]

// Duplicate of src/lib/deal.js `acceleratorFamily` — EXACT same order and
// EXACT same family strings (H200, MI300X, TPU, Ascend 910C, else the raw
// accelerator). Kept in sync with the SQL helper family_for_accel() (0007) by
// the family-map sync test, and with lib by construction. Do not diverge.
export function familyForAccel(accel) {
  const a = String(accel || '')
  if (/h200/i.test(a)) return 'H200'
  if (/mi300/i.test(a)) return 'MI300X'
  if (/mi3/i.test(a)) return 'MI300X'
  if (/tpu/i.test(a)) return 'TPU'
  if (/ascend|910c/i.test(a)) return 'Ascend 910C'
  if (/h100/i.test(a)) return 'H100'
  if (/a100/i.test(a)) return 'A100'
  if (/gb200/i.test(a)) return 'GB200'
  if (/b200/i.test(a)) return 'B200'
  if (/l40s/i.test(a)) return 'L40S'
  return a || 'Other'
}

const GCC = new Set(['AE', 'SA', 'QA', 'KW', 'BH', 'OM'])
const EU = new Set(['GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'FI', 'NO', 'DK', 'BE', 'AT', 'IE', 'PL', 'PT', 'GR', 'CH', 'LU', 'CZ', 'HR', 'EE', 'HU', 'LT', 'LV', 'RO', 'SK', 'SI', 'BG', 'CY', 'MT'])
const ASIA = new Set(['CN', 'JP', 'KR', 'SG', 'IN', 'TW', 'HK', 'VN', 'MY', 'TH', 'ID', 'PH', 'AE'])

/**
 * Map an ISO country code to a Sovereign Grid region. Small map, default 'Global'.
 */
export function regionForCountry(country) {
  const cc = String(country || '').trim().toUpperCase()
  if (cc === 'US') return 'US'
  if (GCC.has(cc)) return 'GCC'
  if (EU.has(cc)) return 'EU'
  if (ASIA.has(cc)) return 'Asia'
  return 'Global'
}

/**
 * vast.ai `geolocation` is "<City>, <CC>" (e.g. "New Jersey, US", "France, FR",
 * ", CN"). Take the trailing country code; anything unparseable -> 'Global'.
 */
export function regionFromGeolocation(geo) {
  const s = String(geo || '')
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean)
  return regionForCountry(parts.length ? parts[parts.length - 1] : '')
}

const createObservationSchema = z.object({
  level: z.enum(['Indicative', 'Quoted', 'Transacted']),
  accelerator: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(40).optional(),
  price: z.number().positive(),
  source: z.string().trim().min(1).max(40),
  sourceRef: z.string().trim().max(200).optional(),
})

/** @param {{pool: import('pg').Pool, fetchImpl?: typeof globalThis.fetch}} opts */
export function createIntelRouter({ pool, fetchImpl = globalThis.fetch }) {
  const router = Router()

  // Public read model — registered before any auth middleware so it stays open.
  router.get('/observations', async (_req, res, next) => {
    try {
      const { rows } = await pool.query('SELECT * FROM market_observations_public() LIMIT 500')
      res.status(200).json({ observations: rows })
    } catch (err) {
      next(err)
    }
  })

  // Everything below requires an authenticated operator.
  router.use(requireAuth({ pool }))
  router.use(requireRole('operator'))

  // POST /api/intel/observations — operator-curated observation.
  router.post('/observations', async (req, res, next) => {
    try {
      const body = createObservationSchema.parse(req.body)
      const region = body.region || 'Global'
      const family = familyForAccel(body.accelerator)
      const { rows } = await withUser(req.user.id, 'operator', async (c) => {
        return c.query(
          `INSERT INTO market_observations
             (level, accelerator, family, region, price, source, source_ref, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [body.level, body.accelerator, family, region, body.price, body.source, body.sourceRef ?? null, req.user.id],
        )
      }, pool)
      res.status(201).json({ observation: rows[0] })
    } catch (err) {
      next(err)
    }
  })

  // POST /api/intel/ingest/vast — ingest the verified vast.ai bundle source.
  router.post('/ingest/vast', async (req, res, next) => {
    try {
      // 15s timeout on the upstream fetch.
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 15000)
      let payload
      try {
        const resp = await fetchImpl(VAST_BUNDLES_URL, {
          headers: { Accept: 'application/json' },
          signal: ctrl.signal,
        })
        if (!resp.ok) {
          throw new Error(`vast.ai bundles responded ${resp.status}`)
        }
        payload = await resp.json()
      } finally {
        clearTimeout(timer)
      }

      const offers = payload && Array.isArray(payload.offers) ? payload.offers : []

      const result = await withUser(req.user.id, 'operator', async (c) => {
        let inserted = 0
        let updated = 0
        let skipped = 0
        for (const offer of offers) {
          const gpu = String(offer.gpu_name || '')
          if (!VAST_ALLOWLIST_RE.test(gpu)) {
            skipped += 1
            continue
          }
          const dph = Number(offer.dph_total)
          const numGpus = Number(offer.num_gpus) || 0
          if (!Number.isFinite(dph) || dph <= 0) {
            skipped += 1
            continue
          }
          // dph_total is the per-instance total; dividing by gpu count yields
          // $/accel-hr (the observation unit). Verified from the real sample.
          const price = dph / Math.max(numGpus, 1)
          if (!(price > 0)) {
            skipped += 1
            continue
          }

          const family = familyForAccel(gpu)
          const region = regionFromGeolocation(offer.geolocation)
          const sourceRef = String(offer.id)

          const { rows } = await c.query(
            `INSERT INTO market_observations
               (level, accelerator, family, region, price, unit, source, source_ref, created_by)
             VALUES ('Indicative', $1, $2, $3, $4, 'usd/accel-hr', 'vast.ai', $5, $6)
             ON CONFLICT (source, source_ref) WHERE source_ref IS NOT NULL DO UPDATE
               SET price = EXCLUDED.price, observed_at = now()
             RETURNING (xmax = 0) AS inserted`,
            [gpu, family, region, price, sourceRef, req.user.id],
          )
          // xmax: 0 on a fresh insert, non-zero after the conflict-update path.
          if (rows[0] && rows[0].inserted === true) inserted += 1
          else updated += 1
        }
        return { inserted, updated, skipped }
      }, pool)

      res.status(200).json(result)
    } catch (err) {
      next(err)
    }
  })

  // POST /api/intel/ingest/azure — ingest the verified Azure Retail Prices
  // source. One small query per SKU in the verified GPU-count map (the API
  // supports armSkuName filters; 8 targeted GETs beat paginating a firehose).
  // Only rows passing isAzureDedicatedLinuxPayg() are priced, and only SKUs in
  // AZURE_GPU_COUNTS are ever divided — unknown SKU => skipped, no guesses.
  router.post('/ingest/azure', async (req, res, next) => {
    try {
      const rows = []
      for (const sku of Object.keys(AZURE_GPU_COUNTS)) {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 15000)
        try {
          const filter = `serviceName eq 'Virtual Machines' and armSkuName eq '${sku}'`
          const url = `${AZURE_PRICES_URL}?$filter=${encodeURIComponent(filter)}`
          const resp = await fetchImpl(url, {
            headers: { Accept: 'application/json' },
            signal: ctrl.signal,
          })
          if (!resp.ok) {
            throw new Error(`azure retail prices responded ${resp.status}`)
          }
          const payload = await resp.json()
          if (payload && Array.isArray(payload.Items)) rows.push(...payload.Items)
        } finally {
          clearTimeout(timer)
        }
      }

      const result = await withUser(req.user.id, 'operator', async (c) => {
        let inserted = 0
        let updated = 0
        let skipped = 0
        for (const row of rows) {
          const sku = String(row.armSkuName || '')
          const gpuCount = AZURE_GPU_COUNTS[sku]
          if (!gpuCount || !isAzureDedicatedLinuxPayg(row)) {
            skipped += 1
            continue
          }
          const accel = acceleratorForAzureSku(sku)
          // retailPrice is per-VM-hour; the count is a docs-verified constant.
          const price = Number(row.retailPrice) / gpuCount
          const family = familyForAccel(accel)
          const region = regionForAzureRegion(row.armRegionName)
          // Per-meter-per-region ref: repeats dedupe, distinct regions coexist.
          const sourceRef = `${sku}:${row.meterName}:${row.armRegionName}:${row.type}`

          const { rows: insRows } = await c.query(
            `INSERT INTO market_observations
               (level, accelerator, family, region, price, unit, source, source_ref, created_by)
             VALUES ('Indicative', $1, $2, $3, $4, 'usd/accel-hr', 'azure', $5, $6)
             ON CONFLICT (source, source_ref) WHERE source_ref IS NOT NULL DO UPDATE
               SET price = EXCLUDED.price, observed_at = now()
             RETURNING (xmax = 0) AS inserted`,
            [accel, family, region, price, sourceRef, req.user.id],
          )
          if (insRows[0] && insRows[0].inserted === true) inserted += 1
          else updated += 1
        }
        return { inserted, updated, skipped }
      }, pool)

      res.status(200).json(result)
    } catch (err) {
      next(err)
    }
  })

  return router
}
