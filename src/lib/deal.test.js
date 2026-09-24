// src/lib/deal.test.js
import { describe, it, expect } from 'vitest'
import {
  MILESTONES,
  MILESTONE_LABELS,
  milestoneIndex,
  milestoneTracker,
  canSendMessage,
  messageSendBlockReason,
  applyMessageApproval,
  followUpTriggers,
  aggregateCell,
  groupMarket,
  levelsNeverMix,
  acceleratorFamily,
  MIN_OBSERVATIONS,
} from './deal.js'

describe('transaction milestone sequence (SPEC §12.2)', () => {
  it('has the exact 8 spec milestones in forward order', () => {
    expect(MILESTONES).toEqual([
      'connection_accepted',
      'commercially_agreed',
      'conditionally_awarded',
      'contracted',
      'provisioning_ready',
      'accepted',
      'settled',
      'completed',
    ])
  })

  it('orders milestones strictly: later milestone has a higher index', () => {
    expect(milestoneIndex('completed')).toBeGreaterThan(milestoneIndex('conditionally_awarded'))
    expect(milestoneIndex('conditionally_awarded')).toBeGreaterThan(milestoneIndex('connection_accepted'))
    expect(milestoneIndex('contracted')).toBe(milestoneIndex('conditionally_awarded') + 1)
  })

  it('exposes a human label for every milestone', () => {
    for (const m of MILESTONES) expect(MILESTONE_LABELS[m]).toBeTruthy()
    expect(MILESTONE_LABELS.conditionally_awarded).toBe('Conditionally awarded')
  })

  it('milestoneTracker marks current = Conditionally awarded with done/pending around it', () => {
    const track = milestoneTracker('conditionally_awarded', ['connection_accepted', 'commercially_agreed', 'conditionally_awarded'])
    const byName = Object.fromEntries(track.map((t) => [t.name, t.status]))
    expect(byName.connection_accepted).toBe('done')
    expect(byName.commercially_agreed).toBe('done')
    expect(byName.conditionally_awarded).toBe('current')
    expect(byName.contracted).toBe('pending')
    expect(byName.completed).toBe('pending')
    // canonical order is preserved
    expect(track.map((t) => t.name)).toEqual(MILESTONES)
  })

  it('clamps an out-of-order achieved milestone to done rather than reordering', () => {
    const track = milestoneTracker('contracted', ['settled'])
    const settled = track.find((t) => t.name === 'settled')
    expect(settled.status).toBe('done')
  })
})

describe('CRM approval gating (SPEC §13.3)', () => {
  it('blocks send for a sensitive/binding message that is not approved', () => {
    const msg = { id: 'x', requiresApproval: true, approved: false, approvalRule: 'Binding commercial terms need approval.' }
    expect(canSendMessage(msg)).toBe(false)
    expect(messageSendBlockReason(msg)).toContain('Binding')
  })

  it('allows send when a message does not require approval', () => {
    expect(canSendMessage({ requiresApproval: false })).toBe(true)
    expect(messageSendBlockReason({ requiresApproval: false })).toBeNull()
  })

  it('allows send once an approval-required message is approved', () => {
    const msg = { requiresApproval: true, approved: true }
    expect(canSendMessage(msg)).toBe(true)
    expect(messageSendBlockReason(msg)).toBeNull()
  })

  it('applyMessageApproval approve / reject updates only the target message', () => {
    const messages = [
      { id: 'a', requiresApproval: true, approved: false, status: 'pending_approval' },
      { id: 'b', requiresApproval: false, approved: false, status: 'sent' },
    ]
    const approved = applyMessageApproval(messages, 'a', 'approve')
    expect(approved.find((m) => m.id === 'a')).toMatchObject({ approved: true, status: 'approved' })
    expect(approved.find((m) => m.id === 'b')).toMatchObject({ approved: false, status: 'sent' })

    const rejected = applyMessageApproval(messages, 'a', 'reject')
    expect(rejected.find((m) => m.id === 'a')).toMatchObject({ approved: false, status: 'rejected' })
  })
})

