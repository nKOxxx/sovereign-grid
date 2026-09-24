# Sovereign Grid — Delivery Phases & MVP Engineering Plan
**Fills SPEC §18.3 (empty in v0.4). Derived from §18.1 MVP scope, §22.1 open decisions, §21.1 stage gates, and the 2026-09-24 demo build (commit 07bbb6d).**

Owner: Nikola Stojanow · Draft: hub (Hermes) · 2026-09-24

---

## 0. What the demo proved (baseline for this plan)

The interactive demo (§22.2) validated the four flywheel mechanics end-to-end in browser-verified form:
two-sided marketplace with normalized matching, fee engine with margin guard, qualification layer
(eligibility + passport + human approval gates), and transaction-data flywheel (deal room → milestones →
transacted-price intel with min-observation rules).

**Reusable demo assets → MVP seed:**
| Demo asset | MVP fate |
|---|---|
| `src/lib/*.js` (market, fees, cost, passport, eligibility, deal — 66 tests) | Core domain logic; port to backend service with same test contracts |
| `src/screens/*.jsx` (11 screens) | UI spec for MVP frontend; D01–D16 become regression criteria |
| Playwright D-suite + button sweep | Regression harness from day 1 of MVP |
| Trust-rule discipline (§19: labels, caps, pre-screening language) | CI-enforceable lints (no-live-strings, demo-label checks) |
| Multi-deal wiring (audit P0×2, deliberately deferred) | **Day-1 Phase 1 requirement** once deal #2 exists |

---

## 1. Delivery phases (§18.3)

### Phase 0 — Demo & partner conversations *(done + finishing touches)*
- ✅ Interactive demo, D01–D16 verified (2026-09-24).
- ☐ Hosted URL + scripted walkthrough (Present-mode per §17.2 narrative) + one-pager.
- **Exit gate:** demo in front of ≥3 GCC counterparties / family offices; feedback + interest logged; 2+ LOI-level conversations.

### Phase 1 — Foundations *(weeks 1–4)*
Everything that must exist before a second, real deal can touch the system.
- **§22.1 decision memos (parallel, non-blocking):** legal-review process per jurisdiction (incl. China), fee range + counterparty protection period, CRM/e-sign/identity providers, payment/escrow/financing partners, passport evidence standard + reviewer authority, provider API priority, benchmark governance. One page each; owner decides; lock dates.
- Multi-deal wiring: deal rooms keyed by deal id; per-deal connection/approval state (retires the demo's single-deal scope line).
- Accounts & roles: buyer / seller / operator (§18.1) with role-scoped data access (§19.1 pricing non-disclosure).
- Persistence: Postgres for requests, listings, offers, deals, evidence, approvals, messages.
- Immutable audit log: every human approval (reviewer, scope, timestamp, expiry) — spec §10.3 made enforceable.
- **Exit gate:** staged deployment; the Falcon scenario runs end-to-end on the real backend; audit log captures the approval chain.

### Phase 2 — Broker console & live pipeline *(weeks 5–8)*
The operator stops being the database.
- Broker-assisted matching console: request → offer collection → normalization → shortlist (§18.1; demo MatchResults generalized).
- CRM + email automation with the selected provider; §13.3 approval gates enforced in code (binding/sensitive sends blocked without explicit approval).
- Evidence upload + manual review queue; passport statuses issued by authorized reviewers only (§22.1 evidence standard).
- Configurable fee policies + partner attribution per deal (§9 mechanics, now policy-driven).
- **Exit gate:** one real deal runs pipeline-to-signature-readiness in staging with real counterparties (payments in sandbox).

### Phase 3 — Transaction rails *(weeks 9–12)*
Where the flywheel starts spinning for real.
- E-signature, contracts, invoices, delivery milestones (§12.2 milestone states made stateful).
- Payment/escrow/financing via partner rails only — **no custody, ever (§18.2 exclusion; §19.1).**
- Transaction analytics + controlled exports (§14 hierarchy with live min-observation enforcement).
- Operating dashboard (§20): liquidity, commercial, delivery quality; north-star instrumentation ("verified compute value delivered" — §20.4: contracted + accepted + attributed or it doesn't count).
- **Exit gate — §21.1 stage gate:** first real contracted transaction delivered and buyer-accepted with platform attribution recorded. **The product does not advance past this gate on pipeline metrics alone.**

### Phase 4 — Corridor expansion *(post-gate)*
- Jurisdiction expansion per legal memo cadence; China corridor strictly gated by §21.1 outcome + legal review.
- Provider API inventory sync per §22.1 priority order.
- Repeat/renewal loops; financing, insurance, resale attachments (§20.2 attachment rates).

---

## 2. Engineering estimates

| Track | Team | Duration | Notes |
|---|---|---|---|
| Phases 1–3 (MVP) | 2 engineers + product owner | **12 weeks** | Conventional, defensible for partner/investor conversations |
| Phases 1–3 (MVP) | 1 engineer + hub-and-spoke AI fleet (orchestrator stdio fan-out, as proven on the demo) | **6–9 weeks** | Same machinery that built the 11-screen demo in one day; human-bound items (legal memos, evidence review, partner contracts) do not compress |

Human-bound critical path regardless of team shape: §22.1 decisions (owner), legal review (counsel), partner contracts (payments/e-sign). Engineering can start Phase 1 the moment multi-deal + auth specs are locked; decisions can trail by up to ~2 weeks without stalling code.

---

## 3. Cross-cutting rules (every phase)

1. **§21.1 discipline:** each phase must improve fill rate, cut transaction time, raise verified delivery, lift gross margin, or create defensible transaction data — otherwise it doesn't ship.
2. **§19 trust rules as CI:** linters for live-price strings, demo labels, pre-screening-only language, no-custody UI; verification ladder capped below top rung until real qualification exists.
3. **18-point security baseline from the first PR** (security-baseline skill: template day 1, gates on every PR).
4. **Hub-and-spoke governance carries over:** workers build, hub verifies by execution (never self-report), reviewer findings get triaged with written reasoning — the audit trail that caught 6 real defects in the demo is the development process.
5. **No feature without a Falcon:** the §22.2 scope test becomes the MVP backlog test — anything that neither advances a live transaction nor proves the flywheel is out.

---

## 4. Risks & controls

| Risk | Control |
|---|---|
| §22.1 decisions slip → Phase 1 stalls | Memos run parallel to code; only multi-deal + auth block week 1 |
| Evidence review is human-bound | Reviewer SLA + queue; authority defined in evidence standard memo |
| China corridor legal exposure | Hard-gated behind Phase 3 stage gate + counsel sign-off; route-specific rules already modeled in demo |
| Solo+AI compression overstates | Exit gates are behavioral (real transactions), not calendar dates; plan sells 12-week number |
| Demo code treated as production | Lib functions port with their test contracts; screens are spec, not shippable UI |
