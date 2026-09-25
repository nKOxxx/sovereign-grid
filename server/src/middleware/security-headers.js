// server/src/middleware/security-headers.js
// Baseline header hardening for every response (SECURITY_BASELINE.md #11).
//
//   * X-Content-Type-Options: nosniff   — browsers won't MIME-sniff.
//   * X-Frame-Options: DENY             — no framing / clickjacking.
//   * Referrer-Policy: no-referrer      — never leak the API origin/referrer.
//   * Content-Security-Policy           — dual-mode:
//       - /api/* and /health (JSON): `default-src 'none'` — nothing may embed
//         or execute from this origin in a document context.
//       - SPA HTML/assets (SG_STATIC_DIR single-process deploys): a strict
//         self-hosting policy — scripts only from 'self' (no inline), styles
//         'self' + 'unsafe-inline' (Recharts/Radix inject <style> tags),
//         images/fonts 'self' + data:. frame-ancestors 'none' still applies.
//   * Cache-Control: no-store on /api/auth/* — never cache credentials/sessions.
//
// Implemented manually rather than via the `helmet` package: the set above is
// exactly the JSON-serving subset helmet would emit, with no extra dependency
// (WAVE E rule: no new deps beyond the already-present baseline).

const API_CSP = "default-src 'none'; frame-ancestors 'none'"
const SPA_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

export function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('X-Frame-Options', 'DENY')
  res.set('Referrer-Policy', 'no-referrer')
  const isApi = req.path.startsWith('/api/') || req.path === '/health'
  res.set('Content-Security-Policy', isApi ? API_CSP : SPA_CSP)
  if (req.path.startsWith('/api/auth/')) {
    res.set('Cache-Control', 'no-store')
  }
  next()
}
