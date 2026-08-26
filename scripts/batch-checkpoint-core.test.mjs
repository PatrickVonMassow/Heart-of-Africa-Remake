import { describe, expect, it } from 'vitest'
import { acknowledgeCheckpoint, checkpointBarrierVerdict, createCheckpointBarrier, daemonCheckpointVerdict } from './batch-checkpoint-core.mjs'

const sha = 'b'.repeat(40)
const barrier = () => createCheckpointBarrier({ requestId: 'cp-1', lanes: ['a', 'b'], requestedAt: 100, timeoutMs: 50, fence: 7 }).barrier
const ack = (attemptId, extra = {}) => ({ requestId: 'cp-1', attemptId, acknowledgedAt: 120, sha, committed: true, pushed: true, clean: true, ...extra })

describe('checkpoint barrier', () => {
  it('accepts clean committed-and-pushed acknowledgments', () => {
    let current = acknowledgeCheckpoint(barrier(), ack('a')).barrier
    current = acknowledgeCheckpoint(current, ack('b')).barrier
    expect(checkpointBarrierVerdict(current, { now: 130 })).toMatchObject({ ok: true, verdict: 'ready' })
  })

  it('reports push failure with explicit recovery choices', () => {
    const current = acknowledgeCheckpoint(barrier(), ack('a', { pushed: false, pushError: 'remote unavailable' })).barrier
    const verdict = checkpointBarrierVerdict(current, { now: 130 })
    expect(verdict.verdict).toBe('blocked')
    expect(verdict.blocked[0]).toMatchObject({ attemptId: 'a', choices: ['wait', 'cancel', 'drain'] })
    expect(verdict.blocked[0].reason).toMatch(/push failed/)
  })

  it('names timed-out lanes and never silently continues', () => {
    const verdict = checkpointBarrierVerdict(barrier(), { now: 151 })
    expect(verdict.ok).toBe(false)
    expect(verdict.blocked.map((item) => item.attemptId)).toEqual(['a', 'b'])
    expect(verdict.blocked.every((item) => item.transferable === false)).toBe(true)
  })

  it('makes identical duplicate acknowledgment idempotent and conflicts loud', () => {
    const first = acknowledgeCheckpoint(barrier(), ack('a'))
    expect(acknowledgeCheckpoint(first.barrier, ack('a')).alreadyAcknowledged).toBe(true)
    expect(acknowledgeCheckpoint(first.barrier, ack('a', { sha: 'c'.repeat(40) })).ok).toBe(false)
  })

  it('retains a late acknowledgment as evidence but blocks transfer', () => {
    const current = acknowledgeCheckpoint(barrier(), ack('a', { acknowledgedAt: 151 })).barrier
    const verdict = checkpointBarrierVerdict(current, { now: 151 })
    expect(verdict.blocked.find((item) => item.attemptId === 'a').reason).toMatch(/late acknowledgment/)
  })

  it('fails closed on incomplete daemon answers', () => {
    expect(daemonCheckpointVerdict({ requestId: 'cp', answers: [{ attemptId: 'a', acknowledged: true, transferable: true, sha }] }).ok).toBe(true)
    const blocked = daemonCheckpointVerdict({ requestId: 'cp', answers: [{ attemptId: 'a', acknowledged: false }] })
    expect(blocked.blocked[0].choices).toEqual(['wait', 'cancel', 'drain'])
  })
})
