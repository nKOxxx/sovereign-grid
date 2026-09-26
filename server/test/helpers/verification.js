// server/test/helpers/verification.js
// Test helper for the Wave M account-trust bundle.
//
// New registrations are UNVERIFIED and gated before listing/deal actions. In
// dev (NODE_ENV !== 'production'), /api/auth/register logs the raw verification
// token via console.info as `VERIFY_TOKEN: <email> <token>`. This helper
// registers a user, captures that logged token, and consumes it through the
// public /api/auth/verify endpoint — exercising the exact same wire path a real
// dev would — then returns the original register response.
//
// It accepts the test file's local `api(method, path, {token, body})` helper so
// it stays consistent with each suite's harness.

/**
 * Register a user and immediately verify their email (via the captured
 * VERIFY_TOKEN console log + POST /api/auth/verify).
 *
 * @param {(method:string, path:string, opts?:{token?:string, body?:object})=>Promise<{status:number,json:any}>} api
 * @param {{email:string, password?:string, role?:string, displayName?:string}} args
 * @returns {Promise<{status:number,json:any}>} the register response
 */
export async function registerVerified(api, { email, password = 'supersecret123', role = 'buyer', displayName }) {
  const logs = []
  const origInfo = console.info
  console.info = (...args) => {
    logs.push(args.join(' '))
  }
  let reg
  try {
    reg = await api('POST', '/api/auth/register', {
      body: { email, password, role, displayName },
    })
  } finally {
    console.info = origInfo
  }

  const re = new RegExp(`VERIFY_TOKEN: ${escapeRegExp(email)} (\\S+)`)
  const hit = logs.join('\n').match(re)
  if (hit) {
    await api('POST', '/api/auth/verify', { body: { token: hit[1] } })
  }
  return reg
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
