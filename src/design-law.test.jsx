// src/design-law.test.jsx — Whole-app design guard (world-class-frontend gates).
//
// Forces EVERY presentational screen in the app onto the dark .sg-* token
// system. Scans the SOURCE of src/App.jsx + every src/screens/*.jsx (excluding
// test files — Placeholder.jsx was deleted) and asserts ZERO light-theme
// Tailwind classes and ZERO native <select> elements remain. Runs in the node
// env with plain fs + regex, so no jsdom/render needed and it reliably fails
// the build the moment anyone reintroduces a light class or a native select.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

// Every light-theme class family the dark reskin bans, across bg/text/border
// and all the accent hues plus the accent-colored range control.
const LIGHT_SLOP =
  /bg-white|bg-slate-\d|text-slate-\d|border-slate-\d|divide-slate-\d|bg-sky-\d|text-sky-\d|border-sky-\d|ring-sky-\d|bg-amber-\d|text-amber-\d|border-amber-\d|bg-emerald-\d|text-emerald-\d|border-emerald-\d|bg-rose-\d|text-rose-\d|border-rose-\d|bg-indigo-\d|text-indigo-\d|border-indigo-\d|accent-sky-\d/

function targetFiles() {
  const files = [`${ROOT}/src/App.jsx`]
  const got = readdirSync(`${ROOT}/src/screens`)
  for (const f of got) {
    if (!f.endsWith('.jsx')) continue
    if (f.endsWith('.test.jsx')) continue
    files.push(`${ROOT}/src/screens/${f}`)
  }
  return files
}

// Strip // line and /* */ block comments so doc comments (e.g. "never native
// <select>") don't trip the element/regex guards.
function bodyOf(path) {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

describe('whole-app design law (dark tokens only)', () => {
  const files = targetFiles()

  it('scans App.jsx and every non-test screen', () => {
    expect(files.length).toBeGreaterThan(1)
    for (const f of files) expect(existsSync(f)).toBe(true)
  })

  it('every screen has ZERO light-theme Tailwind classes', () => {
    const offenders = []
    for (const f of files) {
      const hits = bodyOf(f).match(LIGHT_SLOP) || []
      if (hits.length) offenders.push(`${f} -> ${hits.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })

  it('every screen has ZERO native <select> elements (custom Select only)', () => {
    const offenders = []
    for (const f of files) {
      const n = (bodyOf(f).match(/<select\b/g) || []).length
      if (n > 0) offenders.push(`${f} -> ${n} native <select>`)
    }
    expect(offenders).toEqual([])
  })

  it('the financial tell (sg-num) is present across app shell + at least one screen', () => {
    const app = bodyOf(`${ROOT}/src/App.jsx`)
    const sample = bodyOf(`${ROOT}/src/screens/MarketIntel.jsx`)
    expect(app).toContain('bg-canvas')
    expect(sample).toContain('sg-num')
  })
})
