import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACTIVITY_CLASSES, classifyTimeline, commitGapSummary, evidenceInterval, timelineTotals } from './batch-standstill-core.mjs'
import {
  autostartEvidence,
  autostartLastEvidence,
  boundaryMarkerEvidence,
  markerBoundary,
  pauseMarkerEvidence,
  transcriptEvidence,
} from './batch-standstill-inputs.mjs'
import { parseWindow, renderStandstillReport } from './batch-standstill-report.mjs'

describe('standstill report inputs', () => {
  it('pairs only timestamped tool calls, not heartbeat-like transcript lines', () => {
    const rows = [
      { timestamp: '2026-08-21T08:00:00.000Z', type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash' }] } },
      { timestamp: '2026-08-21T08:00:05.000Z', type: 'progress', message: { content: [] } },
      { timestamp: '2026-08-21T08:01:00.000Z', type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] } },
    ]
    const result = transcriptEvidence(rows.map((row) => JSON.stringify(row)).join('\n'), { session: 's1' })
    expect(result.intervals).toEqual([
      expect.objectContaining({ start: Date.parse(rows[0].timestamp), end: Date.parse(rows[2].timestamp), className: ACTIVITY_CLASSES.FOREGROUND }),
    ])
  })

  it('uses a launcher no-owner skip as no-worker state only until the next event', () => {
    const parsed = autostartEvidence([
      '2026-08-21T08:00:00.000Z skip: no owner lock and no live batch-writer process measured',
      '2026-08-21T08:15:00.000Z RESUMING: launching claude',
    ].join('\n'), { end: Date.parse('2026-08-21T08:30:00Z') })
    expect(parsed.intervals).toEqual([expect.objectContaining({
      start: Date.parse('2026-08-21T08:00:00Z'), end: Date.parse('2026-08-21T08:15:00Z'), state: 'no-worker',
    })])
  })

  it('reads exact writer identity and bounds from autostart-last', () => {
    const at = Date.parse('2026-08-21T08:15:29Z')
    const lastWrite = Date.parse('2026-08-21T07:08:03Z')
    const parsed = autostartLastEvidence(JSON.stringify({
      at,
      measured: { batchWriters: [{
        sessionId: '593e0d2f', pid: 2156063, recordedStartedAt: 1000,
        sameProcess: true, recentWrite: true, batchWriterAt: lastWrite,
      }] },
    }))
    expect(parsed.boundaries).toEqual([at])
    expect(parsed.intervals).toEqual([expect.objectContaining({
      start: at,
      end: Date.parse('2026-08-21T09:08:03Z'),
      className: ACTIVITY_CLASSES.BLOCKED_WRITER_VETO,
    })])
    expect(markerBoundary(JSON.stringify({ at }))).toEqual([at])
  })

  it('turns committed boundaries and pause markers into explicit state', () => {
    const start = Date.parse('2026-08-21T08:00:00Z')
    const end = start + 60 * 60_000
    expect(boundaryMarkerEvidence(JSON.stringify({
      at: start, phase: 'committed', cause: 'point', sessionId: 's1', point: 809,
    }), { end }).intervals).toEqual([
      expect.objectContaining({ start, end, className: ACTIVITY_CLASSES.HANDOVER }),
    ])
    const pause = pauseMarkerEvidence('reason: asked to stop\ncause: user-stop\nretry-after: never\n', { start, end })
    expect(pause.intervals).toEqual([
      expect.objectContaining({ start, end, className: ACTIVITY_CLASSES.BLOCKED_USER, cause: 'user-stop' }),
    ])
  })

  it('renders threshold, evidence, totals, and UTC bounds', () => {
    const start = Date.parse('2026-08-21T08:00:00Z')
    const report = {
      window: { start, end: start + 3600_000 }, threshold: { ms: 1200_000, reason: 'fixture reason' },
      inputs: { journal: '/journal' }, commitGaps: { commits: 2, gaps: [{}], gapMs: 3600_000 },
      reportedIntervals: [{ start, end: start + 3600_000, durationMs: 3600_000, className: 'unknown', cause: 'missing-evidence', evidence: {} }],
      totals: { elapsedMs: 3600_000, byClass: { unknown: 3600_000 } }, removalCandidates: [],
      inputHealth: { rejectedJournalLines: [] },
    }
    const text = renderStandstillReport(report)
    expect(text).toContain('2026-08-21T08:00:00.000Z')
    expect(text).toContain('Threshold: 20 minutes — fixture reason')
    expect(text).toContain('unknown: 1h 00m 00s (100.00%)')
    expect(text).toContain('missing-evidence')
  })

  it('parses relative day windows against the chosen end', () => {
    expect(parseWindow('14d', 14 * 86_400_000)).toBe(0)
    expect(parseWindow('1h', 3_600_000)).toBe(0)
  })
})

