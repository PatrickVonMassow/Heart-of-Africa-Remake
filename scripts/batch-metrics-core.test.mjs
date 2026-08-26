import { describe, expect, it } from 'vitest'
import { calculateBatchMetrics, metricEventsFromJournal, sealSamplingPlan, trialVerdict } from './batch-metrics-core.mjs'

const plan = sealSamplingPlan({ method: 'daily fixed cohort', batchMix: ['hard', 'medium'], eligibleIntervals: [{ start: 100, end: 1000 }], exclusions: ['remote outage'], sealedAt: 50 })
const events = [
  { kind: 'lane-utilization', at: 100, startedAt: 100, endedAt: 200, eligibleLanes: 3, runningLanes: 2 },
  { kind: 'lane-utilization', at: 200, startedAt: 200, endedAt: 300, eligibleLanes: 3, runningLanes: 0, reasonCode: 'review-backlog' },
  { kind: 'checkpoint', at: 300, requestedAt: 300, acknowledgedAt: 420 },
  { kind: 'boundary', at: 500, markerAt: 500, successorReadyAt: 700, carriedWorkers: 2 },
  { kind: 'landing', at: 800, pointId: '1', startedAt: 700, landedAt: 800 },
]

describe('unbiased durable metrics', () => {
  it('refuses a missing, changed, or post-selected sampling plan', () => {
    expect(calculateBatchMetrics({ events, plan: plan.plan, planHash: 'wrong' }).ok).toBe(false)
    const late = sealSamplingPlan({ ...plan.plan, sealedAt: 150 })
    expect(calculateBatchMetrics({ events, plan: late.plan, planHash: late.planHash }).reason).toMatch(/after the measured interval/)
  })

  it('keeps backlog pressure in the denominator and reports it separately', () => {
    const report = calculateBatchMetrics({ events, contextSamples: [{ scope: 'handover', tokens: 100_000 }], plan: plan.plan, planHash: plan.planHash })
    expect(report.utilization).toBeCloseTo(1 / 3)
    expect(report.capacityMs).toBe(600)
    expect(report.runningMs).toBe(200)
    expect(report.backlogPressureMs).toBe(100)
  })

  it('reports checkpoint, successor, carried-worker, landing, context, and throughput measures', () => {
    const report = calculateBatchMetrics({ events, contextSamples: [{ scope: 'handover', tokens: 100_000 }, { scope: 'ordinary', tokens: 160_000 }], plan: plan.plan, planHash: plan.planHash })
    expect(report).toMatchObject({ p95CheckpointWaitMs: 120, p95SuccessorReadyMs: 200, carriedWorkers: 2, medianLandingDurationMs: 100, highContextShare: 0.5, medianHandoverContext: 100_000, pointsLanded: 1 })
  })

  it('derives events only from authorized durable command entries', () => {
    const extracted = metricEventsFromJournal([
      { seq: 1, fence: 7, kind: 'command', name: 'record-metric', payload: { eventId: 'e1', event: events[0] } },
      { seq: 2, fence: 7, kind: 'command', name: 'record-metric', quarantine: 'old fence', payload: { eventId: 'e2', event: events[1] } },
      { seq: 3, fence: 7, kind: 'attempt-state', payload: { event: events[2] } },
    ])
    expect(extracted).toHaveLength(1)
    expect(extracted[0]).toMatchObject({ eventId: 'e1', fence: 7, seq: 1 })
  })

  it('makes every safety incident a hard veto and never accepts utilization alone', () => {
    const baseline = { ok: true, medianHandoverContext: 200_000, pointsPerDay: 2 }
    const durable = { ok: true, safetyIncidentCount: 0, p95CheckpointWaitMs: 1000, p95SuccessorReadyMs: 2000, highContextShare: 0.05, medianHandoverContext: 100_000, pointsPerDay: 2, utilization: 0.4 }
    expect(trialVerdict({ durable, baseline }).ok).toBe(true)
    expect(trialVerdict({ durable: { ...durable, safetyIncidentCount: 1, utilization: 1 }, baseline })).toMatchObject({ ok: false, utilizationSupporting: 1 })
  })
})
