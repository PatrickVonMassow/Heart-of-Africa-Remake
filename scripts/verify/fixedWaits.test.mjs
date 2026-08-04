import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { countFixedWaits, compareToBaseline, formatRegressions } from './fixedWaits.mjs'

describe('countFixedWaits', () => {
  it('counts literal waits of both shapes', () => {
    expect(countFixedWaits('await page.waitForTimeout(1500)')).toBe(1)
    expect(countFixedWaits('await new Promise((r) => setTimeout(r, 300))')).toBe(1)
    expect(countFixedWaits('waitForTimeout(10); setTimeout(done, 5)')).toBe(2)
  })

  it('leaves a COMPUTED delay alone — it usually derives from the app timing', () => {
    expect(countFixedWaits('await page.waitForTimeout(budgetMs)')).toBe(0)
    expect(countFixedWaits('setTimeout(resolve, frameBudget)')).toBe(0)
  })

  it('does not count condition-based waiting', () => {
    expect(countFixedWaits('await page.waitForFunction(() => window.__ready)')).toBe(0)
    expect(countFixedWaits('await page.waitForSelector(".map-label")')).toBe(0)
  })

  it('is total on missing input', () => {
    expect(countFixedWaits(null)).toBe(0)
    expect(countFixedWaits(undefined)).toBe(0)
  })
})

describe('compareToBaseline', () => {
  it('passes when every file holds its recorded count', () => {
    expect(compareToBaseline({ 'a.mjs': 3 }, { 'a.mjs': 3 }).ok).toBe(true)
  })

  it('fails when a file gains a wait, naming both numbers', () => {
    const r = compareToBaseline({ 'a.mjs': 4 }, { 'a.mjs': 3 })
    expect(r.ok).toBe(false)
    expect(r.regressions).toEqual([{ file: 'a.mjs', was: 3, now: 4 }])
  })

  it('fails on a NEW file that brings waits with it', () => {
    expect(compareToBaseline({ 'new.mjs': 1 }, {}).ok).toBe(false)
  })

  it('reports a removal so the baseline can be lowered', () => {
    const r = compareToBaseline({ 'a.mjs': 1 }, { 'a.mjs': 3 })
    expect(r.ok).toBe(true)
    expect(r.improvements).toEqual([{ file: 'a.mjs', was: 3, now: 1 }])
  })

  it('is total on missing input', () => {
    expect(compareToBaseline().ok).toBe(true)
  })
})

describe('formatRegressions', () => {
  it('is empty when nothing regressed and otherwise says what to do instead', () => {
    expect(formatRegressions([])).toBe('')
    const msg = formatRegressions([{ file: 'a.mjs', was: 1, now: 2 }])
    expect(msg).toContain('a.mjs: 1 → 2')
    expect(msg).toMatch(/BEDINGUNG|Uhr der Anwendung/)
  })
})

// THE GATE: the browser suites may not gain fixed waits. Runs in the ordinary
// unit layer, so every regression run enforces it without any hook wiring.
describe('the real verify suites', () => {
  const dir = resolve(process.cwd(), 'scripts/verify')
  const baseline = JSON.parse(readFileSync(resolve(dir, 'fixed-wait-baseline.json'), 'utf8'))

  // The detector states the pattern it looks for, so scanning itself would
  // count its own regex as two waits.
  const SELF = 'fixedWaits.mjs'
  const counts = {}
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && f !== SELF)) {
    const n = countFixedWaits(readFileSync(resolve(dir, f), 'utf8'))
    if (n) counts[f] = n
  }

  it('gain no fixed wall-clock waits', () => {
    const { regressions } = compareToBaseline(counts, baseline)
    expect(regressions, `\n${formatRegressions(regressions)}\n`).toEqual([])
  })

  it('keep the baseline honest — a removed wait must lower it', () => {
    const { improvements } = compareToBaseline(counts, baseline)
    expect(
      improvements,
      `\nWartezeiten entfernt — bitte scripts/verify/fixed-wait-baseline.json senken:\n` +
        improvements.map((i) => `  · ${i.file}: ${i.was} → ${i.now}`).join('\n'),
    ).toEqual([])
  })
})
