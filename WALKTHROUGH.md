# Sovereign Grid — §17.2 Demo Walkthrough (7 beats, ~10 min)

Every beat maps to a real, clickable screen of the hosted demo. Data is
illustrative (spec §17.1); public figures carry source, date, scope; nothing
shows a live market price (D11).

| # | Beat (§17.2) | Screen | What to show |
|---|--------------|--------|--------------|
| 1 | Fragmented supply & demand in one market | **Marketplace Home** (`/`) + **Market Intel** (`/intel`) | Scattered listings — regions, facilities, accelerator families, wildly inconsistent terms — against a demand pipeline of 54 pre-screened counterparties. Intel screen shows *indexed* observations, never live prices (D11). |
| 2 | Post Project Falcon demand | **Post Demand** (`/post-demand`) | Structured request: 256× H200, 24 months, EU+UAE residency, workload fields normalized at entry. |
| 3 | Normalized matches; disqualify an attractive offer | **Match Results** (`/matches`) → **Eligibility** (`/eligibility`) | All quotes normalized to comparable units; one otherwise-attractive offer is disqualified by route-specific policy conditions (D15 — no blanket geography bans). Open its eligibility case: rules, evidence, human approval trail. |
| 4 | Compare commercial structures | **Calculator** (`/calculator`) | Five-year TCO across structures (committed vs on-demand mix, term, residency premium). Change inputs live. |
| 5 | Platform fee → marketplace economics | **Fee Engine** (`/fees`) | Move the configurable fee; marketplace economics and partner attribution update. Fee range + protection period are §22.1 owner decisions. |
| 6 | Buyer–seller connection | **Deal Room** (`/dealroom`) | Connection approval, participants & permissions, selected offer, negotiation state, documents checklist, tasks, message thread. Payments shown as **status only** (no custody). |
| 7 | Delivery → verified market observation | **Market Intel** (`/intel`) + **Capacity Passport** (`/passport`) | A delivered deal produces a dated, evidence-specific observation that feeds the future index. Passport shows the accelerator compatibility / provenance / portability chain (D16). |

Also on the tour if asked: `/list-capacity` (seller onboarding),
`/crm` (broker-assisted CRM automation).

**Demo data (§17.1):** sellers, offers, scores and prices are explicitly
illustrative. Public figures are sourced and dated. No confidential pipeline
data appears un-anonymized.
