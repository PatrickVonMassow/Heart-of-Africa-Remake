import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_CLASSES,
  WEDGE_REPEAT_THRESHOLD,
  classifyTimeline,
  commitGapSummary,
  evidenceInterval,
  journalIntervals,
  outcomeSignature,
  repeatedOutcomeWedge,
  timelineTotals,
} from './batch-standstill-core.mjs'
import { ACTIVITY_EVENTS, activityRecord } from './batch-activity-journal-core.mjs'

const START = Date.parse('2026-08-21T08:00:00.000Z')
const rec = (seq, minute, event, over = {}) => activityRecord({
  seq, at: START + minute * 60_000, event, session: 'owner', pid: 42, pidStartedAt: 1000,
  generation: 7, cause: 'fixture', evidence: {}, ...over,
})

describe('standstill classifier', () => {
  it('classifies an advancing named run as verification work', () => {
    const records = [
      rec(1, 0, ACTIVITY_EVENTS.OWNER_CLAIM, { evidence: { leaseUntil: START + 30 * 60_000 } }),
      rec(2, 2, ACTIVITY_EVENTS.VERIFICATION_START, { evidence: { id: 'verify-1', command: 'verify small', leaseUntil: START + 12 * 60_000 } }),
      rec(3, 8, ACTIVITY_EVENTS.VERIFICATION_PROGRESS, { evidence: { id: 'verify-1', leaseUntil: START + 18 * 60_000 } }),
      rec(4, 15, ACTIVITY_EVENTS.VERIFICATION_FINISH, { evidence: { id: 'verify-1', result: 'green' } }),
    ]
    const derived = journalIntervals(records, { start: START, end: START + 20 * 60_000 })
    const timeline = classifyTimeline({ start: START, end: START + 20 * 60_000, ...derived, journalStartedAt: START })
    expect(timeline.filter((x) => x.start >= START + 2 * 60_000 && x.end <= START + 15 * 60_000).every((x) => x.className === ACTIVITY_CLASSES.VERIFICATION)).toBe(true)
  })

  it('makes the same owner interval idle standstill without advancing work', () => {
    const owner = evidenceInterval({
      start: START, end: START + 20 * 60_000, className: null, state: 'owner',
      evidence: { session: 'owner', pid: 42, pidStartedAt: 1000, generation: 7 },
    })
    expect(classifyTimeline({ start: START, end: START + 20 * 60_000, intervals: [owner], journalStartedAt: START })).toEqual([
      expect.objectContaining({ durationMs: 20 * 60_000, className: ACTIVITY_CLASSES.IDLE_OWNER }),
    ])
  })

  it('uses a completed foreground tool interval but never a bare heartbeat', () => {
    const records = [
      rec(1, 2, ACTIVITY_EVENTS.FOREGROUND_ACTIVITY, {
        evidence: { startedAt: START + 60_000, finishedAt: START + 2 * 60_000, tool: 'Bash' },
      }),
      rec(2, 3, ACTIVITY_EVENTS.FOREGROUND_ACTIVITY, { cause: 'heartbeat-only', evidence: {} }),
    ]
    const derived = journalIntervals(records, { start: START, end: START + 4 * 60_000 })
    const timeline = classifyTimeline({ start: START, end: START + 4 * 60_000, ...derived, journalStartedAt: START })
    expect(timeline.find((item) => item.start === START + 60_000)?.className).toBe(ACTIVITY_CLASSES.FOREGROUND)
    expect(timeline.find((item) => item.start === START + 3 * 60_000)?.className).toBe(ACTIVITY_CLASSES.UNKNOWN)
  })

  it('makes a launcher skip with no owner no-worker standstill', () => {
    const skip = evidenceInterval({
      start: START, end: START + 20 * 60_000, className: null, state: 'no-worker',
      cause: 'launcher-skip', evidence: { owner: null },
    })
    expect(classifyTimeline({ start: START, end: START + 20 * 60_000, intervals: [skip], journalStartedAt: START })[0].className).toBe(ACTIVITY_CLASSES.NO_WORKER)
  })

  it('bounds no-worker standstill by process loss and the successor start', () => {
    const records = [
      rec(1, 1, ACTIVITY_EVENTS.PROCESS_EXIT, { cause: 'crash' }),
      rec(2, 4, ACTIVITY_EVENTS.SUCCESSOR_START, { session: 'successor', pid: 99, pidStartedAt: 2000 }),
    ]
    const derived = journalIntervals(records, { start: START, end: START + 5 * 60_000 })
    const timeline = classifyTimeline({ start: START, end: START + 5 * 60_000, ...derived, journalStartedAt: START })
    const gap = timeline.filter((item) => item.start >= START + 60_000 && item.end <= START + 4 * 60_000)
    expect(gap.every((item) => item.className === ACTIVITY_CLASSES.NO_WORKER)).toBe(true)
    expect(gap.reduce((sum, item) => sum + item.durationMs, 0)).toBe(3 * 60_000)
  })

  it('gives an explicit user pause precedence over work', () => {
    const all = (className, cause) => evidenceInterval({ start: START, end: START + 10_000, className, cause })
    const timeline = classifyTimeline({
      start: START, end: START + 10_000, journalStartedAt: START,
      intervals: [all(ACTIVITY_CLASSES.FOREGROUND, 'tool'), all(ACTIVITY_CLASSES.BLOCKED_USER, 'pause-marker')],
    })
    expect(timeline[0].className).toBe(ACTIVITY_CLASSES.BLOCKED_USER)
  })

  it('keeps unclassifiable and pre-journal time unknown', () => {
    const timeline = classifyTimeline({
      start: START, end: START + 20_000, journalStartedAt: START + 10_000,
      intervals: [evidenceInterval({ start: START, end: START + 20_000, className: ACTIVITY_CLASSES.FOREGROUND })],
    })
    expect(timeline.map((x) => x.className)).toEqual([ACTIVITY_CLASSES.UNKNOWN, ACTIVITY_CLASSES.FOREGROUND])
  })

  it('splits overlaps at every boundary and covers every millisecond once', () => {
    const timeline = classifyTimeline({
      start: START, end: START + 1000, journalStartedAt: START,
      boundaries: [START + 250],
      intervals: [
        evidenceInterval({ start: START, end: START + 700, className: ACTIVITY_CLASSES.FOREGROUND, cause: 'tool' }),
        evidenceInterval({ start: START + 400, end: START + 900, className: ACTIVITY_CLASSES.VERIFICATION, cause: 'run' }),
      ],
    })
    expect(timeline.map((x) => x.durationMs)).toEqual([250, 150, 300, 200, 100])
    expect(timelineTotals(timeline).elapsedMs).toBe(1000)
    expect(timeline.every((x, i) => i === 0 || timeline[i - 1].end === x.start)).toBe(true)
  })

  it('makes contradictory ownership unknown', () => {
    const owner = (session) => evidenceInterval({ start: START, end: START + 1000, className: null, state: 'owner', evidence: { session } })
    expect(classifyTimeline({ start: START, end: START + 1000, intervals: [owner('a'), owner('b')], journalStartedAt: START })[0].cause).toBe('contradictory-owners')
  })
})

