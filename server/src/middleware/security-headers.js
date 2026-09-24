// server/src/middleware/security-headers.js
// Baseline header hardening for every response (SECURITY_BASELINE.md #11).
//
//   * X-Content-Type-Options: nosniff        — browsers won't MIME-sniff.
//   * X-Frame-Options: DENY                  — no framing / clickjacking.
//   * Cache-Control: no-store on /api/auth/* — never cache credentials/sessions.
//   * Same-Origin CORS: not applicable. The frontend (Vite dev server on its own
//     origin) will proxy API calls in dev, so no CORS headers are issued and the
//     API refuses cross-origin preflight by default. Enable CORS explicitly only
//     if a truly separate-API-origin deployment is later required.

export function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('X-Frame-Options', 'DENY')
  if (req.path.startsWith('/api/auth/')) {
    res.set('Cache-Control', 'no-store')
  }
  next()
}
