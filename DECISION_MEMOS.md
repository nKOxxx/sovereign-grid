# Sovereign Grid — §22.1 Decision Memos

Seven blocking decisions from spec v0.4 §22.1, each with a recommendation,
alternatives, cost of deferral, and a decide-by trigger. Decisions are
Nikola's; each is recorded here when made so the engineering trail
(commits) and the decision trail (this file) stay in one place.

**Status legend:** `OPEN` · `DECIDED yyyy-mm-dd → <chosen option>`

| # | Memo | Status | Decide by |
|---|------|--------|-----------|
| M1 | Policy governance: owners & update cadence | OPEN | Before first cross-border route goes live |
| M2 | Default fee range & counterparty protection period | OPEN | This week — blocks first contract template |
| M3 | CRM, email, e-signature, identity providers | OPEN | This week — ops tooling lead time |
| M4 | Payment, escrow, financing, insurance partners | OPEN | At first signed term sheet |
| M5 | Capacity Passport evidence standard & reviewer authority | OPEN | Before first listing marked *verified* |
| M6 | Provider API priority & inventory update obligations | OPEN | First provider onboarding (not blocking) |
| M7 | Benchmark governance & minimum transaction thresholds | OPEN | Before first quarterly intelligence report |

Suggested batching: **M2, M3, M7 this week** (unblock contracts + ops);
**M5** before first verified listing; **M1** before first cross-border
route; **M4, M6** ride on deal/provider triggers.

---

## M1 — Policy governance: accountable owners & source update cadence

**Spec anchor:** §22.1 — "Formal legal-review process, accountable policy
owners and source update cadence for each initial jurisdiction, including
China."

**Status:** OPEN

**Recommendation.** Named accountable owner per jurisdiction:
- **UAE:** internal counsel + ADGM-registered advisor
- **EU corridor:** retained counsel
- **China route:** external trade counsel on retainer (spec §13's
  route-specific stance needs a qualified human behind it)

Cadence: **quarterly scheduled review plus event-triggered updates**
(new sanctions designations, export-control changes, adequacy decisions,
freeze/thaw events such as Cabinet Decision 94/2026). Every policy change
lands as a versioned record in the eligibility engine — the audit trail
already exists in the build (wave A: immutable audit log); this decision
adds the accountable human on top.

**Alternatives considered.**
- Single global counsel — cheaper, weak on the China route.
- Pure event-driven updates — misses slow regulatory drift.

**Cost of deferral.** The eligibility engine ships with org-owned defaults
but no defensible provenance; the first counterparty legal review bounces it.

**Decision record:** _(chosen option, date, owner)_

---

## M2 — Default fee range & counterparty protection period

**Spec anchor:** §22.1 — "Default fee range and counterparty protection
period." Build reference: the shipped fee policy defaults to **8%
buyer-side, percentage basis** (`DEFAULT_PLATFORM_FEE`, `server/src/domain/fees.js`).

**Status:** OPEN

**Recommendation.**
- Band **6–10% buyer-side; start at 8%** (demo-consistent); taper to a
  **5–6% floor** on large multi-year deals.
- **Seller fee 0% at launch** — liquidity before monetization (§21.1 stage
  gates favor fill rate over margin early).
- **Protection period: 12 months, category-scoped**, for broker-attributed
  counterparties at the signed fee; renewal at **half fee** once a
  repeat-volume threshold is met.

**Alternatives considered.**
- 6-month protection — attracts poaching of attributed deals.
- 24-month — counterparty lock-in resentment.
- Flat fee vs taper — leaves money on large deals.

**Cost of deferral.** One-off negotiated pricing → margin inconsistency and
attribution disputes — precisely what §10.3's audit trail exists to prevent.

**Decision record:** _(chosen option, date, owner)_

---

## M3 — CRM, email, e-signature and identity providers

**Spec anchor:** §22.1 — "CRM, email, e-signature and identity providers."

**Status:** OPEN

**Recommendation.**
- **CRM:** HubSpot Starter or Attio (startup tier).
- **Email:** Microsoft 365 on company domain (UAE data-residency options).
- **E-signature:** DocuSign or Dropbox Sign standard tier (both
  UAE-recognized under e-transactions law).