describe('measured commit gaps', () => {
  it('counts only consecutive first-parent gaps at or above the declared threshold', () => {
    const summary = commitGapSummary([START, START + 19 * 60_000, START + 40 * 60_000], 20 * 60_000)
    expect(summary.commits).toBe(3)
    expect(summary.gaps).toHaveLength(1)
    expect(summary.gapMs).toBe(21 * 60_000)
  })
})


// Point 1048, union entry U15: the wait is not the work.
describe('an interval closes with its identity', () => {
  it('attributes the post-run eternal wait to an idle owner, not to verification', () => {
    // The measured shape of 02./03.09.2026: a verification starts, the run ENDS
    // at minute 15 without writing a finish record, and the owner goes on waiting
    // for it under a lease that keeps being renewed until minute 100.
    const records = [
      rec(1, 0, ACTIVITY_EVENTS.OWNER_CLAIM, { evidence: { leaseUntil: START + 120 * 60_000 } }),
      rec(2, 2, ACTIVITY_EVENTS.VERIFICATION_START, {
        evidence: { id: 'verify-1', command: 'verify large', leaseUntil: START + 100 * 60_000 },
      }),
    ]
    const window = { start: START, end: START + 110 * 60_000 }
    const blind = classifyTimeline({
      ...window, ...journalIntervals(records, window), journalStartedAt: START,
    })
    expect(blind.some((x) => x.className === ACTIVITY_CLASSES.VERIFICATION && x.end > START + 90 * 60_000)).toBe(true)

    const seeing = classifyTimeline({
      ...window,
      ...journalIntervals(records, {
        ...window,
        identityTerminalAt: (record) => (record.event === ACTIVITY_EVENTS.VERIFICATION_START ? START + 15 * 60_000 : null),
      }),
      journalStartedAt: START,
    })
    const afterTheRun = seeing.filter((x) => x.start >= START + 15 * 60_000)
    expect(afterTheRun.every((x) => x.className === ACTIVITY_CLASSES.IDLE_OWNER)).toBe(true)
    expect(seeing.some((x) => x.className === ACTIVITY_CLASSES.VERIFICATION && x.end <= START + 15 * 60_000)).toBe(true)
  })

  it('leaves the classification alone when the measuring half cannot see', () => {
    const records = [
      rec(1, 0, ACTIVITY_EVENTS.OWNER_CLAIM, { evidence: { leaseUntil: START + 40 * 60_000 } }),
      rec(2, 2, ACTIVITY_EVENTS.VERIFICATION_START, { evidence: { id: 'v', command: 'verify small', leaseUntil: START + 30 * 60_000 } }),
    ]
    const window = { start: START, end: START + 35 * 60_000 }
    const withNull = classifyTimeline({ ...window, ...journalIntervals(records, { ...window, identityTerminalAt: () => null }), journalStartedAt: START })
    const without = classifyTimeline({ ...window, ...journalIntervals(records, window), journalStartedAt: START })
    expect(withNull).toEqual(without)
  })
})

