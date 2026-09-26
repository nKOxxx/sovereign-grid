// src/lib/deal.js
// Deal-room, CRM-automation and market-intelligence domain logic for the demo
// (SPEC §12, §13, §14). PURE functions only — no browser APIs, no React.
// Fully unit-testable in node.
//
// Everything in here is DEMO / illustrative — milestone states, approvals,
// message statuses and aggregated price cells are illustrative demo data.

// ---------------------------------------------------------------------------
// Transaction milestones (SPEC §12.2) — strict forward-ordering.
// ---------------------------------------------------------------------------

export const MILESTONES = [
  'connection_accepted',
  'commercially_agreed',
  'conditionally_awarded',
  'contracted',
  'provisioning_ready',
  'accepted',
  'settled',
  'completed',
]

export const MILESTONE_LABELS = {
  connection_accepted: 'Connection accepted',
  commercially_agreed: 'Commercially agreed',
  conditionally_awarded: 'Conditionally awarded',
  contracted: 'Contracted',
  provisioning_ready: 'Provisioning ready',
  accepted: 'Accepted',
  settled: 'Settled',
  completed: 'Completed',
}

/** Position of a milestone in the canonical order (-1 if unknown). */
export function milestoneIndex(name) {
  return MILESTONES.indexOf(name)
}

/** True when `name` is a known milestone. */
export function isMilestone(name) {
  return milestoneIndex(name) >= 0
}

/**
 * State machine helper. Given the current milestone name and a set of achieved
 * milestone names, returns per-milestone status for a tracker:
 *   'done'    -> strictly before the current milestone (or in achieved list)
 *   'current' -> == current
 *   'pending' -> after current
 * Tracker never reorders: order is always the canonical MILESTONES order.
 */
export function milestoneTracker(current, achieved = []) {
  const cur = milestoneIndex(current)
  const achievedSet = new Set(achieved)
  return MILESTONES.map((name, i) => {
    let status
    if (i < cur) status = 'done'
    else if (i === cur) status = 'current'
    else status = 'pending'
    // An explicitly achieved milestone earlier than current stays 'done';
    // one late (should not happen) is clamped to 'done'.
    if (achievedSet.has(name) && status === 'pending') status = 'done'
    return { name, label: MILESTONE_LABELS[name], index: i, status }
  })
}

// ---------------------------------------------------------------------------
// CRM approval gating (SPEC §13.3).
// Sensitive or binding communication requires explicit approval before send.
// ---------------------------------------------------------------------------

/** Can this message be sent without further approval? */
export function canSendMessage(msg) {
  return !(msg && msg.requiresApproval) || Boolean(msg.approved)
}

/** Human-readable reason a message is blocked (null if sendable). */
export function messageSendBlockReason(msg) {
  if (canSendMessage(msg)) return null
  return msg.approvalRule || 'Sensitive or binding communication requires explicit approval (SPEC §13.3).'
}

/**
 * Apply 'approve' | 'reject' to a message inside a messages array.
 * Returns a new array (immutable). Approve sets approved=true and status
 * 'approved'; reject sets approved=false and status 'rejected'.
 */
export function applyMessageApproval(messages, id, action) {
  return messages.map((m) => {
    if (m.id !== id) return m
    if (action === 'approve') return { ...m, approved: true, status: 'approved' }
    if (action === 'reject') return { ...m, approved: false, status: 'rejected' }
    return m
  })
}

/**
 * Follow-up triggers (SPEC §13.2): pulls the triggers relevant to a deal.
 * Pass the deal's owned objects; returns a filtered, normalised list.
 */
