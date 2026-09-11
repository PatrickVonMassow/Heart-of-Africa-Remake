import { describe, expect, it } from 'vitest'
import { assessInFlight } from './batch-in-flight-core.mjs'
import { runFailureOf } from './batch-in-flight.mjs'

const failure = 'FAIL (twice, SAME check)  settings — CANDIDATE REAL FAILURE'
const now = 1_000_000
const declaration = {
  sessionId: 'owner', at: now - 1000,
  evidence: [{ kind: 'log', path: '/tmp/large.log' }],
}
const assess = (overrides = {}) => assessInFlight({
  declaration, sid: 'owner', now, mtimeOf: () => now,
  runFailureOf: () => failure, ...overrides,
})

describe('a LARGE candidate failure ends the declared wait', () => {
  it('requires evaluation immediately despite a fresh log and an unexpired wait', () => {
    expect(assess()).toMatchObject({ live: false, reason: 'verification-needs-evaluation' })
    expect(assess().summary).toContain(failure)
    expect(assess().summary).toContain('evaluate the red now')
  })

  it('keeps the ordinary wait while no candidate failure is reported', () => {
    expect(assess({ runFailureOf: () => null })).toMatchObject({ live: true, reason: 'live' })
  })

  it('does not probe a different owner or unrelated pid/agent evidence', () => {
    const unexpectedProbe = () => { throw new Error('must not read this log') }
    expect(assess({ sid: 'other', runFailureOf: unexpectedProbe }).reason).toMatch(/^not-mine:/)
    expect(assess({
      declaration: { ...declaration, evidence: [{ kind: 'branch', ref: 'feat/example' }] },
      refTipAt: () => now, runFailureOf: unexpectedProbe,
    }).live).toBe(true)
  })

  it('reads the structured candidate verdict even when it precedes later suite output', () => {
    const read = (path) => path.endsWith('.run.json')
      ? JSON.stringify({ status: 'running', tier: 'large' })
      : `${failure}\n      failed in BOTH runs: ground-detail [unrelated to the changed files]\nPASS  flow  18 pass\n`
    expect(runFailureOf('/tmp/large.log', { read })).toBe(failure)
  })

  it.each([
    ['small', 'running', failure], ['large', 'finished', failure],
    ['large', 'running', 'FAIL  settings  first attempt'],
    ['large', 'running', `quoted: ${failure}`],
    ['large', 'running', 'FAIL (twice, DIFFERENT checks)  settings — LOAD/FLAKE SIGNATURE'],
  ])('does not end a wait for %s/%s/%s', (tier, status, log) => {
    expect(runFailureOf('/tmp/large.log', {
      read: (path) => path.endsWith('.run.json') ? JSON.stringify({ tier, status }) : log,
    })).toBeNull()
  })

  it('tolerates a missing log or a torn record', () => {
    expect(runFailureOf('/tmp/large.log', { read: () => '{' })).toBeNull()
    expect(runFailureOf('/tmp/large.log', { read: () => { throw new Error('ENOENT') } })).toBeNull()
  })

  it('also evaluates the bare default LARGE invocation', () => {
    expect(runFailureOf('/tmp/default.log', {
      read: (path) => path.endsWith('.run.json')
        ? JSON.stringify({ tier: null, args: [], status: 'running' }) : failure,
    })).toBe(failure)
  })
})
