import { describe, expect, it } from 'vitest'
import { ACTIVITY_CLASSES } from './batch-standstill-core.mjs'
import {
  EMERGENCY_COOLDOWN_MS,
  EMERGENCY_HARD_DEADLINE_MS,
  EMERGENCY_THRESHOLD_MS,
  VERIFICATION_LEASE_MS,
  VERIFICATION_SUSPENSION_MAX_MS,
  activeVerificationLease,
  activeVeto,
  emergencyDecision,
  emergencyHandoffPrompt,
  latestProgressAt,
  recoveryEpisodeKey,
  strikeRecord,
} from './batch-emergency-core.mjs'

const NOW = Date.parse('2026-08-26T20:00:00Z')
const progressAt = NOW - Math.round(1.5 * EMERGENCY_THRESHOLD_MS)
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

  it('keeps ordinary in-threshold progress observable even with a live verification lease', () => {
    const healthy = report(ACTIVITY_CLASSES.VERIFICATION)
    healthy.batchProgress[0].at = NOW - EMERGENCY_THRESHOLD_MS + 1
    healthy.verificationLeases = [{
      record: '/repo/local/verify-logs/large.log.run.json',
      command: 'verify --plan large',
      status: 'running',
      startedAt: NOW - 10 * 60_000,
      progressAt: NOW - 1000,
      leaseUntil: NOW - 1000 + VERIFICATION_LEASE_MS,
      processAlive: true,
    }]
    expect(emergencyDecision({ now: NOW, report: healthy, workablePoints: [1002] })).toMatchObject({
      action: 'observe', strike: false, reason: 'progress-within-threshold',
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

  it('scales the per-record suspension ceiling with a custom emergency threshold', () => {
    const thresholdMs = 30 * 60_000
    const overdue = report(ACTIVITY_CLASSES.VERIFICATION)
    overdue.batchProgress[0].at = NOW - thresholdMs - 1
    overdue.verificationLeases = [{
      record: '/repo/local/verify-logs/large.log.run.json',
      command: 'verify --plan large',
      status: 'running',
      startedAt: NOW - 2 * thresholdMs,
      progressAt: NOW - 1000,
      leaseUntil: NOW - 1000 + VERIFICATION_LEASE_MS,
      processAlive: true,
    }]
    expect(activeVerificationLease(overdue, NOW)).not.toBeNull()
    expect(emergencyDecision({ now: NOW, report: overdue, workablePoints: [1002], thresholdMs })).toMatchObject({
      action: 'soft-recover', strike: true, reason: 'batch-stalled-past-threshold',
    })
  })

  it.each([
    ['self-serving future bound', {
      record: '/repo/local/verify-logs/large.log.run.json', command: 'verify --plan large',
      progressAt: NOW - 1000, leaseUntil: NOW + 10 * VERIFICATION_LEASE_MS,
    }],
    ['unnamed record', { record: '', command: 'verify --plan large', progressAt: NOW - 1000, leaseUntil: NOW + 1000 }],
    ['unnamed command', { record: '/repo/large.log.run.json', command: ' ', progressAt: NOW - 1000, leaseUntil: NOW + 1000 }],
    ['sample beyond the window', {
      record: '/repo/large.log.run.json', command: 'verify --plan large',
      progressAt: NOW - 1000, leaseUntil: NOW + 1000, windowEnd: NOW - 2000,
    }],
    ['future-dated sample', {
      record: '/repo/large.log.run.json', command: 'verify --plan large',
      progressAt: NOW + 1, leaseUntil: NOW + 1000, windowEnd: NOW + 60_000,
    }],
  ])('rejects a verification lease with %s', (_case, fields) => {
    const overdue = report(ACTIVITY_CLASSES.VERIFICATION)
    const { windowEnd, ...leaseFields } = fields
    if (Number.isFinite(windowEnd)) overdue.window.end = windowEnd
    overdue.verificationLeases = [{
      status: 'running', startedAt: NOW - 60_000, processAlive: true,
      ...leaseFields,
    }]
    expect(activeVerificationLease(overdue, NOW)).toBeNull()
  })

  it('selects the freshest valid lease when several runs are present', () => {
    const overdue = report(ACTIVITY_CLASSES.VERIFICATION)
    const lease = (name, sampledAgo) => ({
      record: `/repo/local/verify-logs/${name}.log.run.json`,
      command: `verify ${name}`,
      status: 'running',
      startedAt: NOW - 60 * 60_000,
      progressAt: NOW - sampledAgo,
      leaseUntil: NOW - sampledAgo + VERIFICATION_LEASE_MS,
      processAlive: true,
    })
    overdue.verificationLeases = [lease('older', 2 * 60_000), lease('newer', 1000)]
    expect(activeVerificationLease(overdue, NOW)).toMatchObject({ command: 'verify newer', progressAt: NOW - 1000 })
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

// --- POINT 1048: PROGRESS, NOT LIVENESS -------------------------------------
// The night of 02./03.09.2026 crawled because every clock could be pushed out by
// something that was merely alive. These cases fix the three repairs the
// blind-parallel merge kept: one progress clock that repeats cannot advance, an
// absolute deadline nothing derived from liveness may extend, and a cooldown
// that belongs to its own episode.
describe('the progress clock (union entry U1)', () => {
  const window = { start: NOW - 4 * EMERGENCY_THRESHOLD_MS, end: NOW }

  it('does NOT advance when the same observation is reported again', () => {
    const first = NOW - 3 * EMERGENCY_THRESHOLD_MS
    const repeated = {
      window,
      batchProgress: [
        { at: first, kind: 'first-parent-commit', value: 'abc1234' },
        { at: NOW - 60_000, kind: 'first-parent-commit', value: 'abc1234' },
      ],
    }
    expect(latestProgressAt(repeated)).toBe(first)
  })

  it('advances on a DIFFERENT value of the same kind', () => {
    const first = NOW - 3 * EMERGENCY_THRESHOLD_MS
    const moved = {
      window,
      batchProgress: [
        { at: first, kind: 'first-parent-commit', value: 'abc1234' },
        { at: NOW - 60_000, kind: 'first-parent-commit', value: 'def5678' },
      ],
    }
    expect(latestProgressAt(moved)).toBe(NOW - 60_000)
  })

  it('still trusts an event that carries no value at all', () => {
    // The reports written before this repair have no `value`; a missing field
    // must not silently erase real progress.
    const legacy = { window, batchProgress: [{ at: NOW - 60_000, kind: 'committed-boundary' }] }
    expect(latestProgressAt(legacy)).toBe(NOW - 60_000)
  })

  it('keys one recovery episode to its boundary and owner generation', () => {
    expect(recoveryEpisodeKey({ progressAt: 42, ownerGeneration: 7 })).toBe('42:7')
    expect(recoveryEpisodeKey({ progressAt: 42 })).toBe('42:unknown')
    expect(recoveryEpisodeKey({ progressAt: null })).toBe(null)
  })
})

describe('the absolute deadline (union entry U5)', () => {
  const stalledFor = (ms) => ({
    window: { start: NOW - ms - EMERGENCY_THRESHOLD_MS, end: NOW },
    batchProgress: [{ at: NOW - ms, kind: 'first-parent-commit', value: 'abc1234' }],
  })
  // The incident's own shape: a verification lease that keeps renewing while the
  // batch produces nothing.
  const withLiveLease = (ms) => {
    const report = stalledFor(ms)
    report.verificationLeases = [{
      record: 'local/verify-runs/large.json',
      command: 'npm run verify:large',
      status: 'running',
      processAlive: true,
      startedAt: NOW - 5 * 60_000,
      progressAt: NOW - 60_000,
      leaseUntil: NOW + 5 * 60_000,
    }]
    return report
  }

  it('is stood down by a live lease INSIDE the deadline', () => {
    expect(emergencyDecision({ now: NOW, report: withLiveLease(90 * 60_000), workablePoints: [1048] }))
      .toMatchObject({ action: 'stand-down', reason: 'live-verification-lease' })
  })

  it('recovers HARD past the deadline although the lease is live and fresh', () => {
    expect(emergencyDecision({ now: NOW, report: withLiveLease(EMERGENCY_HARD_DEADLINE_MS), workablePoints: [1048] }))
      .toMatchObject({ action: 'hard-recover', reason: 'past-absolute-deadline', strike: true })
  })

  it('recovers HARD past the deadline although a strike is still in cooldown', () => {
    const progressAt = NOW - EMERGENCY_HARD_DEADLINE_MS
    const state = { lastStrikeAt: NOW - 60_000, lastStrikeProgressAt: progressAt }
    expect(emergencyDecision({ now: NOW, report: stalledFor(EMERGENCY_HARD_DEADLINE_MS), workablePoints: [1048], state }).action)
      .toBe('hard-recover')
  })

  it('still yields to a pause and to a clocked operator veto — human decisions, not liveness', () => {
    const report = stalledFor(EMERGENCY_HARD_DEADLINE_MS)
    expect(emergencyDecision({ now: NOW, report, workablePoints: [1048], paused: true }).action).toBe('stand-down')
    expect(emergencyDecision({ now: NOW, report, workablePoints: [1048], veto: { reason: 'drill', until: NOW + 1 } }).action)
      .toBe('stand-down')
  })

  it('names the deadline in the decision and in the strike record', () => {
    const decision = emergencyDecision({ now: NOW, report: stalledFor(2 * EMERGENCY_THRESHOLD_MS - 1), workablePoints: [1048] })
    expect(decision.hardDeadlineAt).toBe(decision.progressAt + EMERGENCY_HARD_DEADLINE_MS)
    expect(strikeRecord({ id: 'x', decision }).hardDeadlineAt).toBe(decision.hardDeadlineAt)
  })

  it('caps a lease at its PROGRESS boundary, so replacement runs inherit one deadline', () => {
    // A run that started seconds ago cannot buy time when the batch itself has
    // stood still past the deadline — otherwise a chain of fresh runs suspends
    // recovery for ever.
    const boundary = NOW - EMERGENCY_HARD_DEADLINE_MS
    const lease = {
      record: 'local/verify-runs/large.json', command: 'npm run verify:large',
      status: 'running', processAlive: true,
      startedAt: NOW - 60_000, progressAt: NOW - 30_000, leaseUntil: NOW + 5 * 60_000,
    }
    const report = { window: { start: boundary - 1000, end: NOW }, verificationLeases: [lease] }
    expect(activeVerificationLease(report, NOW, VERIFICATION_LEASE_MS, VERIFICATION_SUSPENSION_MAX_MS)).toBeTruthy()
    expect(activeVerificationLease(report, NOW, VERIFICATION_LEASE_MS, VERIFICATION_SUSPENSION_MAX_MS, boundary)).toBe(null)
  })
})

describe('the cooldown belongs to its episode (union entry U6)', () => {
  const report = (progressAt) => ({
    window: { start: progressAt - 1000, end: NOW },
    batchProgress: [{ at: progressAt, kind: 'first-parent-commit', value: String(progressAt) }],
  })

  it('silences a repeat strike against the SAME progress boundary', () => {
    const progressAt = NOW - 2 * EMERGENCY_THRESHOLD_MS + 1
    const state = { lastStrikeAt: NOW - 60_000, lastStrikeProgressAt: progressAt }
    expect(emergencyDecision({ now: NOW, report: report(progressAt), workablePoints: [1048], state }).reason)
      .toBe('strike-cooldown')
  })

  it('does NOT silence a NEW standstill that follows real progress', () => {
    // The batch advanced after the last strike and then stalled again: that is a
    // second wedge, and it must be struck on its own merits.
    const progressAt = NOW - EMERGENCY_THRESHOLD_MS - 1
    const state = { lastStrikeAt: NOW - 60_000, lastStrikeProgressAt: progressAt - 10 * 60_000 }
    expect(emergencyDecision({ now: NOW, report: report(progressAt), workablePoints: [1048], state }))
      .toMatchObject({ action: 'soft-recover', strike: true })
  })
})
