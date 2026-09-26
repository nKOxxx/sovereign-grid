// server/db/seed.js
// Illustration seed for the Wave C Domain API — run with `npm run seed`.
//
// Mirrors the frontend demo dataset (src/data/seed.js) so the server's
// /matches, /calculator and /fees endpoints reproduce the SAME numbers the UI
// shows (the golden Project Falcon request -> 93 / 90 / 87 bookable, Ascend
// disqualified, 2 hard-filter exclusions).
//
// EVERY row here is DEMO / ILLUSTRATIVE — no figure is a live market price.
//
// IDEMPOTENT: every row has a fixed UUID and is inserted with
// ON CONFLICT DO NOTHING, so running `npm run seed` twice yields identical
// counts. Safe to re-run any number of times.
//
// ROLES:
//   * operator  operator@sg.local     / sg-operator-dev   (dev only — see below)
//   * buyer     falcon@demo.local     / sg-falcon-dev     (Project Falcon buyer)
//   * seller-1  seller1@demo.local    / sg-seller-dev
//   * seller-2  seller2@demo.local    / sg-seller2-dev
//
// OPERATOR PASSWORD: the operator is provisioned VIA SQL here with a KNOWN
// password so a developer can log the operator into the API in a dev sandbox.
// This is DEV-ONLY and documented: operator accounts are normally provisioned
// by an admin with NO password (see 0002_auth.sql — operator self-registration
// is blocked at both the schema and route boundary, but login for a provisioned
// operator is legitimate). Remove this password in any non-dev deployment and
// provision operators without a password_hash instead.

// MUST be the FIRST import: src/env.js loads server/.env into process.env
// before src/db/pool.js's eager module-level default Pool is constructed, so a
// bare `npm run seed` (with no DATABASE_URL in the shell) works — the same boot
// ordering index.js uses. Static ESM imports evaluate in source order, so this
// side-effect import runs before the pool import below.
import '../src/env.js'
import { pathToFileURL } from 'node:url'
import { createPool, withUser } from '../src/db/pool.js'
import { hashPassword } from '../src/auth/passwords.js'

// ---- fixed UUIDs ----------------------------------------------------------
const U = {
  operator: '00000000-0000-4000-8000-000000000001',
  buyer: '00000000-0000-4000-8000-000000000002',
  seller1: '00000000-0000-4000-8000-000000000003',
  seller2: '00000000-0000-4000-8000-000000000004',
}
const L = {
  euH200: '10000000-0000-4000-8000-000000000001',
  gccH200: '10000000-0000-4000-8000-000000000002',
  euMi300x: '10000000-0000-4000-8000-000000000003',
  cnAscend: '10000000-0000-4000-8000-000000000004',
  usMi300x: '10000000-0000-4000-8000-000000000005',
  tpu: '10000000-0000-4000-8000-000000000006',
}

// --- listing rows (mirror src/data/seed.js sellerListings) -----------------
// Each row maps to the listings table columns; facility / software / portability /
// resilience / sovereign / power / commitment / commercial / evidence are the
// jsonb columns the server normalize.js + score.js port reads. committed_price is
// the quote used by /matches (NOT exposed by the public marketplace view).
function listingRow(id, sellerId, row) {
  return [id, sellerId, row.name, row.provider_type, row.gpu_model, row.region,
    row.count, row.node, row.interconnect, row.memory,
    JSON.stringify(row.software), JSON.stringify(row.portability),
    JSON.stringify(row.facility), row.data_residency, row.firmness, row.start_date,
    row.min_term_months, row.max_term_months, row.committed_price, row.on_demand_price,
    'USD', 'per accelerator-hour',
    JSON.stringify(row.commercial), JSON.stringify(row.commitment),
    JSON.stringify(row.resilience), JSON.stringify(row.sovereign), JSON.stringify(row.power),
    row.verification_status, row.evidence_confidence, 'active', row.lead_time_weeks,
    JSON.stringify(row.provisioning)]
}

