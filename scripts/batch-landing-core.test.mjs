import { describe, expect, it } from 'vitest'
import { advanceLanding, createLandingTransaction, landingLockVerdict, landingReadyToMerge, recoverLanding } from './batch-landing-journal-core.mjs'

const a = 'a'.repeat(40), b = 'b'.repeat(40), merge = 'c'.repeat(40), hash = 'd'.repeat(64)
const created = () => createLandingTransaction({ landingId: 'l1', batchId: 'batch', pointId: '676', branch: 'feat/676-x', candidateSha: a, targetSha: b, baseSha: b, actor: 'lander', fence: 8, at: 1 }).transaction
const evidence = {
  'diff-review': { at: 2, complete: true, reviewer: 'reviewer', source: 'main-session' },
  gates: { at: 3, build: { verdict: 'green' }, lint: { verdict: 'green' }, 'test:unit': { verdict: 'green' } },
  'picture-webgpu': { at: 4, backend: 'webgpu', verdict: 'pass', source: 'main-session', evidencePath: 'verification/a.png', evidenceHash: hash },
  'picture-webgl2': { at: 5, backend: 'webgl2', verdict: 'pass', source: 'main-session', evidencePath: 'verification/b.png', evidenceHash: hash },
  merge: { at: 6, mergeSha: merge, publicationId: 'landing-l1' },
  bookkeeping: { at: 7, complete: true, commitSha: merge },
  board: { at: 8, published: true, boardHash: hash },
  landed: { at: 9, mergeSha: merge },
}
const through = (stage) => {
  let transaction = created()
  for (const name of ['diff-review', 'gates', 'picture-webgpu', 'picture-webgl2', 'merge', 'bookkeeping', 'board', 'landed']) {
    if (transaction.stage === stage) break
    transaction = advanceLanding(transaction, name, evidence[name]).transaction
    if (name === stage) break
  }
  return transaction
}

describe('crash-recoverable serial landing', () => {
  it('persists every stage in order and makes exact retries idempotent', () => {
    let transaction = created()
    for (const stage of Object.keys(evidence)) transaction = advanceLanding(transaction, stage, evidence[stage]).transaction
    expect(transaction.stage).toBe('landed')
    expect(Object.keys(transaction.stages)).toEqual(['candidate', ...Object.keys(evidence)])
    expect(advanceLanding(transaction, 'landed', evidence.landed).alreadyRecorded).toBe(true)
  })

  it('refuses missing gates and worker-substituted picture judgments', () => {
    const reviewed = through('diff-review')
    expect(advanceLanding(reviewed, 'gates', { ...evidence.gates, lint: { verdict: 'red' } }).ok).toBe(false)
    const gated = through('gates')
    expect(advanceLanding(gated, 'picture-webgpu', { ...evidence['picture-webgpu'], source: 'worker' }).ok).toBe(false)
  })

  it('returns stale candidates and bases to explicit rework', () => {
    const transaction = through('picture-webgl2')
    expect(landingReadyToMerge({ transaction, branchSha: a, targetSha: b, currentFence: 8 }).ok).toBe(true)
    expect(landingReadyToMerge({ transaction, branchSha: merge, targetSha: b, currentFence: 8 })).toMatchObject({ ok: false, rework: true })
    expect(landingReadyToMerge({ transaction, branchSha: a, targetSha: merge, currentFence: 8 })).toMatchObject({ ok: false, rework: true })
  })

  it('excludes another landing and resumes only the exact holder', () => {
    const existing = { landingId: 'l1', sessionId: 's1', fence: 8, stage: 'gates' }
    expect(landingLockVerdict({ existing, claimant: { landingId: 'l1', sessionId: 's1', fence: 8 } }).action).toBe('resume')
    expect(landingLockVerdict({ existing, claimant: { landingId: 'l2', sessionId: 's2', fence: 9 }, ownerLive: true }).ok).toBe(false)
    expect(landingLockVerdict({ existing, claimant: { landingId: 'l2', sessionId: 's2', fence: 9 }, ownerLive: false }).recovery.action).toBe('restart')
  })

  it('recovers crashes at every journal stage deterministically', () => {
    for (const stage of ['candidate', 'diff-review', 'gates', 'picture-webgpu', 'picture-webgl2']) expect(recoverLanding(through(stage)).action).toBe('restart')
    expect(recoverLanding(through('merge')).action).toBe('resolve-merge-against-remote')
    for (const stage of ['bookkeeping', 'board']) expect(recoverLanding(through(stage)).action).toBe('resume-bookkeeping')
    expect(recoverLanding(through('landed')).action).toBe('done')
  })
})
