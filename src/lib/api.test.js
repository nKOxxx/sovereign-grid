// src/lib/api.test.js
// Unit tests for the fetch client (src/lib/api.js).
// Environment: node. fetch is stubbed via vi.stubGlobal so no DOM/network is used.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { apiFetch } from './api.js'

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch — success paths', () => {
  it('GETs /api/marketplace and returns the parsed body', async () => {
    const body = { listings: [{ id: 'a' }, { id: 'b' }] }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body))
    vi.stubGlobal('fetch', fetchMock)

    const data = await apiFetch('/marketplace')
    expect(data).toEqual(body)

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/marketplace')
    expect(opts.method).toBe('GET')
    expect(opts.headers['Content-Type']).toBeUndefined()
  })

  it('POSTs JSON with the right content-type and body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true })))
    await apiFetch('/calculator/quote', { method: 'POST', body: { count: 256 } })

    const [, opts] = vi.mocked(fetch).mock.calls[0]
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(opts.body)).toEqual({ count: 256 })
  })
})

describe('apiFetch — bearer token attachment', () => {
  it('adds Authorization: Bearer when a token is provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})))
    await apiFetch('/requests', { token: 'tok-123' })

    const [, opts] = vi.mocked(fetch).mock.calls[0]
    expect(opts.headers['Authorization']).toBe('Bearer tok-123')
  })

  it('omits Authorization when no token is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})))
    await apiFetch('/marketplace')
    const [, opts] = vi.mocked(fetch).mock.calls[0]
    expect(opts.headers['Authorization']).toBeUndefined()
  })
})

describe('apiFetch — HTTP error handling', () => {
  it('throws with server-provided message when the API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: 'unauthorized', message: 'Invalid credentials' } }, { status: 401 }),
      ),
    )

    await expect(apiFetch('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
      message: 'Invalid credentials',
    })
  })

  it('falls back to a generic message when no JSON error body is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 })))
    const err = await apiFetch('/requests').catch((e) => e)
    expect(err.status).toBe(500)
    expect(err.message).toMatch(/500/)
  })

  it('parses non-JSON responses (e.g. empty/204 body) as null safely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    const data = await apiFetch('/auth/logout', { method: 'POST' })
    expect(data).toBeNull()
  })
})

describe('apiFetch — network / offline handling', () => {
  it('flags network failures so screens can fall back to seed data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const err = await apiFetch('/marketplace').catch((e) => e)
    expect(err.network).toBe(true)
  })

  it('flags aborted (timed-out) requests with timeout=true', async () => {
    // Simulate an abort: the fetch rejects with an AbortError.
    const abortErr = new DOMException('The operation was aborted.', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr))
    const err = await apiFetch('/marketplace').catch((e) => e)
    expect(err.timeout).toBe(true)
  })

  it('aborts the request after the configured timeout', async () => {
    const fetchMock = vi.fn(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const err = await apiFetch('/marketplace', { timeout: 50 }).catch((e) => e)
    expect(err.timeout).toBe(true)
  })
})