const LISTINGS = [
  listingRow(L.euH200, U.seller1, {
    name: 'Nordic H200 — Helsinki primary', provider_type: 'NVIDIA', gpu_model: 'H200 SXM', region: 'EU',
    count: 300, node: '8x H200 SXM', interconnect: 'NVLink + RoCE', memory: '141 GB HBM3e',
    software: { frameworks: ['PyTorch', 'CUDA', 'TensorFlow', 'vLLM', 'DeepSpeed'], compilers: ['nvcc', 'Triton'] },
    portability: { rating: 'native' },
    facility: { country: 'Finland', region: 'EU (Helsinki)', city: 'Helsinki' },
    data_residency: 'EU (GDPR)', firmness: 'firm', start_date: '2026-10-15',
    min_term_months: 12, max_term_months: 60, committed_price: 2.15, on_demand_price: 3.1,
    commercial: { minCommitmentMonths: 12, subleaseAllowed: false },
    commitment: { releaseClause: true, minGuaranteed: 0.7 },
    resilience: { slaPct: 99.95, failover: 'cross-site', powerBackup: true, score: 92 },
    sovereign: { eligibilityProfile: 'eu-qualified', dataResidencyPolicy: 'EU-only' },
    power: { committedMW: 6, curtailment: 0, certainty: 'high' },
    verification_status: 'Operationally verified', evidence_confidence: 92,
    lead_time_weeks: 4, provisioning: { onTimePct: 97 },
  }),
  listingRow(L.gccH200, U.seller2, {
    name: 'GulfGrid H200 — Abu Dhabi', provider_type: 'NVIDIA', gpu_model: 'H200 SXM', region: 'GCC',
    count: 256, node: '8x H200 SXM', interconnect: 'NVLink + InfiniBand', memory: '141 GB HBM3e',
    software: { frameworks: ['PyTorch', 'CUDA', 'TensorFlow', 'vLLM', 'DeepSpeed'], compilers: ['nvcc'] },
    portability: { rating: 'native' },
    facility: { country: 'United Arab Emirates', region: 'UAE/GCC (Abu Dhabi)', city: 'Abu Dhabi' },
    data_residency: 'UAE', firmness: 'firm', start_date: '2026-11-01',
    min_term_months: 12, max_term_months: 60, committed_price: 2.2, on_demand_price: 3.2,
    commercial: { minCommitmentMonths: 12, subleaseAllowed: false },
    commitment: { releaseClause: true, minGuaranteed: 0.75 },
    resilience: { slaPct: 99.9, failover: 'multi-region', powerBackup: true, score: 90 },
    sovereign: { eligibilityProfile: 'uae-qualified', dataResidencyPolicy: 'UAE' },
    power: { committedMW: 5, curtailment: 0, certainty: 'high' },
    verification_status: 'Capacity evidenced', evidence_confidence: 85,
    lead_time_weeks: 6, provisioning: { onTimePct: 94 },
  }),
  listingRow(L.euMi300x, U.seller1, {
    name: 'Anonymous MI300X cluster (capacity evidenced)', provider_type: 'AMD', gpu_model: 'MI300X', region: 'EU',
    count: 256, node: '8x MI300X', interconnect: 'Infinity Fabric + RoCE', memory: '192 GB HBM3',
    software: { frameworks: ['PyTorch', 'ROCm', 'vLLM', 'DeepSpeed'], compilers: ['ROCm', 'Triton'] },
    portability: { rating: 'partial' },
    facility: { country: 'Ireland', region: 'EU (Dublin)', city: 'Dublin' },
    data_residency: 'EU (GDPR)', firmness: 'firm', start_date: '2026-12-01',
    min_term_months: 12, max_term_months: 60, committed_price: 1.85, on_demand_price: 2.7,
    commercial: { minCommitmentMonths: 12, subleaseAllowed: false },
    commitment: { releaseClause: true, minGuaranteed: 0.7 },
    resilience: { slaPct: 99.9, failover: 'cross-site', powerBackup: false, score: 82 },
    sovereign: { eligibilityProfile: 'eu-qualified', dataResidencyPolicy: 'EU-only' },
    power: { committedMW: 5, curtailment: 0, certainty: 'medium' },
    verification_status: 'Capacity evidenced', evidence_confidence: 78,
    lead_time_weeks: 3, provisioning: { onTimePct: 92 },
  }),
  listingRow(L.cnAscend, U.seller1, {
    name: 'Shenhua Ascend 910C — Shenzhen', provider_type: 'Huawei', gpu_model: 'Ascend 910C', region: 'CN',
    count: 512, node: '8x Ascend 910C', interconnect: 'HCCS', memory: '64 GB HBM2e',
    software: { frameworks: ['PyTorch (CANN)', 'MindSpore', 'vLLM (partial)'], compilers: ['CANN'] },
    portability: { rating: 'port-required' },
    facility: { country: 'China', region: 'Asia (Shenzhen)', city: 'Shenzhen' },
    data_residency: 'China', firmness: 'firm', start_date: '2026-11-20',
    min_term_months: 12, max_term_months: 48, committed_price: 1.7, on_demand_price: 2.4,
    commercial: { minCommitmentMonths: 12, subleaseAllowed: false },
    commitment: { releaseClause: true, minGuaranteed: 0.65 },
    resilience: { slaPct: 99.5, failover: 'single-site', powerBackup: true, score: 72 },
    sovereign: { eligibilityProfile: 'china-route-review', dataResidencyPolicy: 'China' },
    power: { committedMW: 9, curtailment: 2, certainty: 'medium' },
    verification_status: 'Capacity evidenced', evidence_confidence: 80,
    lead_time_weeks: 8, provisioning: { onTimePct: 88 },
  }),
  listingRow(L.usMi300x, U.seller2, {
    name: 'Cascade MI300X — Oregon', provider_type: 'AMD', gpu_model: 'MI300X', region: 'US',
    count: 400, node: '8x MI300X', interconnect: 'Infinity Fabric + RoCE', memory: '192 GB HBM3',
    software: { frameworks: ['PyTorch', 'ROCm', 'vLLM', 'DeepSpeed'], compilers: ['ROCm'] },
    portability: { rating: 'partial' },
    facility: { country: 'USA', region: 'North America (Oregon)', city: 'Hillsboro' },
    data_residency: 'US', firmness: 'firm', start_date: '2026-10-01',
    min_term_months: 6, max_term_months: 60, committed_price: 1.9, on_demand_price: 2.8,
    commercial: { minCommitmentMonths: 6, subleaseAllowed: false },
    commitment: { releaseClause: false, minGuaranteed: 0.8 },
    resilience: { slaPct: 99.9, failover: 'cross-site', powerBackup: true, score: 88 },
    sovereign: { eligibilityProfile: 'us-standard', dataResidencyPolicy: 'US' },
    power: { committedMW: 8, curtailment: 1, certainty: 'high' },
    verification_status: 'Capacity evidenced', evidence_confidence: 82,
    lead_time_weeks: 2, provisioning: { onTimePct: 96 },
  }),
  listingRow(L.tpu, U.seller2, {
    name: 'Harbor Flex TPU v7 (interruptible)', provider_type: 'Google', gpu_model: 'TPU v7', region: 'GCC',
    count: 640, node: '8x TPU v7', interconnect: 'ICI', memory: '128 GB HBM',
    software: { frameworks: ['JAX', 'PyTorch (XLA)', 'TensorFlow'], compilers: ['XLA'] },
    portability: { rating: 'partial' },
    facility: { country: 'United Arab Emirates', region: 'UAE/GCC (Dubai)', city: 'Dubai' },
    data_residency: 'UAE', firmness: 'interruptible', start_date: '2026-09-25',
    min_term_months: 1, max_term_months: 36, committed_price: 2.5, on_demand_price: 2.5,
    commercial: { minCommitmentMonths: 1, subleaseAllowed: true },
    commitment: { releaseClause: false, minGuaranteed: 0 },
    resilience: { slaPct: 99.0, failover: 'single-site', powerBackup: false, score: 55 },
    sovereign: { eligibilityProfile: 'uae-qualified', dataResidencyPolicy: 'UAE' },
    power: { committedMW: 10, curtailment: 5, certainty: 'medium' },
    verification_status: 'Capacity evidenced', evidence_confidence: 70,
    lead_time_weeks: 1, provisioning: { onTimePct: 90 },
  }),
]

