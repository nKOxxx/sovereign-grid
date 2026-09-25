// server/src/middleware/cors.js
// Allow-list CORS (WAVE E #2).
//
// Origins come from the CORS_ORIGINS env var (comma-separated), defaulting to
// the known frontend hosts. A request whose Origin is on the list gets the
// corresponding Access-Control-Allow-* headers (echoing that exact origin);
// any other origin gets NO CORS headers — the browser blocks the cross-origin
// read, while the request is still processed server-side (standard deny-
// behavior; CSRF protection is the allow-list itself, not a blanket refusal).
//
// OPTIONS preflights short-circuit with 204 so browsers get a clean probe; for
// unknown origins the 204 carries no Allow-Origin, so the browser rejects it.

export function createCors({ origins = [] } = {}) {
  const list = origins

  return function cors(req, res, next) {
    const origin = req.headers.origin

    if (origin && list.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin)
      res.set('Vary', 'Origin')
      res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
      res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization')
      res.set('Access-Control-Max-Age', '600')
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    next()
  }
}