// Point 1048, union entry U16: the busy wedge, counted.
describe('repeated identical outcomes', () => {
  const spawnWatcher = (seq, minute) => rec(seq, minute, ACTIVITY_EVENTS.WAIT_LEASE_ACQUIRE, {
    cause: 'first-wait-for-this-run',
    evidence: { runId: 'verify-1', subject: 'npm exec vitest', pid: 5000 + seq, elapsedMs: seq * 1000 },
  })

  it('declares the session wedged after ten identical watcher spawns with no progress', () => {
    const records = Array.from({ length: 10 }, (_, i) => spawnWatcher(i + 1, i * 10))
    const verdict = repeatedOutcomeWedge({ records, progressAt: START - 60_000 })
    expect(verdict.wedged).toBe(true)
    expect(verdict.count).toBe(10)
    expect(verdict.session).toBe('owner')
    expect(verdict.sinceProgressMs).toBe(90 * 60_000 + 60_000)
  })

  it('ignores what differs only in pid and elapsed time, which every repeat does', () => {
    expect(outcomeSignature(spawnWatcher(1, 0))).toBe(outcomeSignature(spawnWatcher(9, 90)))
  })

  it('stays quiet below the threshold', () => {
    const records = Array.from({ length: WEDGE_REPEAT_THRESHOLD - 1 }, (_, i) => spawnWatcher(i + 1, i * 10))
    expect(repeatedOutcomeWedge({ records, progressAt: START - 60_000 }).wedged).toBe(false)
  })

  it('counts nothing that happened before the last observable progress', () => {
    const records = Array.from({ length: 10 }, (_, i) => spawnWatcher(i + 1, i * 10))
    expect(repeatedOutcomeWedge({ records, progressAt: START + 95 * 60_000 })).toMatchObject({ wedged: false, count: 0 })
  })

  it('does not merge two sessions repeating the same outcome into one wedge', () => {
    const records = [
      spawnWatcher(1, 0), spawnWatcher(2, 10),
      rec(3, 20, ACTIVITY_EVENTS.WAIT_LEASE_ACQUIRE, {
        session: 'other', cause: 'first-wait-for-this-run', evidence: { runId: 'verify-1', subject: 'npm exec vitest' },
      }),
      spawnWatcher(4, 30), spawnWatcher(5, 40),
    ]
    expect(repeatedOutcomeWedge({ records, progressAt: START - 60_000 }).count).toBe(2)
  })

  it('is not fooled by a session that varies what it does', () => {
    const records = [
      spawnWatcher(1, 0),
      rec(2, 10, ACTIVITY_EVENTS.FOREGROUND_ACTIVITY, { cause: 'tool', evidence: { tool: 'Bash' } }),
      spawnWatcher(3, 20),
      rec(4, 30, ACTIVITY_EVENTS.FOREGROUND_ACTIVITY, { cause: 'tool', evidence: { tool: 'Edit' } }),
    ]
    expect(repeatedOutcomeWedge({ records, progressAt: START - 60_000 }).wedged).toBe(false)
  })
})
