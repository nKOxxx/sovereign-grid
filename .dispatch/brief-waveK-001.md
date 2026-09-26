# Task: Full-app dark reskin (final wave) — one coherent design across all 16 screens

## Context
Repo: Sovereign Grid. Floors: 173/173 root vitest, 130/130 server vitest (in `server/`), build ✓ — do not regress.
PARTIAL RESKIN: `FeeEngine.jsx`, `SellerOnboarding.jsx`, `ListingReview.jsx`, `ui.jsx` (inputCls/badges), `Select.jsx` are DARK and correct. The rest is still LIGHT: `src/App.jsx` (shell/nav), `Calculator.jsx`, `CapacityPassport.jsx`, `CrmAutomation.jsx`, `DealRoom.jsx`, `Eligibility.jsx`, `ListCapacity.jsx`, `Login.jsx`, `MarketIntel.jsx`, `PostDemand.jsx`. The app shell in App.jsx uses `bg-slate-50`/`bg-white` — the #1 thing a viewer notices. This is the LAST build wave; quality over speed.

## HARD RULES
1. FIRST read (in this order): `design/tokens.css`, `src/screens/FeeEngine.jsx` (gold standard), `src/screens/ui.jsx` (inputCls/badges/Field), `src/screens/wave-g.css` (dark patterns), `src/components/Select.jsx`. Mirror their exact token/class vocabulary. Do NOT invent new colors.
2. Scope: convert ALL light classes (`bg-white`, `bg-slate-*`, `text-slate-*`, `bg-sky-*`, `text-sky-*`, `bg-amber-*`, `bg-emerald-*`, `bg-rose-*`, `bg-indigo-*` + matching text/border variants) in `src/App.jsx` + the 10 screen files listed above to the dark `.sg-*` / token vocabulary. Dark canvas, `bg-elevated`/`sg-card` surfaces, single azure accent, `sg-num` on all figures/prices, borders `var(--sg-border)`.
3. **Replace every native `<select>`** in the scoped files (MarketIntel has at least one; check all) with `src/components/Select.jsx` — search first: `grep -n "<select" src/screens/*.jsx src/App.jsx`. NO native selects anywhere.
4. **Login.jsx demo-credentials card**: it currently lists buyer AND operator creds. The operator dev password was ROTATED (it 401s). Change the card to show ONLY the buyer account (`falcon@demo.local` / `sg-falcon-dev`) plus one line: "Operator console is invite-only in this demo." Do not display any operator credential.
5. **Delete `src/screens/Placeholder.jsx`** (unreferenced dead file). Confirm nothing imports it before deleting.
6. Do NOT change: any logic, routes, props, data, text content (except rule 4), or ANY file under `server/`, `e2e/`, `design/tokens.css`. Do NOT touch the LIGHT_SLOP constants inside existing test files.
7. String-based tests (RBAC asserts etc.) rely on TEXT, which you preserve — but if any vitest asserts a light CLASS, update that assertion to the dark equivalent (report which).

## Tests — widen the design law to the whole app
In `src/screens/operator-console.test.jsx` (or a new `src/design-law.test.jsx`), extend the design-guard so ALL of `src/App.jsx` + `src/screens/*.jsx` (excluding `*.test.jsx`, `Placeholder`) contain ZERO light classes and ZERO native `<select`. This must fail the build if anyone regresses.

## Definition of done
- `npm run build` ✓; `npx vitest run` in root ALL green (173+); `server/` untouched (spot-check `npx vitest run` there still 130 if you touched nothing — you shouldn't).
- No e2e, no prod contact. Orchestrator runs e2e + deploys + screenshots.
- End with EXACTLY:
ARM: DONE
SUMMARY: <one line <=200 chars>
FILES: <comma-separated>
