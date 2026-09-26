# Task: Seller onboarding end-to-end (backend + minimal UI + tests)

## Context
Repo: Sovereign Grid — GPU compute marketplace, pilot-complete, 153/153 vitest · 106/106 server · 26/26 e2e, all green. Do not break these floors.
Stack: React 19 + Vite + Tailwind v4 frontend (`src/`), Express + Postgres backend (`server/`), custom Select component (`src/components/Select.jsx`) already exists.

## HARD RULES
1. **Design law:** ALL new UI must use the house design system: read `design/tokens.css` and study `src/screens/FeeEngine.jsx` + `src/screens/wave-g.css` for the pattern. Use ONLY the `.sg-*` token classes (`sg-card`, `sg-btn sg-btn--primary`, `sg-num`, `sg-display`, text classes `text-text-1..4`) and dark tokens (canvas `#08090a` family, single azure accent). ZERO native `<select>` (use `src/components/Select.jsx`), ZERO light-theme Tailwind classes (`bg-white`, `text-slate-*`, `bg-amber-*`, `emerald-*`, `rose-*`, `sky-*`). Guard tests exist and will fail otherwise: `src/screens/operator-console.test.jsx` pattern.
2. **Security baseline:** never store raw passwords; reuse existing auth/session code (`server/src/auth/sessions.js`, `server/src/routes/auth.js` register/login routes already exist — DO NOT rewrite them, reuse them). No new npm deps without justification in summary.
3. Do not modify: `server/src/routes/requests.js` (just shipped hygiene route), `e2e/golden_live.py`, `server/test/wave_c.test.js` (golden recipe), `design/tokens.css`.
4. Backend: follow existing route patterns with `requireRole('seller')` guards; RLS assumed as in existing routes; validate inputs; return typed errors like existing routes.
5. e2e scripts live in `e2e/verify_demo.py` — do not weaken existing checks; add yours additively if needed.

## Task
Build **seller onboarding, end-to-end**:

A) **Frontend — `src/screens/SellerOnboarding.jsx`** (+ route wiring in `src/App.jsx`, nav link "Sell compute" for logged-out/buyer):
   - Register-or-login form for sellers (reuse `/api/auth/register` + `/api/auth/login`; role handling must match existing auth flow — inspect how role is set at registration).
   - After auth, "Create listing" form: name, region, GPU type (custom Select from existing GPU vocabulary in `src/data/seed.js` sellerListings), hourly price ($/accel-hr, `sg-num` display), availability hours/week, contact-less description.
   - Submit → `POST /api/listings` (exists, `requireRole('seller')`) with the exact payload shape the route expects (READ `server/src/routes/listings.js` first).
   - On success: confirmation state with listing summary; link "View marketplace" → home.

B) **Integration test** (`server/test/seller_onboarding.test.js`, follow existing suite style in `server/test/api.test.js`):
   - register seller → login → POST listing → GET listings shows it (expect 200s, assert fields round-trip).
   - negative: unauthenticated POST /api/listings → 401/403; buyer-token POST → 403.
   - clean up created rows (like existing tests) so prod DB stays pristine.

C) **Frontend test** (`src/screens/seller-onboarding.test.jsx`, pattern: `src/screens/operator-console.test.jsx` static render + design-guard regex from that file):
   - renders register/login + listing form; contains `role="combobox"` for GPU select; ZERO light-theme classes (reuse the LIGHT_SLOP regex approach); zero native `<select`.

## Definition of done
- `npm run build` ✓, `npx vitest run` all pass (153 + your new ones), `server` suite `node --test server/test/` all pass (106 + yours).
- Do NOT run e2e or touch prod; orchestrator handles deploy + e2e + golden replay.
- End your final message with EXACTLY these three lines:
ARM: DONE
SUMMARY: <one line, <=200 chars, what you shipped>
FILES: <comma-separated list of files you created/modified>