- **Identity:** keep **first-party auth for MVP** — the scrypt/session/RBAC
  system is built and tested (wave B); operator-provisioned accounts. Defer
  Okta/Auth0/KYC vendors.

**Alternatives considered.** Hosted identity now — faster enterprise trust
but more integration surface before product-market fit.

**Cost of deferral.** Default becomes first-party auth + manual deal
tracking — workable to ~10 active deals, painful beyond.

**Decision record:** _(chosen option, date, owner)_

---

## M4 — Payment, escrow, financing and insurance partners

**Spec anchor:** §22.1 — "Payment, escrow, financing and insurance
partners."

**Status:** OPEN

**Recommendation.**
- **Escrow:** bank/law-firm escrow at MVP, release conditions mapped 1:1 to
  the deal-status transitions shipped in wave C (evidence-gated release).
- **Payments:** wire/FTP only — card rails irrelevant at these deal sizes.
- **Financing:** defer (adds compliance surface; §19 mandates human credit
  gates anyway).
- **Insurance:** defer to first cross-border deal, then contingent
  SLA/capacity cover via broker.

**Alternatives considered.** Licensed escrow provider now (cleaner, slow to
procure); fintech financing partner at launch (premature).

**Cost of deferral.** Nothing breaks until the first real contract — this is
a trigger-gated memo.

**Decision record:** _(chosen option, date, owner)_

---

## M5 — Capacity Passport evidence standard & reviewer authority

**Spec anchor:** §22.1 — "Capacity Passport evidence standard and reviewer
authority." Principle: "Evidence before confidence."

**Status:** OPEN

**Recommendation.** Three evidence classes:
1. **Capacity attestation** — signed LOI/contract or utilization telemetry sample.
2. **Benchmark proof** — vendor-neutral standard workload run, dated,
   reproducible (accelerator neutrality per the §principles table).
3. **Compliance evidence** — certs, sanctions-screen date, data-residency attestation.

Reviewer authority: **operator signs off per class; two-person rule for
China-route and sanctions-adjacent evidence** (direct implementation of §19
human gates). Freshness SLAs: telemetry 7d, benchmarks 90d, certs per
validity — the evidence-freshness model in the DB already expresses this.

**Alternatives considered.** Self-attestation — fast, but kills the
"evidence before confidence" positioning. The anti-move.

**Cost of deferral.** The Passport becomes marketing claims; disqualified
listings lose their defensible basis.

**Decision record:** _(chosen option, date, owner)_

---

## M6 — Provider API priority & inventory update obligations

**Spec anchor:** §22.1 — "Provider API priority and inventory update
obligations."

**Status:** OPEN

**Recommendation.** **No public API at MVP.** Structured template updates
(CSV/JSON) with obligations: **24h freshness for committed capacity, 7d for
indicative**. Enforcement: staleness auto-demotes listings (bookable →
indicative) via the existing evidence-freshness machinery. Wave 2:
read-only listing-push API, prioritized to the 2–3 anchor providers with
live inventory systems.

**Alternatives considered.** API-first — impressive, wrong sequencing; no
provider integrations exist to justify it yet.

**Cost of deferral.** Operator does manual updates — acceptable under ~10
providers.

**Decision record:** _(chosen option, date, owner)_

---

## M7 — Benchmark governance & minimum transaction thresholds

**Spec anchor:** §22.1 — "Benchmark governance and minimum transaction
thresholds." North star (§20.4): verified compute value **successfully
delivered** — listings, page views and unverified pipeline do not count.

**Status:** OPEN

**Recommendation.** Benchmarks derive **only from completed, verified,
attributed transactions**. **Minimum cell: n≥3** transactions per
(accelerator × region × term) before publishing a point; below that, show
range only. Methodology doc v1 owned by the operator; changes versioned and
audited — the same discipline as fee policy (the PUT + audit pattern ships
today). **No minimum deal size at launch** — the threshold that matters is
for benchmark inclusion, not market entry.

**Alternatives considered.**
- Always publish ranges — safe but less useful.
- n≥5 — statistically cleaner, starves early cells.

**Cost of deferral.** Thin-data benchmarks → credibility loss with exactly
the institutional counterparties being courted.

**Decision record:** _(chosen option, date, owner)_
