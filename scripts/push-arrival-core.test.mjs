import { describe, it, expect } from 'vitest'
import { evaluatePushArrival } from './push-arrival-core.mjs'

describe('evaluatePushArrival (the 24.07 lost-night witness)', () => {
  it('allows when every commit is contained in a remote ref', () => {
    expect(evaluatePushArrival({ branch: 'main', ahead: 0, hasUpstream: true })).toBeNull()
  })

  it('BLOCKS when commits exist in no remote ref, naming the count and the branch', () => {
    const v = evaluatePushArrival({ branch: 'feat/302-pre-push-gate', ahead: 13, hasUpstream: true })
    expect(v).toMatchObject({ decision: 'block' })
    expect(v.reason).toContain('13 commit(s)')
    expect(v.reason).toContain('feat/302-pre-push-gate')
    expect(v.reason).toContain('git push -u origin feat/302-pre-push-gate')
  })

  it('says so when the branch tracks no remote at all', () => {
    const v = evaluatePushArrival({ branch: 'feat/x', ahead: 1, hasUpstream: false })
    expect(v.reason).toContain('tracks no remote')
  })

  it('demands the ARRIVAL proof, not the push command alone', () => {
    const v = evaluatePushArrival({ branch: 'main', ahead: 2, hasUpstream: true })
    expect(v.reason).toContain('rev-list --count @{u}..HEAD')
    expect(v.reason).toContain('Everything up-to-date')
  })

  // The rule that a push must not run beside a measuring picture run was written
  // down three times on 08.09.2026 and fired none of them, because none of the
  // three copies stood where the demand arrives. These two pin it HERE.
  it('names the conflict with a running measurement, and the gate\'s own exception', () => {
    const v = evaluatePushArrival({ branch: 'main', ahead: 1, hasUpstream: true })
    expect(v.reason).toContain('picture run')
    expect(v.reason).toContain('--no-verify')
    // The exception may never read as a free pass: "documentation only" is what
    // went red, because the unit layer covers the documents.
    expect(v.reason).toContain('unit tests OVER its documents')
  })

  it('names the declared work when one is actually in flight', () => {
    const v = evaluatePushArrival({
      branch: 'main',
      ahead: 1,
      hasUpstream: true,
      inFlight: 'große Regression für 1065',
    })
    expect(v.reason).toContain('VERIFICATION IS IN FLIGHT')
    expect(v.reason).toContain('große Regression für 1065')
    expect(v.reason).toContain('--no-verify')
  })

  it('handles a detached HEAD without inventing a branch name', () => {
    const v = evaluatePushArrival({ branch: '', ahead: 1 })
    expect(v.reason).toContain('detached HEAD')
    expect(v.reason).toContain('git push origin HEAD:')
  })

  it('stands down while the batch is paused', () => {
    expect(evaluatePushArrival({ branch: 'main', ahead: 5, paused: true })).toBeNull()
  })

  it('allows on UNKNOWN git state — a hiccup must never trap the session', () => {
    expect(evaluatePushArrival({ branch: 'main', ahead: null })).toBeNull()
    expect(evaluatePushArrival({ branch: 'main', ahead: Number.NaN })).toBeNull()
  })

  it('never throws on missing or malformed input', () => {
    expect(() => evaluatePushArrival()).not.toThrow()
    expect(() => evaluatePushArrival(null)).not.toThrow()
    expect(() => evaluatePushArrival({ ahead: 'many' })).not.toThrow()
  })
})
