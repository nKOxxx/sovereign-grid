# SECURITY_BASELINE.md — Product Template

> Copy this file into a repo root as `SECURITY_BASELINE.md` on day one. Fill the Verification Log with evidence before any ship. Traceability: each of the 18 failure classes maps to controls + a CI gate.

## 0. The 18-item traceability table

| # | Failure class | Structural control (primary) | Verification (evidence required) |
|---|---|---|---|
| 1 | Exposed database credentials | Secrets manager; app never reads creds from code/env files in repo | gitleaks clean; `SM_` audit shows runtime injection |
| 2 | Public env files | `.env*` in `.gitignore` from commit #1; example file only | `git ls-files | grep -i env` empty; gitleaks rule |
| 3 | Hardcoded API keys / secrets | Secrets manager (Doppler / AWS SM / Vault); deny-list lint for key patterns | gitleaks + trufflehog full-history scan clean |
| 4 | Weak or missing authentication | Framework auth (Auth.js/Clerk/Cognito); argon2/bcrypt; MFA-ready | AuthZ test suite: unauth request → 401 on every protected route |
| 5 | Missing server-side authorization checks | Server middleware on ALL privileged routes; deny-by-default | Test: forged client state → 403; route inventory vs middleware coverage |
| 6 | Users accessing other users' data (IDOR/cross-tenant) | Postgres Row-Level Security keyed to `auth.uid()`; ownership checks in queries | Test: user A token on user B resource → 404/403; RLS policy audit |
| 7 | Overly permissive DB read/write | Separate roles: app / migrations / admin; least privilege; no superuser | `GRANT` audit script output in Verification Log |
| 8 | Misconfigured Firebase / Supabase / S3 | Supabase: RLS on every table, default-deny policies. Firebase: rules scoped to `auth.uid()`. S3: Block Public Access at ACCOUNT level; signed URLs only | `aws s3api get-bucket-policy` + public-access config dump; Supabase `pg_policies` dump |
| 9 | Admin routes unprotected | Role gate server-side; admin on separate origin/subdomain | Test: non-admin token on admin route → 403 |
| 10 | Debug pages / dev tools in prod | Debug UIs behind build-time env flag that cannot be true in prod builds | Probe staging+prod: `/__nextjs*, /debug*, /admin/debug` → 404 |
| 11 | Build logs leaking secrets | CI secret masking on; secrets injected, never echoed; isolated build env | Sample build log grep for secret patterns |
| 12 | Verbose errors leaking stack traces | Global error handler: generic message + correlation ID; stack traces to server logs only | Curl a forced 500 → generic body only |
| 13 | Secrets in Git or git history | Convention + CI: gitleaks on PR diff AND full history; pre-commit hook | Full-history scan report |
| 14 | Secrets in frontend JavaScript | Only `*_PUBLIC_` vars in client bundle; privileged calls proxied via server routes | Extract client bundle → grep for secret patterns |
| 15 | Client-side-only security checks | Server re-validates everything; client checks are UX only | Test: tampered request bypassing client UI → 403 |
| 16 | Missing input validation | Zod (or equiv) schema validation on EVERY server input: type/length/range/format | Fuzz sample routes (bad types, oversize, negative) → clean 400s |
| 17 | SQL injection | ORM with parameterized queries only (Prisma/Drizzle); string-concat SQL banned in review | grep ban-pattern `(query|execute)\(\s*[\`"'].*\$\{` → 0 hits; ZAP scan |
| 18 | NoSQL injection | Typed drivers; never pass user input into operators (`$where`, `$ne`, `$gt`) | grep ban-pattern `\{\s*\[\s*\$` spread of req body into query → 0 hits |

## 1. Secrets
- Secrets manager from day one; runtime injection; rotation runbook (rotate within 24h of any suspicion).
- If a secret hits git history: **ROTATE FIRST, then rewrite history** (`git filter-repo`). Rotating is the fix; rewriting is hygiene.
- CI log masking verified with a canary token.

## 2. AuthN / AuthZ
- Framework auth; argon2id; MFA optional at launch, mandatory for admin.
- Deny-by-default middleware on all privileged routes; role gates server-side.
- **RLS everywhere**: `ALTER TABLE x ENABLE ROW LEVEL SECURITY;` + policy per table keyed to `auth.uid()`. Even an app-layer bug cannot leak cross-tenant rows.
- Admin surface on separate origin where feasible.

## 3. Data stores
- Supabase: RLS on every table (verify `pg_policies` — no table without a policy), no service key in client.
- Firebase: locked rules for Firestore + Storage.
- S3: account-level Block Public Access; signed URLs; no wildcard principals.
- DB roles: app (DML only) / migrations (DDL) / admin (humans). No superuser in app config.

## 4. Injection & validation
- ORM-only data access; parameterized everything; review bans string-built SQL.
- Zod schema on every handler input; reject extra fields.
- NoSQL: typed queries; never spread `req.body` into a query object.

## 5. Info disclosure
- Prod error handler: generic message + correlation ID; stack traces only in server logs.
- Debug tooling compiled out of prod builds (env flag checked at build time).
- Only public diagnostic endpoint: `/health` (no version/dependency info).

## 6. CI enforcement (GitHub Actions template)

```yaml
name: security
on: [pull_request, push]
jobs:
  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # FULL history
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
  deps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm audit --omit=dev --audit-level=high
  zap:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: ZAP baseline (staging)
        uses: zaproxy/action-baseline@v0.12.0
        with:
          target: https://staging.example.com
          fail_action: true
```

Pre-commit (local): `gitleaks protect --staged` via hook; `secretlint` optional second layer.

## 7. Pre-ship walkthrough (ASVS-condensed, ~1 hour)
1. AuthZ matrix: every route × every role → expected status. Falsify with scripted requests.
2. Tenant isolation: A-token on B-resource across 10 random IDs → all 403/404.
3. Injection spot-checks: `'" OR 1=1--`, `{"$ne": null}` into every input → no anomalous results.
4. Error probing: force failures → generic bodies, correlation IDs present.
5. Bundle audit: download JS bundles, grep for secret patterns and non-public env names.
6. Bucket/BaaS: re-run public-access and policy dumps; diff against approved config.
7. ZAP active scan on staging; triage every finding to closed/won't-fix-with-rationale.

## 8. Runtime posture
- Rate limiting (per-IP + per-account) at edge.
- Alerting: failed-auth spikes, 5xx clusters, RLS policy violations logged.
- Encrypted at rest + in transit; automated encrypted backups, restore-tested.
- Least-privilege IAM; separate prod/staging cloud accounts; 2FA on all infra consoles.

## 9. Escalation triggers (bar rises)
- Payments/PII at scale → SOC 2 Type I within ~6 months of revenue, Type II after.
- Health data → HIPAA/GDPR art. 32 assessment.
- Grid/energy/infra data (e.g., Sovereign Grid) → IEC 62443, UAE NESA/SIA controls, asset-owner coordination.
- Any third-party pentest finding → fix + retest gate before next release.

## 10. Verification Log (fill with evidence — no evidence = not done)

| Date | Item # | Evidence (link/commit/artifact) | Checked by |
|---|---|---|---|
| | | | |

## 11. Residual risk statement (always true)
This baseline closes all 18 listed classes and raises attacker cost above the automated/opportunistic level — the correct bar for launch and early enterprise deals. It does NOT make a product "unhackable": dependency 0-days, supply-chain compromise, and targeted APTs remain. Standard next rungs: annual third-party pentest, dependency auto-update discipline, incident response runbook.
