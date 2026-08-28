// Production bridge from measured operations to the daemon's fenced journal.
// Event ids are content-derived: retrying the same observation is idempotent,
// while changing any measured fact necessarily names a different event.
import { checksumOf } from './batch-schema-core.mjs'
import { controlRequest } from './batch-daemon.mjs'

export const metricEventId = (event) => `metric-${checksumOf(event)}`

export async function recordMetricEvent({ repoDir, batchId, sessionId, fence, event, request = controlRequest } = {}) {
  if (!sessionId || !Number.isInteger(fence)) return { ok: false, reason: 'metric recording is fenced: sessionId and integer fence are required' }
  if (!event || typeof event.kind !== 'string' || !event.kind || !Number.isFinite(event.at)) {
    return { ok: false, reason: 'a metric event has a kind and finite event time' }
  }
  const eventId = metricEventId(event)
  const reply = await request({
    repoDir,
    batchId,
    request: { cmd: 'record-metric', sessionId, fence, payload: { batchId, eventId, event } },
  })
  return reply.ok ? { ok: true, eventId, reply } : { ok: false, eventId, reason: reply.reason ?? 'the daemon refused the metric' }
}

export async function recordMetricEvents(options = {}) {
  const recorded = []
  for (const event of options.events ?? []) {
    const result = await recordMetricEvent({ ...options, event })
    recorded.push({ event, ...result })
    if (!result.ok) return { ok: false, reason: result.reason, recorded }
  }
  return { ok: true, recorded }
}