export function followUpTriggers(deal, opts = {}) {
  const triggers = []
  const now = opts.now || deal.now || '2026-09-16'
  // No seller response: requested doc not received.
  if (deal.documents && deal.documents.some((d) => d.requested && !d.received)) {
    triggers.push({ id: 'fu-evidence', type: 'evidence_missing', label: 'Evidence missing', detail: 'Requested documents not yet received (zero-data-retention + route review).', priority: 'high', due: now })
  }
  if (deal.invoices && deal.invoices.some((i) => i.status === 'scheduled')) {
    triggers.push({ id: 'fu-contract', type: 'contract_nearing_expiry', label: 'Contract nearing expiry', detail: 'Acceptance window closes 2026-09-30.', priority: 'medium', due: '2026-09-29' })
  }
  // If the caller passes their own rich trigger list, prefer merging it.
  if (deal.followUpTriggers) triggers.push(...deal.followUpTriggers)
  return triggers
}

// ---------------------------------------------------------------------------
// Market intelligence: data hierarchy + minimum-observation rule (SPEC §14).
// ---------------------------------------------------------------------------

export const MARKET_LEVELS = ['Indicative', 'Quoted', 'Transacted']
export const MIN_OBSERVATIONS = 3

/** Family label from an observation's accelerator string (demo mapping). */
export function acceleratorFamily(accel) {
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

/**
 * Aggregate a group of observations into a single cell.
 * Returns { level, count, avg, min, max, latest, sufficient, observations }.
 * sufficient = count >= MIN_OBSERVATIONS. Levels never mix within a group.
 */
export function aggregateCell(observations) {
  const prices = (observations || []).map((o) => o.pricePerAccelHr).filter((n) => typeof n === 'number')
  const count = prices.length
  const levels = [...new Set((observations || []).map((o) => o.level))]
  const sum = prices.reduce((a, b) => a + b, 0)
  const latest = (observations || [])
    .map((o) => o.date)
    .sort()
    .pop()
  return {
    level: levels.length === 1 ? levels[0] : null,
    count,
    avg: count ? sum / count : null,
    min: count ? Math.min(...prices) : null,
    max: count ? Math.max(...prices) : null,
    latest,
    sufficient: count >= MIN_OBSERVATIONS,
    observations: observations || [],
  }
}

/**
 * Groups observations into aggregated cells by a groups function, applying the
 * minimum-observation rule. Levels are partitioned first so a cell can never mix
 * data levels (never mix Indicative with Transacted, etc.).
 * Returns { cells, hidden } where hidden lists under-observed cells.
 */
export function groupMarket(observations, { minObs = MIN_OBSERVATIONS, groups = (o) => `${o.level}|${o.family}|${o.region}` } = {}) {
  const buckets = new Map()
  for (const o of observations || []) {
    const family = o.family || acceleratorFamily(o.accelerator)
    const key = groups({ ...o, family })
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push({ ...o, family })
  }
  const cells = []
  const hidden = []
  for (const [key, obs] of buckets) {
    const agg = aggregateCell(obs)
    const cell = { key, ...agg }
    if (cell.sufficient) cells.push(cell)
    else hidden.push({ ...cell, reason: `insufficient observations (${cell.count} < ${minObs})` })
  }
  // Stable ordering: level, then family, then region.
  cells.sort((a, b) => levelRank(a.level) - levelRank(b.level) || String(a.key).localeCompare(String(b.key)))
  hidden.sort((a, b) => levelRank(a.level) - levelRank(b.level) || String(a.key).localeCompare(String(b.key)))
  return { cells, hidden }
}

function levelRank(level) {
  const i = MARKET_LEVELS.indexOf(level)
  return i === -1 ? 99 : i
}

/**
 * Defence-in-depth: every aggregated cell must hold a single, homogeneous data
 * level. Returns false if any observed group mixes two levels.
 */
export function levelsNeverMix(observations, groupsBy) {
  const buckets = new Map()
  for (const o of observations || []) {
    const key = groupsBy ? groupsBy(o) : o.family + '|' + o.region
    if (!buckets.has(key)) buckets.set(key, new Set())
    buckets.get(key).add(o.level)
  }
  for (const levels of buckets.values()) {
    if (levels.size > 1) return false
  }
  return true
}
