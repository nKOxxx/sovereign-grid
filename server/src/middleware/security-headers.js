// server/src/middleware/security-headers.js
// Baseline header hardening for every response (SECURITY_BASELINE.md #11).
//
//   * X-Content-Type-Options: nosniff   — browsers won't MIME-sniff.
//   * X-Frame-Options: DENY             — no framing / clickjacking.
//   * Referrer-Policy: no-referrer      — never leak the API origin/referrer.
//   * Content-Security-Policy           — this API serves JSON only, so a tight
//     `default-src 'none'` is safe and blocks inline script injection / data:
//     exfiltration. frame-ancestors 'none' reinforces X-Frame-Options.
//   * Cache-Control: no-store on /api/auth/* — never cache credentials/sessions.
//
// Implemented manually rather than via the `helmet` package: the set above is
// exactly the JSON-serving subset helmet would emit, with no extra dependency
// (WAVE E rule: no new deps beyond the already-present baseline).

export function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('X-Frame-Options', 'DENY')
  res.set('Referrer-Policy', 'no-referrer')
  res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  if (req.path.startsWith('/api/auth/')) {
    res.set('Cache-Control', 'no-store')
  }
  next()
}
