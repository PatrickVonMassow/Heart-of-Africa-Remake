// A unit run whose own summary names no failing test is NOT JUDGED, not red —
// at any load; a named failure is red at any load; the load is always named.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  decide,
  formatLoad,
  formatVerdict,
  runGate,
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
  it('exit 0 beside a named failure is RED, not green', () => {
    const v = unitRunVerdict({ ok: true, totals: failed, load: { level: 'quiet' } })
    expect(v).toMatchObject({ kind: UNIT_RUN.red, blocks: true, rerun: false })
  })
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
  it('exit 0 beside a named failure is red at once (the CI wrapper exits by this ok)', () => {
    expect(unitAttemptsVerdict([{ ok: true, totals: failed }], { load })).toMatchObject({ ok: false, rerun: false, kind: 'red' })
  })
  it('not judged, then a re-run with exit 0 but a named failure → red', () => {
    const v = unitAttemptsVerdict([notJudged, { ok: true, totals: failed }], { load })
    expect(v).toMatchObject({ ok: false, rerun: false, kind: 'red' })
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

describe('runGate — the local push gate applies the same rule at any load', () => {
  const totalsFor = { passed, failed }
  const gate = (outcomes, kinds, level) => {
    const calls = []
    let i = 0
    let last = kinds[0]
    const results = runGate(['unit'], (step) => {
      calls.push(step)
      last = kinds[i]
      return outcomes[i++]
    }, {
      readLoad: () => ({ level, reasons: [`probe says ${level}`] }),
      inspectUnit: () => ({ totals: last === 'unreadable' ? parseUnitTotals('') : totalsFor[last], signature: SIG }),
    })
    const verdict = decide(results, null)
    return { calls, results, verdict, text: formatVerdict(verdict, { reason: 'main' }) }
  }
  for (const level of ['quiet', 'loaded']) {
    it(`a named failure blocks with no re-run (${level})`, () => {
      const r = gate([false], ['failed'], level)
      expect(r.calls).toHaveLength(1)
      expect(r.verdict.blocked).toBe(true)
      expect(r.text).toContain(`machine ${level}`)
    })
    it(`not judged, then green → pushes, load named (${level})`, () => {
      const r = gate([false, true], ['passed', 'passed'], level)
      expect(r.calls).toHaveLength(2)
      expect(r.verdict.blocked).toBe(false)
      expect(r.text).toContain('NOT JUDGED')
      expect(r.text).toContain(`machine ${level}`)
    })
    it(`not judged twice blocks, naming the signature (${level})`, () => {
      const r = gate([false, false], ['passed', 'passed'], level)
      expect(r.verdict.blocked).toBe(true)
      expect(r.text).toContain('NOT JUDGED TWICE')
      expect(r.text).toContain(SIG)
      expect(r.text).toContain(`machine ${level}`)
    })
    it(`exit 0 beside a named failure blocks (${level})`, () => {
      const r = gate([true], ['failed'], level)
      expect(r.calls).toHaveLength(1)
      expect(r.verdict.blocked).toBe(true)
      expect(r.text).toContain(`machine ${level}`)
    })
    it(`not judged, then exit 0 beside a named failure blocks (${level})`, () => {
      const r = gate([false, true], ['passed', 'failed'], level)
      expect(r.calls).toHaveLength(2)
      expect(r.verdict.blocked).toBe(true)
    })
    it(`a green unit names the load too (${level})`, () => {
      expect(gate([true], ['passed'], level).text).toContain(`machine ${level}`)
    })
  }
  for (const level of ['quiet', 'busy', 'unknown']) {
    it(`an unreadable red blocks at once, no load retry (${level})`, () => {
      const r = gate([false, true], ['unreadable', 'passed'], level)
      expect(r.calls).toHaveLength(1)
      expect(r.verdict.blocked).toBe(true)
      expect(r.text).toContain('could not be read')
      expect(r.text).toContain(`machine ${level}`)
    })
  }
})

describe('the LARGE runner and CI judge the unit stage by the same verdict', () => {
  const read = (p) => readFileSync(resolve(REPO_ROOT, p), 'utf8')
  it('run-all.mjs re-runs a not-judged unit stage before skipping the browser suites', () => {
    const src = read('scripts/verify/run-all.mjs')
    const stage = src.slice(src.indexOf("console.log('# unit + component tests"), src.indexOf('skipping the browser suites'))
    expect(stage).toContain('unitAttemptsVerdict(attempts')
    expect(stage).toContain('if (!unitVerdict.rerun) break')
    expect(stage).toContain('const unitOk = unitVerdict.ok')
  })
  it('the CI shard wrapper loops on the same verdict and exits by it', () => {
    const src = read('scripts/ci-unit-shard.mjs')
    expect(src).toContain('unitAttemptsVerdict(attempts)')
    // ok and the parsed summary both reach the verdict, so exit 0 beside a named
    // failure is judged red (tested on unitAttemptsVerdict above).
    expect(src).toContain('attempts.push({ ok: out.ok, totals: parseUnitTotals(out)')
    expect(src).toContain('if (!v.rerun) break')
    expect(src).toContain('process.exit(v.ok ? 0 : 1)')
  })
})
