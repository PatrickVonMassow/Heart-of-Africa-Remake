import { describe, expect, it } from 'vitest'
import { batchBoardText, projectBatchBoard } from './batch-board-core.mjs'
import { DAEMON_POOL_CAP } from './batch-daemon-core.mjs'

describe('durable batch board projection', () => {
  it('shows every lane, heartbeat age, ETA, epoch, backlog, queue, and boundary', () => {
    const projected = projectBatchBoard({
      batchId: 'b1', now: 10_000,
      coordinator: { role: 'lander', sessionId: 's2', fence: 8 }, daemon: { state: 'running', generation: 'g1' },
      lanes: [
        { pointId: '1', attemptId: 'a1', state: 'running', heartbeatAt: 9_000, etaAt: 20_000 },
        { pointId: '2', attemptId: 'a2', state: 'ready-for-review', heartbeatAt: 8_000 },
      ],
      queue: [{ pointId: '3' }], boundary: { state: 'committed', markerPresent: true, sealed: true, successorReady: true },
    })
    expect(projected).toMatchObject({ ok: true, active: 1, backlog: 1, queueDepth: 1, red: false })
    expect(projected.cap).toBe(DAEMON_POOL_CAP)
    expect(projected.lanes).toHaveLength(2)
    expect(projected.lanes[0].heartbeatAgeMs).toBe(1000)
    expect(batchBoardText(projected)).toMatch(/epoch 8 · lanes 1\/3 · backlog 1 · queue 1/)
  })

  it('raises red alerts for stalled and quarantined workers', () => {
    const projected = projectBatchBoard({ batchId: 'b', now: 10, lanes: [
      { pointId: '1', attemptId: 'a', reading: 'stalled', alert: true, reason: 'heartbeat silent' },
      { pointId: '2', attemptId: 'b', reading: 'divergent', quarantine: true, reason: 'remote mismatch' },
    ] })
    expect(projected.alerts.map((alert) => alert.kind)).toEqual(['stalled-worker', 'quarantined-evidence'])
    expect(projected.red).toBe(true)
  })

  it('raises missing-successor and marker-deletion alerts', () => {
    const projected = projectBatchBoard({ batchId: 'b', now: 10, boundary: { sealed: true, sealedFence: 7, successorReady: false, markerPresent: false } })
    expect(projected.alerts.map((alert) => alert.kind)).toEqual(['missing-successor', 'marker-deletion'])
  })

  it('projects rejected old-epoch mutations and open reason intervals', () => {
    const projected = projectBatchBoard({ batchId: 'b', now: 10, coordinator: { fence: 9, rejectedMutations: [{ fence: 8, reason: 'sealed old epoch' }] }, reasonIntervals: [{ reasonCode: 'review-backlog', startedAt: 1 }] })
    expect(projected.alerts[0]).toMatchObject({ kind: 'rejected-old-epoch', detail: 'sealed old epoch' })
    expect(projected.underutilization).toHaveLength(1)
  })
})
