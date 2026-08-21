import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_CLASSES,
  classifyTimeline,
  commitGapSummary,
  evidenceInterval,
  journalIntervals,
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

  it('makes a launcher skip with no owner no-worker standstill', () => {
    const skip = evidenceInterval({
      start: START, end: START + 20 * 60_000, className: null, state: 'no-worker',
      cause: 'launcher-skip', evidence: { owner: null },
    })
    expect(classifyTimeline({ start: START, end: START + 20 * 60_000, intervals: [skip], journalStartedAt: START })[0].className).toBe(ACTIVITY_CLASSES.NO_WORKER)
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