// --- evidence rows (fixed ids) --------------------------------------------
// evidence_items: (id, listing_id, type, uri, issuer, scope, status, issued_at)
let evSeq = 0
const ev = (listingId, type, issuer, scope, issuedAt, status = 'reviewed') =>
  [`20000000-0000-4000-8000-${String(++evSeq).padStart(12, '0')}`, listingId, type, null, issuer, scope, status, issuedAt]

const EVIDENCE = [
  // Nordic H200
  ev(L.euH200, 'capacityControl', 'Facility audit', 'Ownership + serials', '2026-08-01'),
  ev(L.euH200, 'benchmark', 'Third-party', 'H200 training + inference', '2026-08-10'),
  ev(L.euH200, 'power', 'Grid operator', '6 MW committed', '2026-07-01'),
  ev(L.euH200, 'identity', 'Sovereign Grid KYC', 'Entity verified', '2026-08-20'),
  // GulfGrid H200
  ev(L.gccH200, 'capacityControl', 'Facility audit', 'Ownership', '2026-08-15'),
  ev(L.gccH200, 'benchmark', 'Third-party', 'H200 inference', '2026-08-22'),
  ev(L.gccH200, 'power', 'UAE utility', '5 MW committed', '2026-07-20'),
  ev(L.gccH200, 'identity', 'Sovereign Grid KYC', 'Entity verified', '2026-08-12'),
  // Anonymous MI300X (identity masked — capacity + benchmark only)
  ev(L.euMi300x, 'capacityControl', 'Escrow + audit', 'Capacity control evidenced; identity masked', '2026-09-01'),
  ev(L.euMi300x, 'benchmark', 'Third-party', 'MI300X inference', '2026-09-05'),
  // Shenhua Ascend 910C — baseline route evidence present, but NO
  // euCompliantProcessing / zeroDataRetention (so the Falcon route gate is
  // CONDITIONAL -> transparently DISQUALIFIED for that transaction).
  ev(L.cnAscend, 'capacityControl', 'Facility audit', 'Ownership + serials', '2026-08-01'),
  ev(L.cnAscend, 'tradeControlDocs', 'Export-control counsel', 'Trade-control review for this class of transaction', '2026-09-01'),
  ev(L.cnAscend, 'endUse', 'Compliance', 'End-use declaration on file', '2026-09-01'),
  ev(L.cnAscend, 'remoteAccessControl', 'Security review', 'Remote-access controls documented', '2026-08-25'),
  ev(L.cnAscend, 'reviewerDecision', 'Sovereign Grid reviewer', 'Baseline route decision: conditional on transaction-specific evidence', '2026-09-10'),
  // Cascade MI300X
  ev(L.usMi300x, 'capacityControl', 'Facility audit', 'Ownership', '2026-07-01'),
  ev(L.usMi300x, 'benchmark', 'Third-party', 'MI300X training', '2026-08-01'),
  // TPU (spot)
  ev(L.tpu, 'capacityControl', 'Facility audit', 'Ownership', '2026-08-01'),
]

