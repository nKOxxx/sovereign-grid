# Sovereign Grid — One-Pager

**The structured marketplace for sovereign-scale GPU compute.**
ADGM-based venue where verified capacity providers and compute buyers
transact with normalized quotes, evidence-backed eligibility, and
institutional controls.

## Problem
GPU capacity trades over email and PDFs: opaque pricing, unverifiable
hardware claims, residency and trade-control exposure, no audit trail.
Buyers can't compare offers on equal units; sellers can't reach demand
beyond their rolodex.

## Product
- **Structured requests & listings** — demand and capacity enter as
  normalized data, not attachments (256× H200 / 24 mo style specs).
- **Matching with disqualification** — quotes normalized to comparable
  units; route-specific eligibility applies evidence and disclosure
  controls, not blanket geography exclusions.
- **Five-year calculator & configurable fee engine** — commercial
  structures compared like-for-like; platform fee and partner attribution
  are policy, not guesswork.
- **Capacity Passport** — accelerator compatibility, framework/compiler
  support, benchmark provenance, portability, migration effort,
  trade-control eligibility.
- **Deal Room & CRM automation** — connection approvals, documents,
  tasks, messages; contract/invoice/milestone status tracking. No custody
  of funds; not an exchange.

## Trust by construction
Row-level security with deny-by-default tenancy; immutable approval audit
log; security-definer helpers with pinned search paths; public marketplace
views expose a safe column whitelist only. **Never a live market price** —
observations are dated, evidence-specific, and feed an index.

## Status (Sept 2026)
- **Live platform: https://sovereign-grid-o707.onrender.com** — 16 screens,
  structured marketplace end-to-end: post demand → scored matches with
  disqualification reasons → **buyer offer acceptance** → deal room with
  operator lifecycle; seller onboarding with operator review gate; fee
  engine + five-year calculator; capacity passport; market intel.
- Institutional controls in code: RLS deny-by-default tenancy, immutable
  audit log on every approval and status transition, evidence-backed
  eligibility, security-definer pinned read paths.
- **313 automated checks green** (166 frontend · 121 API/integration ·
  26 browser end-to-end) + 6/6 live production golden-path replay.
- Track record: built and deployed in 2 days by a 1-engineer +
  orchestrator/worker AI fleet (see DELIVERY_PLAN §2 fleet projection).
- Backend wave A+B landed: Postgres schema + RLS + immutable audit log,
  scrypt-salted sessions, rate-limited auth, full request/listing/deal/
  approval API — 64/64 server tests.
- Next: staged deploy of the API behind the demo; §22.1 owner decisions
  (fee range, protection period) open with ~2 weeks of slack.
