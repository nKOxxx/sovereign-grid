// src/lib/auth.js
// Token persistence + authentication helpers, backed by localStorage when
// available and a module-level in-memory store otherwise (so it is fully
// testable in the node/vitest environment, which has no DOM).
//
// Stores the session bearer token and the logged-in user profile under a
// single key. All access goes through small read/write/remove helpers that
// transparently pick the right backing store.

import { api } from './api.js'

export const TOKEN_KEY = 'sg_token'
export const USER_KEY = 'sg_user'

// In-memory fallback store, used only when localStorage is unavailable.
const mem = new Map()

const hasLocalStorage = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

function read(key) {
  if (hasLocalStorage()) {
    const v = window.localStorage.getItem(key)
    return v == null ? null : v
  }
  return mem.has(key) ? mem.get(key) : null
}

function write(key, value) {
  if (hasLocalStorage()) {
    window.localStorage.setItem(key, value)
  } else {
    mem.set(key, value)
  }
}

function remove(key) {
  if (hasLocalStorage()) {
    window.localStorage.removeItem(key)
  } else {
    mem.delete(key)
  }
}

/** Current bearer token, or null. */
export function getToken() {
  return read(TOKEN_KEY)
}

/** Persist the token + user profile. */
export function setToken(token, user = null) {
  if (token) write(TOKEN_KEY, token)
  if (user) write(USER_KEY, JSON.stringify(user))
}

/** Drop the persisted session (used by logout and explicit sign-out). */
export function clearAuth() {
  remove(TOKEN_KEY)
  remove(USER_KEY)
}

/** Currently persisted user profile (parsed), or null. */
export function getCurrentUser() {
  const raw = read(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** True when a token is present (does not verify it server-side). */
export function isAuthenticated() {
  return Boolean(getToken())
}

/**
 * Log in with email + password. On success persists token + user and returns
 * the user profile. Throws the underlying api error on failure.
 */
export async function login(email, password) {
  const { token, user } = await api.post('/auth/login', { email, password })
  setToken(token, user)
  return user
}

/**
 * Register a new buyer/seller account. On success persists the session and
 * returns the user profile.
 */
export async function register({ email, password, role, displayName }) {
  const { token, user } = await api.post('/auth/register', {
    email,
    password,
    role,
    ...(displayName ? { displayName } : {}),
  })
  setToken(token, user)
  return user
}

/**
 * Request a fresh email-verification token for an unverified account.
 * Always resolves (the server returns 200 regardless of whether the email
 * exists — no enumeration). UI shows a benign "sent" state on success.
 */
export async function resendVerification(email) {
  await api.post('/auth/resend', { email })
}

/**
 * End the server session (best-effort) and clear local credentials.
 * Never throws — local sign-out always succeeds even if the network is down.
 */
export async function logout() {
  const token = getToken()
  try {
    if (token) await api.post('/auth/logout', undefined, { token })
  } catch {
    // network/server unavailable — still clear local state
  } finally {
    clearAuth()
  }
}

/** Exposed for tests: reset the in-memory store. */
export function __resetAuth() {
  mem.clear()
}