describe('the measured 21.08.2026 incident', () => {
  const start = Date.parse('2026-08-21T08:15:29Z')
  const vetoEnd = Date.parse('2026-08-21T09:08:03Z')
  const end = Date.parse('2026-08-21T09:14:05Z')
  const intervals = [
    evidenceInterval({
      start, end: vetoEnd, className: ACTIVITY_CLASSES.BLOCKED_WRITER_VETO, source: 'historical-fixture',
      cause: 'stale-writer-veto', evidence: { writerSession: '593e0d2f', pid: 2156063, lastFencedOperationAt: Date.parse('2026-08-21T07:08:03Z'), blockedUntil: vetoEnd },
    }),
    evidenceInterval({
      start: vetoEnd, end, className: ACTIVITY_CLASSES.HANDOVER, source: 'historical-fixture',
      cause: 'scheduler-delay', evidence: { successorClaimedAt: end },
    }),
  ]

  it('separates the stale writer veto and the remaining scheduler delay exactly', () => {
    const timeline = classifyTimeline({ start, end, intervals, journalStartedAt: start })
    expect(timeline.map(({ className, durationMs }) => ({ className, durationMs }))).toEqual([
      { className: ACTIVITY_CLASSES.BLOCKED_WRITER_VETO, durationMs: 3_154_000 },
      { className: ACTIVITY_CLASSES.HANDOVER, durationMs: 362_000 },
    ])
    expect(timelineTotals(timeline).elapsedMs).toBe(end - start)
    expect(timeline.every((item) => ![ACTIVITY_CLASSES.FOREGROUND, ACTIVITY_CLASSES.DELEGATED, ACTIVITY_CLASSES.VERIFICATION].includes(item.className))).toBe(true)
  })
})

describe('the measured four-day fixture', () => {
  it('keeps 588 commits, 65 gaps, 48.8 hours, and classifies every millisecond', () => {
    const fixture = JSON.parse(readFileSync(join(process.cwd(), 'scripts', 'fixtures', 'standstill-four-day.json'), 'utf8'))
    const smallCount = fixture.commits - 1 - fixture.gapDurationsMs.length
    const smallTotal = fixture.end - fixture.start - fixture.gapMs
    const baseSmall = Math.floor(smallTotal / smallCount)
    const remainder = smallTotal - baseSmall * smallCount
    const durations = [
      ...fixture.gapDurationsMs,
      ...Array.from({ length: smallCount }, (_, index) => baseSmall + (index < remainder ? 1 : 0)),
    ]
    const commits = [fixture.start]
    for (const duration of durations) commits.push(commits.at(-1) + duration)
    const gaps = commitGapSummary(commits, fixture.thresholdMs)
    expect(commits).toHaveLength(588)
    expect(commits.at(-1)).toBe(fixture.end)
    expect(gaps.gaps).toHaveLength(65)
    expect(gaps.gapMs).toBe(175_522_000)
    expect((gaps.gapMs / 3600_000).toFixed(1)).toBe('48.8')
    expect(Object.values(fixture.classifiedMs).reduce((sum, value) => sum + value, 0)).toBe(fixture.end - fixture.start)
  })
})
