import { describe, expect, it } from 'vitest'
import { ACTIVITY_CLASSES } from './batch-standstill-core.mjs'
import {
  EMERGENCY_COOLDOWN_MS,
  EMERGENCY_THRESHOLD_MS,
  VERIFICATION_LEASE_MS,
  VERIFICATION_SUSPENSION_MAX_MS,
  activeVerificationLease,
  activeVeto,
  emergencyDecision,
  emergencyHandoffPrompt,
  latestProgressAt,
  strikeRecord,
} from './batch-emergency-core.mjs'

const NOW = Date.parse('2026-08-26T20:00:00Z')
const progressAt = NOW - 2 * EMERGENCY_THRESHOLD_MS
const report = (className = ACTIVITY_CLASSES.NO_WORKER) => ({
  window: { start: progressAt - EMERGENCY_THRESHOLD_MS, end: NOW },
  batchProgress: [{ at: progressAt, kind: 'first-parent-commit' }],
  timeline: [
    { start: progressAt - 1000, end: progressAt, className: ACTIVITY_CLASSES.FOREGROUND },
    { start: progressAt, end: NOW, className },
  ],
})

describe('the independent emergency decision', () => {
  it('stands down for a pause, a clocked veto, and an empty workable queue', () => {
    expect(emergencyDecision({ now: NOW, report: report(), workablePoints: [947], paused: true }).reason).toBe('batch-paused')
    expect(emergencyDecision({ now: NOW, report: report(), workablePoints: [947], veto: { reason: 'operator drill', until: NOW + 1 } }).reason).toBe('clocked-veto')
    expect(emergencyDecision({ now: NOW, report: report(), workablePoints: [] }).reason).toBe('no-workable-points')
    expect(activeVeto({ reason: 'expired', until: NOW - 1 }, NOW)).toBe(false)
  })

  it('stands down when a real batch advance is inside the hour', () => {
    const recent = report()
    recent.batchProgress[0].at = NOW - EMERGENCY_THRESHOLD_MS + 1
    expect(emergencyDecision({ now: NOW, report: recent, workablePoints: [947] })).toMatchObject({
      action: 'observe', strike: false, reason: 'progress-within-threshold',
    })
  })

  it('makes the first overdue strike soft', () => {
    expect(emergencyDecision({ now: NOW, report: report(), workablePoints: [947] })).toMatchObject({
      action: 'soft-recover', strike: true, progressAt, workablePoints: [947],
    })
  })

  it('makes a second strike HARD only when the first recovery did not move the progress boundary', () => {
    const state = { lastStrikeAt: NOW - EMERGENCY_COOLDOWN_MS - 1, lastStrikeProgressAt: progressAt }
    expect(emergencyDecision({ now: NOW, report: report(), workablePoints: [947], state })).toMatchObject({
      action: 'hard-recover', strike: true, reason: 'batch-still-stalled-after-recorded-recovery',
    })
    const moved = report()
    moved.batchProgress[0].at = progressAt + 1
    expect(emergencyDecision({ now: NOW, report: moved, workablePoints: [947], state }).action).toBe('soft-recover')
  })

  it('debounces duplicate scheduler starts and fails safe without a bounded evidence window', () => {
    const state = { lastStrikeAt: NOW - EMERGENCY_COOLDOWN_MS + 1, lastStrikeProgressAt: progressAt }
    expect(emergencyDecision({ now: NOW, report: report(), workablePoints: [947], state }).reason).toBe('strike-cooldown')
    expect(emergencyDecision({ now: NOW, report: {}, workablePoints: [947] }).reason).toBe('no-bounded-evidence-window')
  })

  it('takes only explicit batch progress, never session activity or owner presence', () => {
    expect(latestProgressAt(report(ACTIVITY_CLASSES.IDLE_OWNER))).toBe(progressAt)
    expect(latestProgressAt({
      window: { start: 1 },
      batchProgress: [
        { at: 5, kind: 'first-parent-commit' },
        { at: 8, kind: 'delegated-branch-moved' },
        { at: 99, kind: ACTIVITY_CLASSES.FOREGROUND },
      ],
      timeline: [
        { end: 4, className: ACTIVITY_CLASSES.FOREGROUND },
        { end: 10, className: ACTIVITY_CLASSES.VERIFICATION },
        { end: 12, className: ACTIVITY_CLASSES.IDLE_OWNER },
      ],
    })).toBe(8)
    expect(latestProgressAt({
      window: { start: 1 },
      timeline: Object.values(ACTIVITY_CLASSES).map((className, index) => ({ end: index + 2, className })),
    })).toBe(1)
  })

  it('strikes an owner that stays busy without moving the batch', () => {
    const busy = report(ACTIVITY_CLASSES.FOREGROUND)
    busy.timeline = Array.from({ length: 12 }, (_, index) => ({
      start: progressAt + index * 10 * 60_000,
      end: progressAt + (index + 1) * 10 * 60_000,
      className: ACTIVITY_CLASSES.FOREGROUND,
    }))
    expect(emergencyDecision({ now: NOW, report: busy, workablePoints: [947] })).toMatchObject({
      action: 'soft-recover', strike: true, progressAt,
    })
  })

  it('suspends the old durable-progress clock for one named, advancing, live verification run', () => {
    const overdue = report(ACTIVITY_CLASSES.VERIFICATION)
    overdue.batchProgress[0].at = NOW - 90 * 60_000
    overdue.verificationLeases = [{
      record: '/repo/local/verify-logs/large.log.run.json',
      command: 'verify --plan large',
      status: 'running',
      startedAt: NOW - 80 * 60_000,
      progressAt: NOW - 60_000,
      leaseUntil: NOW - 60_000 + VERIFICATION_LEASE_MS,
      processAlive: true,
    }]
    expect(emergencyDecision({ now: NOW, report: overdue, workablePoints: [1002] })).toMatchObject({
      action: 'stand-down', strike: false, reason: 'live-verification-lease',
      progressAt: NOW - 90 * 60_000,
      verificationLease: { command: 'verify --plan large', progressAt: NOW - 60_000 },
    })
  })

  it.each([
    ['expired', { progressAt: NOW - 60_000, leaseUntil: NOW - 1, processAlive: true }],
    ['stale', { progressAt: NOW - VERIFICATION_LEASE_MS - 1, leaseUntil: NOW + 60_000, processAlive: true }],
    ['process-dead', { progressAt: NOW - 60_000, leaseUntil: NOW + 60_000, processAlive: false }],
  ])('strikes exactly as before when a verification lease is %s', (_case, fields) => {
    const overdue = report(ACTIVITY_CLASSES.VERIFICATION)
    overdue.batchProgress[0].at = NOW - 90 * 60_000
    overdue.verificationLeases = [{
      record: '/repo/local/verify-logs/large.log.run.json',
      command: 'verify --plan large',
      status: 'running',
      startedAt: NOW - 100 * 60_000,
      ...fields,
    }]
    expect(activeVerificationLease(overdue, NOW)).toBeNull()
    expect(emergencyDecision({ now: NOW, report: overdue, workablePoints: [1002] })).toMatchObject({
      action: 'soft-recover', strike: true, reason: 'batch-stalled-past-threshold',
      progressAt: NOW - 90 * 60_000,
    })
  })

  it('caps repeated verification renewals at two hours from the run start', () => {
    const overdue = report(ACTIVITY_CLASSES.VERIFICATION)
    const startedAt = NOW - VERIFICATION_SUSPENSION_MAX_MS
    overdue.verificationLeases = [{
      record: '/repo/local/verify-logs/large.log.run.json',
      command: 'verify --plan large',
      status: 'running',
      startedAt,
      progressAt: NOW - 1000,
      leaseUntil: NOW - 1000 + VERIFICATION_LEASE_MS,
      processAlive: true,
    }]
    expect(activeVerificationLease(overdue, NOW)).toBeNull()
    expect(emergencyDecision({ now: NOW, report: overdue, workablePoints: [1002] })).toMatchObject({
      action: 'soft-recover', strike: true, reason: 'batch-stalled-past-threshold',
    })

    const beforeCeiling = NOW - 1
    overdue.verificationLeases[0].startedAt = beforeCeiling - VERIFICATION_SUSPENSION_MAX_MS + 1
    overdue.verificationLeases[0].progressAt = beforeCeiling - 1000
    overdue.verificationLeases[0].leaseUntil = overdue.verificationLeases[0].progressAt + VERIFICATION_LEASE_MS
    expect(activeVerificationLease(overdue, beforeCeiling)).toMatchObject({
      leaseUntil: NOW,
      suspensionUntil: NOW,
    })
  })

  it('records the strike, evidence, outcome phase and exact veto command', () => {
    const decision = emergencyDecision({ now: NOW, report: report(), workablePoints: [947] })
    expect(strikeRecord({ id: 's1', decision, at: NOW, phase: 'intent' })).toMatchObject({
      id: 's1', phase: 'intent', action: 'soft-recover', progressAt, workablePoints: [947],
    })
    expect(strikeRecord({ id: 's1', decision, at: NOW }).veto).toMatch(/--veto.*--until/)
  })

  it('hands a hard-wedge successor to the next workable point with a recorded override', () => {
    const prompt = emergencyHandoffPrompt({
      pending: { phase: 'intent', action: 'hard-recover', workablePoints: [947, 948, 949] },
    })
    expect(prompt).toMatch(/point 947 made no progress/)
    expect(prompt).toMatch(/commission-guard\.mjs --override 948/)
    expect(prompt).toMatch(/then work point 948/)
    expect(emergencyHandoffPrompt({ lastOutcome: {} })).toBe('')
  })
})