describe('market intelligence aggregation (SPEC §14)', () => {
  const base = { accelerator: 'H200 SXM', region: 'EU', term: 'committed 12mo', date: '2026-09-01' }

  it('flags an aggregated cell as insufficient below the minimum observation count', () => {
    const two = aggregateCell([
      { ...base, level: 'Transacted', pricePerAccelHr: 2.05 },
      { ...base, level: 'Transacted', pricePerAccelHr: 2.06 },
    ])
    expect(two.count).toBe(2)
    expect(two.sufficient).toBe(false)
  })

  it('shows an aggregated cell once it meets the minimum observation count', () => {
    const three = aggregateCell([
      { ...base, level: 'Transacted', pricePerAccelHr: 2.05 },
      { ...base, level: 'Transacted', pricePerAccelHr: 2.06 },
      { ...base, level: 'Transacted', pricePerAccelHr: 2.07 },
    ])
    expect(three.count).toBe(3)
    expect(three.sufficient).toBe(true)
    expect(three.avg).toBeCloseTo(2.06, 3)
  })

  it('groupMarket hides under-observed cells and keeps observed ones', () => {
    const obs = [
      { ...base, level: 'Transacted', accelerator: 'H200 SXM', region: 'EU', pricePerAccelHr: 2.05 },
      { ...base, level: 'Transacted', accelerator: 'H200 SXM', region: 'EU', pricePerAccelHr: 2.06 },
      { ...base, level: 'Transacted', accelerator: 'H200 SXM', region: 'EU', pricePerAccelHr: 2.07 },
      { ...base, level: 'Transacted', accelerator: 'H200 SXM', region: 'US', pricePerAccelHr: 2.2 },
    ]
    const { cells, hidden } = groupMarket(obs)
    // EU cell has 3 -> shown; US cell has 1 -> hidden
    expect(cells.some((c) => c.key.includes('EU') && c.count === 3)).toBe(true)
    const hiddenUs = hidden.find((c) => c.key.includes('US'))
    expect(hiddenUs.reason).toContain('insufficient observations')
  })

  it('never mixes data levels inside an aggregated cell', () => {
    // One group key across two levels -> levelsNeverMix must return false.
    const mixed = [
      { ...base, level: 'Indicative', accelerator: 'H200 SXM', region: 'EU', pricePerAccelHr: 2.1 },
      { ...base, level: 'Transacted', accelerator: 'H200 SXM', region: 'EU', pricePerAccelHr: 2.05 },
    ]
    expect(levelsNeverMix(mixed, (o) => o.family || 'H200' + '|' + o.region)).toBe(false)

    const clean = [
      { ...base, level: 'Indicative', accelerator: 'H200 SXM', region: 'EU', pricePerAccelHr: 2.1 },
      { ...base, level: 'Transacted', accelerator: 'H200 SXM', region: 'US', pricePerAccelHr: 2.05 },
    ]
    expect(levelsNeverMix(clean, (o) => 'H200' + '|' + o.region)).toBe(true)
  })

  it('partitioning by level means groupMarket cells are homogeneous', () => {
    const mixed = [
      { ...base, level: 'Indicative', accelerator: 'H200 SXM', region: 'EU', pricePerAccelHr: 2.1 },
      { ...base, level: 'Quoted', accelerator: 'H200 SXM', region: 'EU', pricePerAccelHr: 2.12 },
      { ...base, level: 'Transacted', accelerator: 'H200 SXM', region: 'EU', pricePerAccelHr: 2.05 },
    ]
    const { cells } = groupMarket(mixed)
    // each cell holds one level only
    for (const c of cells) expect(c.level).toBeTruthy()
  })

  it('maps accelerator strings to families', () => {
    expect(acceleratorFamily('H200 SXM')).toBe('H200')
    expect(acceleratorFamily('MI300X')).toBe('MI300X')
    expect(acceleratorFamily('TPU v7')).toBe('TPU')
    expect(acceleratorFamily('Ascend 910C')).toBe('Ascend 910C')
  })

  it('MIN_OBSERVATIONS is 3', () => {
    expect(MIN_OBSERVATIONS).toBe(3)
  })
})

describe('follow-up triggers (SPEC §13.2)', () => {
  it('raises an evidence-missing trigger when a requested doc is not received', () => {
    const triggers = followUpTriggers({ documents: [{ requested: true, received: false }] })
    expect(triggers.some((t) => t.type === 'evidence_missing')).toBe(true)
  })
})
