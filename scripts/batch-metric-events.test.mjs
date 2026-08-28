import { describe, expect, it } from 'vitest'
import { metricEventsFromJournal } from './batch-metrics-core.mjs'
import { metricEventId, recordMetricEvents } from './batch-metric-events.mjs'

describe('fenced production metric recording', () => {
  it('round-trips the exact recorded series through the durable journal projection', async () => {
    const events = [
      { kind: 'lane-utilization', at: 20, startedAt: 10, endedAt: 20, eligibleLanes: 3, runningLanes: 2 },
      { kind: 'checkpoint', at: 30, requestedAt: 20, acknowledgedAt: 30 },
    ]
    const entries = []
    const request = async ({ request: command }) => {
      expect(command).toMatchObject({ cmd: 'record-metric', sessionId: 's', fence: 7, payload: { batchId: 'b' } })
      entries.push({ kind: 'command', name: command.cmd, fence: command.fence, seq: entries.length + 1, payload: command.payload })
      return { ok: true }
    }
    const result = await recordMetricEvents({ repoDir: '/repo', batchId: 'b', sessionId: 's', fence: 7, events, request })
    expect(result.ok).toBe(true)
    expect(result.recorded.map((item) => item.eventId)).toEqual(events.map(metricEventId))
    expect(metricEventsFromJournal(entries).map((event) => ({
      kind: event.kind,
      at: event.at,
      ...(event.startedAt === undefined ? {} : { startedAt: event.startedAt }),
      ...(event.endedAt === undefined ? {} : { endedAt: event.endedAt }),
      ...(event.eligibleLanes === undefined ? {} : { eligibleLanes: event.eligibleLanes }),
      ...(event.runningLanes === undefined ? {} : { runningLanes: event.runningLanes }),
      ...(event.requestedAt === undefined ? {} : { requestedAt: event.requestedAt }),
      ...(event.acknowledgedAt === undefined ? {} : { acknowledgedAt: event.acknowledgedAt }),
    }))).toEqual(events)
  })
})
