# Market-signal sources — status & runbook (2026-09-26)

House law: **never a live market price** — every row in `market_observations`
is a dated, evidence-specific observation; the Intel screen aggregates by
level (Indicative / Quoted / Transacted) with a minimum-observation gate.

## Live now

| Source | Level | Method | Cadence | Status |
|---|---|---|---|---|
| **vast.ai** bundles API (`console.vast.ai/api/v0/bundles/`) | Indicative | `POST /api/intel/ingest/vast` (operator) | cron `sg-vast-ingest` every 6h | ✅ LIVE — first rows in prod 2026-09-26 |
| **Azure Retail Prices** (`prices.azure.com/api/retail/prices`) | Indicative | `POST /api/intel/ingest/azure` (operator) | cron `sg-vast-ingest` every 6h (both sources) | ✅ LIVE — 211 rows in prod 2026-09-27 |
| Curated manual entry | Quoted / Transacted | `POST /api/intel/observations` (operator) | as observed | ✅ LIVE |

Notes on vast.ai: public, no auth. Datacenter allowlist only (H100/H200/H800/
A100/A800/MI300X/MI325X/L40S/B200/GB200). Spot-market churn is real: most
offers rotate hourly (rented inventory replaced under new ids) — expected
pattern is `inserted ≈ N, updated ≈ few` per run; stable ids are the minority.
This is acceptable index semantics at Indicative level (churn ≈ availability
weighting). Aggregation by family (0008 taxonomy: H100/A100/H200/B200/GB200/
L40S/MI300X/TPU/Ascend) keeps cells meaningful.

Notes on Azure: public, no auth. The route issues one small query PER SKU in
`AZURE_GPU_COUNTS` (intel.js) — a **docs-verified** map of SKU → GPU count
(ND96isr H100/H200/MI300X = 8; NC40ads H100 = 1; NC80adis H100 = 2; NC A100 v4
24/48/96ads = 1/2/4; verified against Microsoft Learn accelerators tables
2026-09-27). Only Dedicated Linux PAYG rows in USD are priced (Consumption,
no Windows/Spot/Low Priority/DevTest/Reservation). Per-VM retail price is
divided by the verified GPU count — an unknown SKU is SKIPPED, never priced
(house rule: no guessed per-GPU math). Dedupe: source_ref =
`sku:meter:region:type`. Adding a SKU requires a fresh docs verification.

## Verified reachable, not yet ingested (next candidates)

1. **Azure Retail Prices API** — `prices.azure.com/api/retail/prices`
   (public, no auth). VERIFIED 200 with 307 GPU VM prices (e.g. NCC40ads_H100_v5
   $8.90/hr westeurope). Filter `serviceName eq 'Virtual Machines'` + NC/ND
   SKUs; family from armSkuName; region from armRegionName; price is per-VM
   ÷ gpu_count. Map level=Indicative, source='azure'.
2. **AWS bulk pricing index** — `pricing.us-east-1.amazonaws.com/offers/v1.0/aws/`
   (public S3). VERIFIED index reachable. Heavier: per-region CSV/JSON per SKU
   class; build a P5/P4e/p5 extractor when needed. Same evidence law as Azure:
   SKU → GPU count must be verified from AWS docs before any division; unknown
   SKUs are skipped, never priced.
3. **Tensordock** — old marketplace endpoint 404s; check their current API or
   scrape-lite before relying on it. NOT verified.

## Signals that need humans (the real moat)

- **Quoted level**: partner sellers' offers with validity windows → operator
  entry (or future seller-portal submission + review).
- **Transacted level**: deals closed on the platform (auto-observe on status→
  `contracted`, anonymized/aggregated only — per SPEC §14 no per-party leak).
- Volume signals: requests-per-region/GPU from the platform's own traffic.

## Operations

- Recurring ingest: Hermes cron `sg-vast-ingest` (job e3d3ce8941ca, 0 */6 * * *),
  script `~/.hermes/scripts/sg_ingest.sh` (mints operator session, calls the
  endpoint, prints the ingest summary).
- Manual: mint op token via `scripts/op_session.mjs`, then
  `curl -X POST $BASE/api/intel/ingest/vast -H "Authorization: Bearer $TOKEN"`.
- Family taxonomy change = 3 places in lockstep (`src/lib/deal.js`,
  `server/src/routes/intel.js`, SQL helper) + additive migration if the SQL
  fn was already applied (CREATE OR REPLACE cannot rename params — keep 0007's
  parameter name `accelerator`).
