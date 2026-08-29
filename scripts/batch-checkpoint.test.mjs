import { describe, expect, it } from 'vitest'
import { requestCheckpoint } from './batch-checkpoint.mjs'

describe('measured checkpoint path', () => {
  it('records acknowledged wait through the fenced metric caller', async () => {
    const sha = 'a'.repeat(40)
    const metricEvents = []
    const times = [100, 140]
    const result = await requestCheckpoint({
      repoDir: '/repo', batchId: 'b', sessionId: 's', fence: 7, requestId: 'cp', now: () => times.shift(),
      request: async () => ({ ok: true, result: { answers: [{ attemptId: 'a', acknowledged: true, acknowledgedAt: 135, transferable: true, pushedOk: true, dirty: false, sha }] } }),
      openStore: () => ({}), writeDurableReceipt: () => ({ ok: true }),
      recordMetric: async ({ event }) => { metricEvents.push(event); return { ok: true } },
    })
    expect(result.ok).toBe(true)
    expect(metricEvents).toEqual([expect.objectContaining({ kind: 'checkpoint', requestedAt: 100, acknowledgedAt: 135, at: 140, transferable: true })])
  })
})
