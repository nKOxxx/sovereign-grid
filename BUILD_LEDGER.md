# Sovereign Grid Demo — Build Ledger (2026-09-24)

Spec: Sovereign_Grid_Product_Specification_v0.4 (doc_3a841a1f5968, authoritative).
Scope per SPEC §22.2: interactive demo of Sections 16–17, Project Falcon scenario, acceptance D01–D16.

## Execution — first production fan-out of ~/hyper/orchestrator
- Hub: Hermes (glm-4.6) — scaffold, briefs, verification, triage, commit.
- Builder: DeepSeek-V4-Flash (hyper-deepseek) via orchestrator `dispatch-stdio` — Waves 1–3.
- Reviewer: MiniMax-M2.7 (hyper-minimax) via orchestrator `dispatch-stdio` — adversarial spec-compliance audit.

| Run | Task | Transport | Result |
|---|---|---|---|
| 1 | sg-wave1-001 (seed, market, cost, home/post/list/match) | stdio, attempts=2 (timeout→auto-resume) | 20/20 tests |
| 2 | sg-wave2-001 (calculator, fee engine, eligibility, passport) | stdio, attempts=1 | 42/42 |
| 3 | sg-wave3-001 (deal room, CRM, intel + §8.2 leftovers) | stdio, attempts=1 | 63/63 |
| 4 | sg-mm-audit-001 (D01–D16 + §19 adversarial audit) | stdio, attempts=1 | 2×P0, 4×P1, 5×P2, all file:line verified |

## Verification (hub-executed, never self-report)
- Unit: 66/66 (incl. hub-authored payout-floor regression tests).
- Browser: Playwright 26/26 — all 11 screens, D01–D16, zero console errors.
- Dead-button sweep: 16 clicks / 11 routes, zero JS errors.
- Mobile 390px: no horizontal clipping on key screens.
- Build: vite production exit 0; lint 0 errors.

## Audit triage (governance: hub grades the reviewer)
- ACCEPTED+FIXED: sellerPayout negative-value hole (floor at 0 + 3 regression tests);
  gcc-h200 entityVerified claim without identity evidence (evidence item added);
  passport coverage denominator → applicable sections (listing-declarable, default all-7);
  ConnectionGate pending-state demo badge; intel hidden-cell summary;
  VerifiedPill null guard; "Live economics" → "Updated economics" (§19 zero-tolerance, hub override).
- REJECTED (documented): P0×2 hardcoded deal room (latent only; single-deal demo per §22.2 —
  multi-deal wiring does not advance Falcon); GCC zero-retention hard-filter (pipeline gives
  compliance to eligibility engine by design — GCC-as-Conditional is the D08 exemplar);
  eligibility dead-default (intentional defensive code, tested).

## Known scope lines
- Single-deal demo: deal room always renders the Falcon × Nordic deal (spec-scoped).
- Test files 6; no e2e framework in repo (hub drives Playwright externally).

## Wave G2 — Fee Engine UI (2026-09-25)
| wave | worker | transport | tests | e2e |
|---|---|---|---|---|
| sg-p1-waveG2-001 | DeepSeek V4-Flash (hyper-deepseek), attempts=1 | stdio (`scripts/dispatch-stdio.sh`) | 150/150 (+11) | 26/26 (local + D12 clean) |
Deliverables: FeeVisualizations.jsx (fee-sensitivity curve 0–20% via real computeFees/computeCalculator, fee-flow waterfall, §22.1 partner split), fee-visualizations.css (SG dark), 11 vitest tests; FeeEngine.jsx wiring preserved (slider/RBAC/testids). Deployed: 526a331 → Render live.

## Hygiene wave (2026-09-25 eve)
| item | result |
|---|---|
| Demo-cleanup route | DELETE /api/requests/:id (operator-only, offers purged, deal-tied → 409); server 106/106; golden_live.py probe: 6/6 live vs prod (self-cleaned), local + Render |
| Clean URL | Render subdomain immutable; successor service blocked by Render API 500s on POST /v1/services (their outage); retry later or custom domain |
Deployed: 4ddd831 + docs → Render live.

## Design pass (2026-09-25 night) — b354e19
Fixes the G2 miss: Fee Engine shipped on default light styling inside the dark app.
- Root causes: design/tokens.css v1 existed but FeeEngine predated it; index.html loaded no webfonts (system-font fallback app-wide); 4 native selects; default Recharts gridlines.
- Applied: full token reskin (canvas/surface/text ladders, single azure accent), custom Select on all 4 (added disabled prop), sg-num on every figure, gridlines rgba(255,255,255,.06), Inter+JetBrains Mono self-hosted (Fontsource, CSP-clean).
- Gates: 153/153 vitest (3 new design-guard tests: zero native selects, zero light-theme classes, sg-num/sg-card/sg-display present), 26/26 e2e, fonts.check true, body bg #0a0a0b, 0 console errors.
- Rule going forward: world-class-frontend skill loads on ANY Sovereign Grid UI change; new screens render through .sg-* tokens only.

## Successor service cutover (2026-09-26 morning) — clean URL solved
- Render create-endpoint recovered (400 validation ≠ 500 outage). Recipe from DEPLOY.md executed.
- Renamed old svc → `sovereign-grid-legacy`; created successor (docker/free/oregon, same repo+DB,
  fresh SESSION_SECRET — old secret retired, closes item 3). Name collision forced suffix:
  primary = https://sovereign-grid-o707.onrender.com (immutable suffix).
- Verified vs new prod: golden 6/6, e2e 26/26, /api/health 200 on 1bccad6.
- rotate_render_db.sh repointed to new SID/URL; `check` green (29 days left); cron sg_watch.sh inherits.
- Legacy zzxu left running as fallback during burn-in; pause/delete after 24-48h.

## Wave H — seller onboarding (2026-09-26, worker sg-p1-waveH-001, 1 attempt)
- /sell: register/login → create listing → POST /api/listings; nav for anon/buyer. Design law held (custom Select, no light classes, own LIGHT_SLOP guard).
- Committed inside f0112b5 (swept by infra commit — lesson: surgical git add on concurrent worker output).
- Floors: 159/159 root vitest, 109/109 server, build ✓; live in o707 prod bundle (verified).

## Infra — successor service cutover (2026-09-26)
- Primary https://sovereign-grid-o707.onrender.com (svc srv-darmnvrncjis73e9c8jg); zzxu = legacy fallback (pause after burn-in). SESSION_SECRET rotated. Watchdog/rotate repointed. golden 6/6 + e2e 26/26 vs new prod.

## Wave I — listing review gate (2026-09-26, worker sg-p1-waveI-001, 1 attempt)
- Integrity hole closed: POST /api/listings forces status='pending' (zod strips client status; DB DEFAULT 'pending' in 0005). PATCH /api/listings/:id/status operator-only (401/403/404 tested); GET ?status=pending operator-only queue. Transitions audited via existing audit_triggered_row trigger. Verified: matcher (0003) + marketplace view (0002) already active-only → pending structurally invisible.
- Operator UI: /review queue (approve/reject, dark tokens). Floors after: 166/166 root vitest (+7), 121/121 server (+12), build ✓; deployed ab1c209 live; golden 6/6 + e2e 26/26 vs prod post-deploy.
