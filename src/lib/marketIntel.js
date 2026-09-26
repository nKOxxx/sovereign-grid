// src/lib/marketIntel.js
// Pure helpers for the Market Intelligence screen (Wave L). Lives in lib (not
// the screen) so it is node-testable and keeps the screen file component-only
// for fast-refresh. Maps backend observation rows into the groupMarket shape
// that src/lib/deal.js aggregation + the price-series table read.
import { acceleratorFamily } from './deal.js'

/** Map a seed observation to the groupMarket shape (family derived via lib). */
export function seedToObservation(o) {
  return { ...o, level: o.level, family: acceleratorFamily(o.accelerator) }
}

/** observed_at (timestamptz ISO) -> a displayable YYYY-MM-DD date, else '—'. */
export function formatObservationDate(iso) {
  if (!iso) return '—'
  const s = String(iso).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '—'
}

/**
 * Map a backend observation row to the groupMarket / price-series shape.
 * Keeps every field the existing table + aggregation read (level, family,
 * region, term, pricePerAccelHr, date, source).
 */
export function liveToObservation(row) {
  return {
    id: row.id,
    level: row.level,
    accelerator: row.accelerator,
    family: row.family || acceleratorFamily(row.accelerator) || 'Other',
    region: row.region || 'Global',
    term: '—',
    pricePerAccelHr: Number(row.price),
    date: formatObservationDate(row.observed_at),
    source: row.source ? `${row.source}${row.source_ref ? ` #${row.source_ref}` : ''}` : '—',
    quality: String(row.level || 'Indicative').toLowerCase(),
  }
}

/**
 * Load live observations from the backend. Returns an array of mapped rows on
 * success (non-empty), or null on any failure / empty payload — the caller
 * falls back to seed data.
 */
export async function fetchObservations(fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl('/api/intel/observations', { headers: { Accept: 'application/json' } })
    if (!res || !res.ok) return null
    const data = await res.json()
    const rows = Array.isArray(data && data.observations) ? data.observations : null
    if (!rows || !rows.length) return null
    return rows.map(liveToObservation)
  } catch {
    return null // backend offline / malformed -> seed fallback
  }
}
