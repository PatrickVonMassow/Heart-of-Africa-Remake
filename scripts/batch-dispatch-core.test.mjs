import { describe, expect, it } from 'vitest'
import { authorizeQueue, dispatchDecision, dispatchMetricEvents, openReasonIntervalFromEvents, updateReasonInterval } from './batch-dispatch-core.mjs'

const sha = 'a'.repeat(40)
const job = (point, dependencies = [], extra = {}) => ({
  pointId: String(point), attemptId: `attempt-${point}`, branch: `feat/${point}-work`,
  worktree: `/worktrees/${point}`, baseSha: sha, adapter: 'sol', dependencies, ...extra,
})

describe('bounded authorized dispatch', () => {
  it('preserves authorization order and waits for dependencies', () => {
    const result = dispatchDecision({ queue: [job(2, ['1']), job(3), job(4)], landedPoints: ['1'] })
    expect(result.ok).toBe(true)
    expect(result.selected.map((entry) => entry.pointId)).toEqual(['2', '3', '4'])
    const blocked = dispatchDecision({ queue: [job(2, ['1'])] })
    expect(blocked.selected).toEqual([])
    expect(blocked.reasonCode).toBe('dependency-blocked')
  })

  it('refuses incomplete, duplicate, self-dependent, and unbounded authorizations', () => {
    expect(authorizeQueue([{ pointId: '1' }]).ok).toBe(false)
    expect(authorizeQueue([job(1), job(1)]).reason).toMatch(/authorized twice/)
    expect(authorizeQueue([job(1, ['1'])]).reason).toMatch(/depends on itself/)
    expect(authorizeQueue(Array.from({ length: 13 }, (_, index) => job(index))).reason).toMatch(/bound is 12/)
  })

  it('prevents a six-worker split brain with the shared global cap', () => {
    const six = Array.from({ length: 6 }, (_, index) => job(index + 1))
    expect(dispatchDecision({ queue: six }).selected).toHaveLength(3)
    const active = six.slice(0, 3).map((entry) => ({ ...entry, state: { state: 'running' } }))
    expect(dispatchDecision({ queue: six, attempts: active }).selected).toEqual([])
    expect(dispatchDecision({ queue: six, attempts: [...active, { ...job(7), state: 'running' }] }).ok).toBe(false)
  })

  it('throttles at the completed-review backlog limit', () => {
    const attempts = [job('done-a', [], { state: 'ready-for-review' }), job('done-b', [], { state: 'ready-for-review' })]
    const result = dispatchDecision({ queue: [job(1), job(2), job(3)], attempts, reviewBacklogLimit: 2 })
    expect(result.selected).toEqual([])
    expect(result.reasonCode).toBe('review-backlog')
    expect(result.underutilized).toBe(true)
  })

  it('accounts for one continuous reason interval and closes it on recovery', () => {
    const decision = dispatchDecision({ queue: [job(1), job(2), job(3)], resources: { ok: false } })
    const first = updateReasonInterval({ decision, at: 100 })
    expect(first.open).toMatchObject({ reasonCode: 'resource-headroom', startedAt: 100 })
    const repeated = updateReasonInterval({ open: first.open, decision, at: 175 })
    expect(repeated.open.startedAt).toBe(100)
    const closed = updateReasonInterval({ open: repeated.open, decision: { underutilized: false }, at: 250 })
    expect(closed.closed.durationMs).toBe(150)
    expect(closed.open).toBeNull()
  })

  it('journals one open reason, measures its elapsed utilization, and closes it on recovery', () => {
    const pressured = dispatchDecision({ queue: [job(1), job(2), job(3)], resources: { ok: false } })
    const first = dispatchMetricEvents({ decision: pressured, at: 100 })
    expect(first.events.filter((event) => event.kind === 'dispatch-reason')).toEqual([
      expect.objectContaining({ phase: 'open', reasonCode: 'resource-headroom', startedAt: 100 }),
    ])
    const second = dispatchMetricEvents({ events: first.events, decision: pressured, at: 175 })
    expect(second.events.filter((event) => event.kind === 'dispatch-reason')).toEqual([])
    expect(second.events).toContainEqual(expect.objectContaining({
      kind: 'lane-utilization', startedAt: 100, endedAt: 175, eligibleLanes: 3, runningLanes: 0, reasonCode: 'resource-headroom',
    }))
    const history = [...first.events, ...second.events]
    expect(openReasonIntervalFromEvents(history)).toMatchObject({ reasonCode: 'resource-headroom', startedAt: 100 })
    const recovered = dispatchMetricEvents({ events: history, decision: dispatchDecision({ queue: [job(1), job(2), job(3)] }), at: 250 })
    expect(recovered.events.filter((event) => event.kind === 'dispatch-reason')).toEqual([
      expect.objectContaining({ phase: 'closed', startedAt: 100, endedAt: 250, durationMs: 150 }),
    ])
    expect(openReasonIntervalFromEvents([...history, ...recovered.events])).toBeNull()
  })
})
