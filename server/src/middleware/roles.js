// server/src/middleware/roles.js
// Express-compatible role guard middleware. Pure functions — no HTTP coupling,
// unit-testable without a server. The real auth hook is a wave-B deliverable;
// this wave relies on req.user = { id, role } being populated upstream.
//
// Deny by default:
//   * missing/invalid req.user      -> 401
//   * req.user present but role not allowed -> 403
//   * allowed role                  -> next()
//
// requireRole('any') accepts any authenticated user (only the 401 check).

/**
 * @param {'any'|string|string[]} required - 'operator', 'any', or an array of roles
 * @returns {(req, res, next) => void}
 */
export function requireRole(required) {
  const any = required === 'any'
  const allowed = Array.isArray(required) ? required : [required]

  return function roleGuard(req, res, next) {
    const { user } = req || {}
    if (!user || !user.id) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } })
      return
    }
    if (any || allowed.includes(user.role)) {
      next()
      return
    }
    res.status(403).json({ error: { code: 'forbidden', message: 'Insufficient role' } })
  }
}
