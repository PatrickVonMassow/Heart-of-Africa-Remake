import { describe, expect, it } from 'vitest'
import { activityRecord, ACTIVITY_EVENTS } from './batch-activity-journal-core.mjs'
import { baselineReportFromHistory } from './batch-baseline-core.mjs'

const at = (iso) => Date.parse(iso)
const day = '2026-08-28'
const handoverOne = at('2026-08-28T08:10:00.000Z')
const handoverTwo = at('2026-08-28T18:20:00.000Z')
const usage = (tokens) => ({ input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: tokens, output_tokens: 1 })

describe('today-path baseline recorder', () => {
  it('reproduces both compared figures from measured-history fixtures', () => {
    const activityText = [
      activityRecord({ seq: 1, at: handoverOne, event: ACTIVITY_EVENTS.HANDOVER, session: 's1', cause: 'point-boundary' }),
      activityRecord({ seq: 2, at: handoverTwo, event: ACTIVITY_EVENTS.HANDOVER, session: 's2', cause: 'context-boundary' }),
    ].map(JSON.stringify).join('\n')
    const boundaryText = `[2026-08-28T08:10:00.000Z] HANDOVER point 901 by s1\n`
    const report = baselineReportFromHistory({
      day,
      activityText,
      boundaryText,
      turns: [
        { at: handoverOne - 1000, session: 's1', scope: 'top-level', usage: usage(100_000) },
        { at: handoverOne + 1000, session: 's1', scope: 'top-level', usage: usage(999_999) },
        { at: handoverTwo - 1000, session: 's2', scope: 'top-level', usage: usage(200_000) },
        { at: handoverTwo - 500, session: 's2/agent-a', scope: 'subagent', usage: usage(777_777) },
      ],
      commits: [
        { sha: 'a', at: at('2026-08-28T09:00:00.000Z'), subject: "Merge branch 'feat/901-one'" },
        { sha: 'b', at: at('2026-08-28T12:00:00.000Z'), subject: "Merge branch 'feat/902-two'" },
        { sha: 'c', at: at('2026-08-28T13:00:00.000Z'), subject: "Merge branch 'feat/901-followup'" },
        { sha: 'd', at: at('2026-08-29T00:00:00.000Z'), subject: "Merge branch 'feat/903-outside'" },
      ],
      sources: { activityJournal: '.claude/batch-activity.jsonl', firstParentRef: 'main', boundaryLog: '.claude/boundary.log', sessionTranscripts: ['s1.jsonl', 's2.jsonl'] },
    })
    expect(report).toMatchObject({
      ok: true,
      kind: 'baseline',
      day,
      medianHandoverContext: 100_000,
      pointsLanded: 2,
      pointsPerDay: 2,
      sourceHealth: { handoversRead: 2, handoversMatched: 2 },
    })
    expect(report.contextSamples.map((sample) => sample.tokens)).toEqual([100_000, 200_000])
    expect(report.sourceHealth.firstParentLandingPoints.map((row) => row.point)).toEqual([901, 902])
  })

  it('refuses a day whose history cannot measure handover context', () => {
    expect(baselineReportFromHistory({ day, commits: [] })).toMatchObject({ ok: false })
  })
})
