// server/src/middleware/rate-limit.js
// Tiny in-memory fixed-window rate limiter, keyed by client IP.
//
// Used to throttle login attempts (10/min/IP) and blunt credential stuffing /
// password spraying. In-memory by design: stateless across restarts, no shared
// store required at Phase 1 scale, and per-process so it resets naturally on
// deploy. (A distributed store is a later-phase upgrade if the API is ever
// served by multiple instances.)
//
//   createRateLimiter({ limit: 10, windowMs: 60_000 })
//     -> { middleware, reset, check }
//
// The middleware sets `res.set('Retry-After')` and responds 429 with a generic
// message when the limit is exceeded.

export function createRateLimiter({ limit = 10, windowMs = 60_000 } = {}) {
  const buckets = new Map() // ip -> { count, resetAt }

  function prune(now) {
    for (const [ip, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(ip)
    }
  }

  /**
   * @param {string} ip
   * @returns {boolean} true if the request is allowed (and counted)
   */
  function check(ip) {
    const now = Date.now()
    prune(now)
    const b = buckets.get(ip)
    if (!b || b.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + windowMs })
      return true
    }
    if (b.count >= limit) return false
    b.count += 1
    return true
  }

  function reset() {
    buckets.clear()
  }

  const middleware = (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    if (!check(ip)) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)))
      res.status(429).json({ error: { code: 'rate_limited', message: 'Too many attempts, slow down' } })
      return
    }
    next()
  }

  return { middleware, check, reset }
}
