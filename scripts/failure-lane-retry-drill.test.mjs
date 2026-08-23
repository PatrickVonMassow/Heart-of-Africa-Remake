// Point 866's four-lane terminal drill. The mechanism suites prove each state
// machine in depth; this file proves the cross-lane invariant in one place:
// every spent failure lane names a durable decision and another attempt at the
// lane's existing cap, with no clockless park left behind.
import { describe, expect, it } from 'vitest'
import { runawayRecoveryDecision } from './batch-autostart-core.mjs'
import { PAUSE_RETRY_LADDER_MS } from './batch-pause-core.mjs'
import {
  CHILD_RECOVERY_PROBE_MS,
  MAX_RETRIES,
  retryDecision,
} from './child-retry-core.mjs'
import {
  ALERT_GAPS_MS,
  ALERT_PAUSE_RUNG,
  CORRUPTION_ALERT_CLASSES,
  escalationDecision,
} from './alert-escalation-core.mjs'
import { MODEL_HANDOFF_PROBE_MS, modelHandoffDecision } from './model-handoff-core.mjs'

const NOW = Date.parse('2026-08-24T00:00:00Z')
const point = { point: 866, branch: 'feat/866-capped-failure-retry', briefRevision: 'brief', childId: 'child-866', now: NOW }
const route = [
  { model: 'Opus 5', id: 'claude-opus-5[1m]' },
  { model: 'Opus 4.8', id: 'claude-opus-4-8[1m]' },
]
const hits = [{ sha: 'a'.repeat(40), trailer: 'Claude Haiku 4.5 <noreply@anthropic.com>', when: NOW - 1 }]

const runaway = runawayRecoveryDecision({
  failCount: 9,
  attempt: PAUSE_RETRY_LADDER_MS.length + 4,
  now: NOW,
})

const childBudget = retryDecision({
  ...point,
  death: 'API Error: 500',
  state: { deaths: [], points: { 866: { retries: MAX_RETRIES } } },
})

const corruption = escalationDecision({
  key: 'repository-integrity',
  title: 'REPOSITORY INTEGRITY',
  alertClass: 'repository-integrity',
  priority: 'urgent',
  now: NOW,
  entry: {
    rung: ALERT_PAUSE_RUNG,
    lastSentAt: NOW - ALERT_GAPS_MS[ALERT_PAUSE_RUNG],
    firstSentAt: NOW - 4 * 60 * 60 * 1000,
    sends: ALERT_PAUSE_RUNG,
  },
})

const firstHandoff = modelHandoffDecision({ hits, route, sessionId: 'suspect', now: NOW })
const modelProbeAt = NOW + 1
const modelProbe = modelHandoffDecision({
  hits,
  state: firstHandoff.state,
  sessionId: 'trusted-attempt',
  currentModel: 'Haiku 4.5',
  now: modelProbeAt,
})

describe('failure-lane terminal drill', () => {
  it.each([
    {
      lane: 'P5 runaway watchdog',
      decision: runaway,
      nextAttemptAt: runaway.retryAfter,
      decidedAt: NOW,
      capMs: PAUSE_RETRY_LADDER_MS.at(-1),
      record: runaway.decisionRecord,
    },
    {
      lane: 'P6 spent child budget',
      decision: childBudget,
      nextAttemptAt: childBudget.retryAt,
      decidedAt: NOW,
      capMs: CHILD_RECOVERY_PROBE_MS,
      record: childBudget.decisionRecord,
    },
    {
      lane: 'P7 repository corruption',
      decision: corruption,
      nextAttemptAt: corruption.nextAttemptAt,
      decidedAt: NOW,
      capMs: ALERT_GAPS_MS.at(-1),
      record: corruption.decisionRecord,
    },
    {
      lane: 'D3 forbidden author',
      decision: modelProbe,
      nextAttemptAt: modelProbe.retryAfter,
      decidedAt: modelProbeAt,
      capMs: MODEL_HANDOFF_PROBE_MS,
      record: modelProbe.decisionRecord,
    },
  ])('$lane produces a capped next attempt and decision record', ({ decision, nextAttemptAt, decidedAt, capMs, record }) => {
    expect(nextAttemptAt).toBe(decidedAt + capMs)
    expect(record?.title).toMatch(/^Entscheidungsprotokoll:/)
    expect(record?.body).toMatch(/(?:Retroaktives Veto|decision card)/i)
    expect(decision.clockless).not.toBe(true)
  })

  it('clocks a shared child outage at the same cap instead of ending the point', () => {
    const outage = retryDecision({
      ...point,
      death: 'API Error: 500',
      state: { deaths: [{ key: 'another-child', signature: 'http-500', at: NOW - 1 }], points: {} },
    })
    expect(outage).toMatchObject({
      verdict: 'outage-probe',
      recoveryAction: 'probe-outage',
      retryAt: NOW + CHILD_RECOVERY_PROBE_MS,
    })
    expect(outage.decisionRecord.body).toMatch(/Retroaktives Veto/)
  })

  it('keeps point 860’s corruption authority closed and names doctor quarantine or repair', () => {
    expect(CORRUPTION_ALERT_CLASSES).toEqual(['repository-integrity'])
    expect(corruption).toMatchObject({
      action: 'repair-and-probe',
      repair: {
        command: ['scripts/batch-doctor.mjs', '--repair'],
        remedy: 'batch-doctor quarantine or repair',
      },
    })
  })
})
