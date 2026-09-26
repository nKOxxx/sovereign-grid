// server/src/auth/verification.js
// One-time-token issuance for email verification + password reset.
//
// Every token is random (base64url) and stored BOTH as the raw value (needed
// only for the operator hand-off flow — see 0009_auth_trust.sql and the route
// comments) and as its sha256 (what the verify/reset endpoints actually compare
// against, so a leaked DB row is not itself a usable credential).
//
// NO SMTP: we never send real email. The raw token is surfaced either to the
// dev console (NODE_ENV !== 'production', prefix VERIFY_TOKEN:/RESET_TOKEN:)
// or to operators via /api/operator/verifications reveal. See auth.js and
// routes/operator.js for the full hand-off story.
//
// TTLs: 24h for registration verification, 30min for password reset.

import { createHash, randomBytes } from 'node:crypto'

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000
export const RESET_TTL_MS = 30 * 60 * 1000

/** sha256 hex of a value — how a presented token is compared. */
export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

/** A fresh unguessable one-time token. */
export function newVerificationToken() {
  return randomBytes(24).toString('base64url')
}

/** True when real email delivery would be inappropriate (i.e. not prod). */
function devLog(purpose) {
  return process.env.NODE_ENV !== 'production'
}

/**
 * Surface a freshly-issued token. In dev it is logged with a clear prefix so a
 * developer can paste it into /api/auth/verify or /api/auth/reset. In
 * production nothing is logged here — the operator reveal flow is the channel.
 *
 * TODO(M) when SMTP is wired up: replace this entire mechanism (console log +
 * operator hand-off) with real email delivery, then drop token_raw from 0009.
 *
 * @param {string} email   the account the token belongs to
 * @param {string} token   the raw one-time token
 * @param {'verify'|'reset'} purpose
 */
export function surfaceVerificationToken(email, token, purpose = 'verify') {
  if (!devLog(purpose)) return
  const prefix = purpose === 'reset' ? 'RESET_TOKEN:' : 'VERIFY_TOKEN:'
  console.info(`${prefix} ${email} ${token}`)
}
