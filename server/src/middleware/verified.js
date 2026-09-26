// server/src/middleware/verified.js
// requireVerified — gate middleware for actions that need a confirmed email.
//
//   * Creating a listing (seller) and creating/accepting a deal (buyer) are the
//     gated actions: real counterparties must have a reachable, verified inbox
//     before they can transact.
//   * Operator accounts and operator actions are NOT gated (operators are
//     provisioned by an admin via SQL, not self-service registration).
//   * Uses req.user.emailVerified, which requireAuth() populates from the live
//     session lookup (auth_session_by_hash), so no extra DB round-trip and the
//     answer is always current (a user who verifies mid-session is unblocked on
//     the next request — no re-login needed).
//
// Place it AFTER requireAuth + requireRole in the route chain.

/**
 * @returns {(req, res, next) => void}
 */
export function requireVerified() {
  return function verifiedGuard(req, res, next) {
    if (req.user && req.user.emailVerified) {
      next()
      return
    }
    res.status(403).json({
      error: {
        code: 'email_unverified',
        message: 'Email verification required to perform this action',
      },
    })
  }
}
