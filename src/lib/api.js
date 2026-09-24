// src/lib/api.js
// Minimal same-origin fetch client for the Sovereign Grid backend.
//
// * Base path '/api' — in dev/preview a Vite proxy forwards it to the API;
//   on the static GitHub Pages site there is no backend, so calls fail and
//   screens fall back to seed data (the repo must never white-screen).
// * Attaches a bearer token when provided.
// * Parses JSON error bodies into Error objects with status + code.
// * Enforces a sensible timeout (AbortController).
// * No dependencies. Works in node (vitest) and the browser alike.
//
// The server wraps errors as { error: { code, message } } and never leaks
// stacks; this client surfaces that message to the caller.

const BASE = '/api'
const DEFAULT_TIMEOUT_MS = 8000

/**
 * @param {string} path  path below /api, e.g. '/auth/login' or '/marketplace'
 * @param {object} [opts]
 * @param {string} [opts.method='GET']
 * @param {*}      [opts.body]  JSON-serializable payload
 * @param {string} [opts.token] bearer token
 * @param {number} [opts.timeout]  ms to wait before aborting
 * @returns {Promise<*>} parsed JSON body (or null for 204/empty)
 * @throws {Error} with .status, .code, .data on HTTP error; .timeout=true on abort
 */
export async function apiFetch(path, { method = 'GET', body, token, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null

  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller ? controller.signal : undefined,
    })
  } catch (err) {
    if (timer) clearTimeout(timer)
    if (controller && err && err.name === 'AbortError') {
      const e = new Error(`API request timed out (${method} ${path})`)
      e.timeout = true
      e.status = 0
      throw e
    }
    // Network failure (offline, proxy down, DNS) — rethrow with shape helpers.
    err.network = true
    err.status = err.status || 0
    throw err
  }

  if (timer) clearTimeout(timer)

  const ct = res.headers.get('content-type') || ''
  let data = null
  if (ct.includes('application/json')) {
    try {
      data = await res.json()
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    const message =
      (data && data.error && data.error.message) || `API request failed (${res.status})`
    const err = new Error(message)
    err.status = res.status
    err.code = data && data.error && data.error.code
    err.data = data
    throw err
  }

  return data
}

/** Convenience helpers around apiFetch. */
export const api = {
  get: (path, opts) => apiFetch(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => apiFetch(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => apiFetch(path, { ...opts, method: 'PATCH', body }),
  put: (path, body, opts) => apiFetch(path, { ...opts, method: 'PUT', body }),
}
