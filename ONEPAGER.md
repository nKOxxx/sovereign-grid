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
- Interactive demo v0.4 live: 11 screens, 66 frontend tests, 26 browser
  checks — https://nkoxxx.github.io/sovereign-grid/
- Backend wave A+B landed: Postgres schema + RLS + immutable audit log,
  scrypt-salted sessions, rate-limited auth, full request/listing/deal/
  approval API — 64/64 server tests.
- Next: staged deploy of the API behind the demo; §22.1 owner decisions
  (fee range, protection period) open with ~2 weeks of slack.
