// A unit run whose own summary names no failing test is NOT JUDGED, not red —
// at any load; a named failure is red at any load; the load is always named.
import { describe, it, expect } from 'vitest'
import {
  formatLoad,
  parseUnitTotals,
  runnerErrorSignature,
  unitAttemptsVerdict,
  unitRunVerdict,
  UNIT_RUN,
} from './pre-push-gate-core.mjs'

const passed = parseUnitTotals(' Test Files  319 passed (319)\n      Tests  9997 passed (9997)\n')
const failed = parseUnitTotals(' Test Files  1 failed | 318 passed (319)\n      Tests  2 failed | 9995 passed (9997)\n')
const SIG = '[vitest-worker]: Timeout calling "onTaskUpdate" with "[]"'
const LOADS = [
  { level: 'quiet', reasons: ['cpu 0.05'] },
  { level: 'loaded', reasons: ['cpu 0.97'] },
  { level: 'unknown', reasons: [] },
  undefined,
]

describe('unitRunVerdict — the summary decides, the load is evidence', () => {
  for (const load of LOADS) {
    const name = load?.level ?? 'unmeasured'
    it(`a named failure blocks at once (${name})`, () => {
      const v = unitRunVerdict({ ok: false, totals: failed, load })
      expect(v).toMatchObject({ kind: UNIT_RUN.red, blocks: true, rerun: false })
      expect(v.line).toContain('2 failing tests in 1 file')
      expect(v.line).toContain(formatLoad(load))
    })
    it(`a no-failure non-zero exit is NOT JUDGED and re-run (${name})`, () => {
      const v = unitRunVerdict({ ok: false, totals: passed, load, signature: SIG })
      expect(v).toMatchObject({ kind: UNIT_RUN.notJudged, blocks: false, rerun: true })
      expect(v.line).toContain(SIG)
      expect(v.line).toContain(formatLoad(load))
    })
    it(`green and unreadable name the load too (${name})`, () => {
      expect(unitRunVerdict({ ok: true, totals: passed, load }).line).toContain(formatLoad(load))
      const u = unitRunVerdict({ ok: false, totals: parseUnitTotals(''), load })
      expect(u).toMatchObject({ kind: UNIT_RUN.unreadable, blocks: true, rerun: false })
      expect(u.line).toContain(formatLoad(load))
    })
  }
  it('formatLoad names the measured level and its reasons', () => {
    expect(formatLoad({ level: 'busy', reasons: ['cpu 0.8'] })).toBe('machine busy (cpu 0.8)')
    expect(formatLoad(undefined)).toBe('machine load not measured')
  })
})

describe('unitAttemptsVerdict — the CI / gate / LARGE decision, fail-closed', () => {
  const notJudged = { ok: false, totals: passed, signature: SIG }
  const load = { level: 'quiet' }
  it('green at once is ok without a re-run', () => {
    expect(unitAttemptsVerdict([{ ok: true, totals: passed }], { load })).toMatchObject({ ok: true, rerun: false })
  })
  it('a named failure is red at once, no re-run', () => {
    expect(unitAttemptsVerdict([{ ok: false, totals: failed }], { load })).toMatchObject({ ok: false, rerun: false, kind: 'red' })
  })
  it('an unreadable summary is red at once, no re-run', () => {
    const v = unitAttemptsVerdict([{ ok: false, totals: parseUnitTotals('boom') }], { load })
    expect(v).toMatchObject({ ok: false, rerun: false, kind: 'unreadable' })
  })
  it('not judged once asks for exactly one re-run', () => {
    expect(unitAttemptsVerdict([notJudged], { load })).toMatchObject({ ok: false, rerun: true, kind: 'not-judged' })
  })
  it('not judged, then green → ok, and the first run is named', () => {
    const v = unitAttemptsVerdict([notJudged, { ok: true, totals: passed }], { load })
    expect(v).toMatchObject({ ok: true, rerun: false })
    expect(v.line).toContain('NOT JUDGED')
  })
  it('not judged, then a named failure → red', () => {
    const v = unitAttemptsVerdict([notJudged, { ok: false, totals: failed }], { load })
    expect(v).toMatchObject({ ok: false, rerun: false, kind: 'red' })
    expect(v.line).toContain('2 failing tests')
  })
  it('not judged, then unreadable → red', () => {
    expect(unitAttemptsVerdict([notJudged, { ok: false, totals: parseUnitTotals('') }], { load }))
      .toMatchObject({ ok: false, rerun: false, kind: 'unreadable' })
  })
  it('not judged TWICE → red, naming the signature', () => {
    const v = unitAttemptsVerdict([notJudged, notJudged], { load })
    expect(v).toMatchObject({ ok: false, rerun: false })
    expect(v.line).toContain('NOT JUDGED TWICE')
    expect(v.line).toContain(SIG)
    expect(v.line).toContain('machine quiet')
  })
  it('no attempt at all is red', () => {
    expect(unitAttemptsVerdict([], {})).toMatchObject({ ok: false, rerun: false })
  })
})

describe('runnerErrorSignature', () => {
  it('reads the vitest-worker line', () => {
    expect(runnerErrorSignature({ stdout: 'x\n', stderr: `Error: ${SIG}\n` })).toBe(SIG)
  })
  it('falls back to the first error after an Unhandled heading', () => {
    expect(runnerErrorSignature('⎯ Unhandled Errors ⎯\n\nTypeError: x is not a function\n')).toBe('TypeError: x is not a function')
  })
  it('null where none is found', () => {
    expect(runnerErrorSignature('all good')).toBeNull()
  })
})
