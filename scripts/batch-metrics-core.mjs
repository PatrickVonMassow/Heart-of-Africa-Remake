// UNBIASED DURABLE-LANE METRICS — ordered-work step 11. All operational events
// come from the fenced journal; context samples are independently recorded.
import { checksumOf } from './batch-schema-core.mjs'

export const SAFETY_INCIDENT_KINDS = Object.freeze(['lost-attempt', 'duplicate-writer', 'overlapping-lease', 'unaccounted-idle', 'missed-boundary'])
export const CONTEXT_HIGH_WATER = 150_000

const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const duration = (event, start, end) => finite(event?.[start]) && finite(event?.[end]) && event[end] >= event[start] ? event[end] - event[start] : null
const percentile = (values, p) => {
  const sorted = values.filter(finite).sort((a, b) => a - b)
  if (!sorted.length) return null
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]
}
const median = (values) => percentile(values, 50)

export function sealSamplingPlan({ method, batchMix, eligibleIntervals, exclusions, sealedAt } = {}) {
  if (typeof method !== 'string' || !method || !Array.isArray(batchMix) || !batchMix.length || !Array.isArray(eligibleIntervals) || !Array.isArray(exclusions) || !finite(sealedAt)) {
    return { ok: false, reason: 'sampling plan names method, batch mix, eligible intervals, exclusions, and seal time' }
  }
  const plan = { method, batchMix, eligibleIntervals, exclusions, sealedAt }
  return { ok: true, plan: Object.freeze(plan), planHash: checksumOf(plan) }
}

export function validateSamplingPlan({ plan, planHash, events = [] } = {}) {
  if (!plan || checksumOf(plan) !== planHash) return { ok: false, reason: 'sampling plan hash is missing or does not match the sealed plan' }
  const first = events.map((event) => event.at).filter(finite).sort((a, b) => a - b)[0]
  if (finite(first) && plan.sealedAt > first) return { ok: false, reason: 'sampling plan was sealed after the measured interval began' }
  return { ok: true }
}

export function metricEventsFromJournal(entries = []) {
  return entries
    .filter((entry) => entry.kind === 'command' && entry.name === 'record-metric' && !entry.quarantine && entry.payload?.event)
    .map((entry) => Object.freeze({ ...entry.payload.event, eventId: entry.payload.eventId, fence: entry.fence, seq: entry.seq }))
}

export function calculateBatchMetrics({ events = [], contextSamples = [], plan, planHash } = {}) {
  const planVerdict = validateSamplingPlan({ plan, planHash, events })
  if (!planVerdict.ok) return planVerdict
  const utilization = events.filter((event) => event.kind === 'lane-utilization')
  let capacityMs = 0, runningMs = 0, backlogPressureMs = 0
  for (const event of utilization) {
    const elapsed = duration(event, 'startedAt', 'endedAt')
    if (elapsed === null || !finite(event.eligibleLanes) || !finite(event.runningLanes)) continue
    capacityMs += elapsed * Math.min(3, Math.max(0, event.eligibleLanes))
    runningMs += elapsed * Math.min(3, Math.max(0, event.runningLanes))
    if (event.reasonCode === 'review-backlog') backlogPressureMs += elapsed
  }
  const checkpointWaits = events.filter((event) => event.kind === 'checkpoint').map((event) => duration(event, 'requestedAt', 'acknowledgedAt')).filter(finite)
  const successorLatencies = events.filter((event) => event.kind === 'boundary').map((event) => duration(event, 'markerAt', 'successorReadyAt')).filter(finite)
  const landingDurations = events.filter((event) => event.kind === 'landing').map((event) => duration(event, 'startedAt', 'landedAt')).filter(finite)
  const boundaries = events.filter((event) => event.kind === 'boundary')
  const incidents = events.filter((event) => event.kind === 'safety-incident' && SAFETY_INCIDENT_KINDS.includes(event.incidentKind))
  const tokens = contextSamples.map((sample) => sample.tokens).filter(finite)
  const handoverTokens = contextSamples.filter((sample) => sample.scope === 'handover').map((sample) => sample.tokens).filter(finite)
  const landingPoints = new Set(events.filter((event) => event.kind === 'landing' && finite(event.landedAt) && event.pointId != null).map((event) => String(event.pointId)))
  const timestamps = events.map((event) => event.at).filter(finite)
  const observedDays = timestamps.length > 1 ? Math.max(1, (Math.max(...timestamps) - Math.min(...timestamps)) / 86_400_000) : 1
  return {
    ok: true,
    planHash,
    utilization: capacityMs ? runningMs / capacityMs : null,
    capacityMs,
    runningMs,
    backlogPressureMs,
    p95CheckpointWaitMs: percentile(checkpointWaits, 95),
    p95SuccessorReadyMs: percentile(successorLatencies, 95),
    carriedWorkers: boundaries.reduce((sum, event) => sum + Math.max(0, Number(event.carriedWorkers) || 0), 0),
    medianLandingDurationMs: median(landingDurations),
    safetyIncidents: incidents,
    safetyIncidentCount: incidents.length,
    highContextShare: tokens.length ? tokens.filter((value) => value > CONTEXT_HIGH_WATER).length / tokens.length : null,
    medianHandoverContext: median(handoverTokens),
    pointsLanded: landingPoints.size,
    pointsPerDay: landingPoints.size / observedDays,
  }
}

export function trialVerdict({ durable, baseline, materialContextRatio = 0.8 } = {}) {
  if (!durable?.ok || !baseline?.ok) return { ok: false, reason: 'durable and baseline reports are required' }
  const failures = []
  if (durable.safetyIncidentCount !== 0) failures.push('safety incidents are nonzero')
  if (!finite(durable.p95CheckpointWaitMs) || durable.p95CheckpointWaitMs > 3 * 60_000) failures.push('p95 checkpoint wait exceeds three minutes or is unmeasured')
  if (!finite(durable.p95SuccessorReadyMs) || durable.p95SuccessorReadyMs > 5 * 60_000) failures.push('p95 successor-ready latency exceeds five minutes or is unmeasured')
  if (!finite(durable.highContextShare) || durable.highContextShare >= 0.1) failures.push('high-context share is not below 10%')
  if (!finite(durable.medianHandoverContext) || !finite(baseline.medianHandoverContext) || durable.medianHandoverContext > baseline.medianHandoverContext * materialContextRatio) failures.push('median handover context is not materially below baseline')
  if (!finite(durable.pointsPerDay) || !finite(baseline.pointsPerDay) || durable.pointsPerDay < baseline.pointsPerDay) failures.push('points landed per day is worse than baseline')
  return { ok: failures.length === 0, failures, utilizationSupporting: durable.utilization }
}
