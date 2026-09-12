import { describe, expect, it } from 'vitest'
import { changeRelatedness, checkFromName, classifyAgainstBaseline } from './baseline-classify-core.mjs'
import { baselineReport, distinctReds, formatOwnershipVerdict, redOwnership, redRequestTitle, wantsBaseline } from './red-ownership-core.mjs'

const check = checkFromName('the ground edge is dark')
const title = redRequestTitle('settings', check.name)
const reportFor = (verdict) => baselineReport({ suite: 'settings', backend: 'webgl',
  baseline: 'a'.repeat(40), head: 'b'.repeat(40), classified: [{ check: check.name, key: check.key, verdict }], logs: [] })
const decide = (report, filed = [title]) => redOwnership({ suite: 'settings', backend: 'webgl', failed: [check], report, filed })

describe('baseline evidence owns a red', () => {
  it('automatically classifies LARGE; smaller runs retain opt-in', () => {
    expect(wantsBaseline({ isLargeEquivalent: true })).toBe(true)
    expect(wantsBaseline({ baseline: true })).toBe(true)
    expect(wantsBaseline({ env: { VERIFY_BASELINE: '1' } })).toBe(true)
    expect(wantsBaseline({})).toBe(false)
  })

  it('charges a disjoint pre-existing check and does not hold the point', () => {
    expect(changeRelatedness({ checks: [check], changedFiles: ['src/children/tap.ts'] })[0].related).toBe(false)
    const classified = classifyAgainstBaseline({ currentFailed: [check], baselineFailed: [check], baselineChecks: [check] })
    const rows = decide({ ...reportFor('pre-existing'), classified })
    expect(rows[0].elsewhere).toBe(true)
    expect(formatOwnershipVerdict({ rows })).toContain('POINT REDS DO NOT HOLD — charged elsewhere:')
  })

  it.each(['real-regression', 'baseline-flaky', 'baseline-died', 'inconclusive'])('holds %s even with a disjoint diff and a filed title', (verdict) => {
    const rows = decide(reportFor(verdict))
    expect(rows[0].elsewhere).toBe(false)
    expect(formatOwnershipVerdict({ rows })).toContain('POINT REDS HOLD')
  })

  it('holds a regression touching the diff; overlap never overrides baseline evidence', () => {
    expect(changeRelatedness({ checks: [check], changedFiles: ['src/ground.ts'] })[0].related).toBe(true)
    expect(decide(reportFor('real-regression'))[0].elsewhere).toBe(false)
    expect(decide(reportFor('pre-existing'))[0].elsewhere).toBe(true)
  })

  it('holds unfiled evidence and missing, mismatched or duplicate reports', () => {
    expect(decide(reportFor('pre-existing'), [])[0].reason).toContain('filing failed')
    for (const report of [null, {}, { ...reportFor('pre-existing'), backend: 'webgpu' },
      { ...reportFor('pre-existing'), baseline: 'b'.repeat(40) },
      { ...reportFor('pre-existing'), classified: [reportFor('pre-existing').classified[0], reportFor('pre-existing').classified[0]] }]) {
      expect(decide(report)[0].elsewhere).toBe(false)
    }
  })

  it('retains rotating reds beside stable ones, and holds an unresolved crash', () => {
    const rotating = checkFromName('a rotating failure')
    expect(distinctReds([check, rotating], [check])).toEqual([check, rotating])
    expect(formatOwnershipVerdict({ rows: decide(reportFor('pre-existing')), unresolved: ['settings: incomplete run'] }))
      .toContain('own or unresolved: settings: incomplete run')
  })

  it('keys repeated measurements once but keeps suites distinct', () => {
    expect(redRequestTitle('settings', 'edge 1.2')).toBe(redRequestTitle('settings', 'edge 2.3'))
    expect(redRequestTitle('settings', 'edge')).not.toBe(redRequestTitle('polish', 'edge'))
  })
})