// --- operators/operator fee policy (demo default, src/store/MarketContext.jsx) --
const FEE_POLICY = {
  key: 'platform',
  value: JSON.stringify({
    platformFee: 0.08,
    feeBasis: 'pct',
    feePayer: 'buyer',
    splitPct: 50,
    partnerSplitPct: 0.3,
    minMarginPct: 8,
  }),
}

// --- execute the seed ------------------------------------------------------
export async function seed(pool = createPool()) {
  const opHash = await hashPassword('sg-operator-dev')
  const buyerHash = await hashPassword('sg-falcon-dev')
  const s1Hash = await hashPassword('sg-seller-dev')
  const s2Hash = await hashPassword('sg-seller2-dev')

  const users = [
    [U.operator, 'operator', 'operator@sg.local', 'SG Operator', opHash],
    [U.buyer, 'buyer', 'falcon@demo.local', 'Project Falcon (Demo Buyer)', buyerHash],
    [U.seller1, 'seller', 'seller1@demo.local', 'Nordic Vector Compute OY (demo)', s1Hash],
    [U.seller2, 'seller', 'seller2@demo.local', 'GulfGrid Data Centres PJSC (demo)', s2Hash],
  ]

  await withUser(U.operator, 'operator', async (c) => {
    // users (idempotent on fixed id). Demo accounts are pre-verified: the Wave
    // M migration (0009) also flips them via UPDATE for existing DBs, but on a
    // fresh DB seed runs AFTER migrate, so the INSERT carries email_verified
    // here to keep the golden/e2e demo path unblocked regardless of order.
    for (const [id, role, email, dn, ph] of users) {
      await c.query(
        `INSERT INTO users (id, role, email, display_name, password_hash, email_verified)
         VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT (id) DO NOTHING`,
        [id, role, email, dn, role === 'operator' ? null : ph], // operator dev login set separately below
      )
    }
    // NOTE: operator gets a known dev password (documented at top) — provision
    // it ONLY when the account has no password yet. Unconditional UPDATEs here
    // would silently restore the public dev password on every boot and wipe
    // any hash an admin rotated in production.
    await c.query(
      `UPDATE users SET password_hash = $2 WHERE id = $1 AND password_hash IS NULL`,
      [U.operator, opHash],
    )

    // listings (idempotent on fixed id)
    const lc = [
      'id', 'seller_id', 'name', 'provider_type', 'gpu_model', 'region',
      'count', 'node', 'interconnect', 'memory', 'software', 'portability',
      'facility', 'data_residency', 'firmness', 'start_date', 'min_term_months',
      'max_term_months', 'committed_price', 'on_demand_price', 'currency',
      'billing_unit', 'commercial', 'commitment', 'resilience', 'sovereign',
      'power', 'verification_status', 'evidence_confidence', 'status',
      'lead_time_weeks', 'provisioning',
    ]
    const placeholder = lc.map((_, i) => `$${i + 1}`).join(', ')
    for (const row of LISTINGS) {
      await c.query(
        `INSERT INTO listings (${lc.join(', ')}) VALUES (${placeholder})
         ON CONFLICT (id) DO NOTHING`,
        row,
      )
    }

    // evidence (idempotent on fixed id)
    for (const [id, lid, type, uri, issuer, scope, status, issuedAt] of EVIDENCE) {
      await c.query(
        `INSERT INTO evidence_items (id, listing_id, type, uri, issuer, scope, status, issued_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [id, lid, type, uri, issuer, scope, status, issuedAt],
      )
    }

    // fee policy (idempotent on fixed key) — but allow an operator to have
    // previously changed it; only insert if absent.
    await c.query(
      `INSERT INTO fee_policy (key, value, updated_by) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO NOTHING`,
      [FEE_POLICY.key, FEE_POLICY.value, U.operator],
    )
  }, pool)

  const counts = await withUser(U.operator, 'operator', async (c) => {
    const users = await c.query('SELECT count(*)::int AS n FROM users')
    const listings = await c.query('SELECT count(*)::int AS n FROM listings')
    const evidence = await c.query('SELECT count(*)::int AS n FROM evidence_items')
    return { users: users.rows[0].n, listings: listings.rows[0].n, evidence: evidence.rows[0].n }
  }, pool)

  await pool.end()
  return counts
}

// CLI entry point.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  seed()
    .then((counts) => console.log(`seed ok: ${JSON.stringify(counts)}`))
    .catch((err) => {
      console.error(err.message)
      if (process.env.DEBUG) console.error(err.stack)
      process.exitCode = 1
    })
}
