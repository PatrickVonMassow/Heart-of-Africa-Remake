// The criticality four-eyes gate, pinned (work-order point 298).
//
// Two halves are tested here because two different mistakes live in them: the
// TAG READER (which points does this gate even judge — a wrong answer either
// blocks every tick or none) and the LEDGER READER (was the second model's
// review real, in this history, and were its findings answered).
import { describe, it, expect } from 'vitest'
import {
  CLEARING_VERDICT,
  criticalityOf,
  evaluateCriticalityReview,
  formatCriticalityReviewVerdict,
  highTicks,
  newlyTicked,
  parsePointBlocks,
  tickedNumbers,
} from './criticality-review-guard-core.mjs'

const OPUS = 'Claude Opus 5'
const FABLE = 'Fable 5'

/** One work-order point block, as TASKS.md/the archive really write them. */
const point = (n, { done = false, body = 'DOES A THING', tail = '' } = {}) =>
  `- [ ] ${n}. ${body}\n  spec prose over\n  more than one line.${tail ? `\n  ${tail}` : ''}\n`.replace(
    '- [ ]',
    done ? '- [x]' : '- [ ]',
  )

const record = (over = {}) => ({
  point: 500,
  sha: 'a'.repeat(40),
  model: FABLE,
  authoredBy: OPUS,
  verdict: CLEARING_VERDICT,
  evidence: 'read the core and ran the gate against a synthetic tick',
  at: 1_787_000_000_000,
  reachable: true,
  descendsFrom: [],
  ...over,
})

const tick = (number = 500, rationale = 'a must-work guard') => ({ number, rationale })

describe('parsePointBlocks', () => {
  it('keeps each point’s whole body and stops at the next point', () => {
    const text = `${point(1)}\n${point(2, { done: true })}`
    const blocks = parsePointBlocks(text)
    expect(blocks.map((b) => [b.n, b.done])).toEqual([
      [1, false],
      [2, true],
    ])
    expect(blocks[0].body).toContain('more than one line')
    expect(blocks[0].body).not.toContain('- [x] 2.')
  })

  it('ends a block at a section heading, so the closing section is nobody’s body', () => {
    const blocks = parsePointBlocks(`${point(7)}\n## Closing (only after all points)\n\nnot point 7.\n`)
    expect(blocks[0].body).not.toContain('not point 7')
  })
})

describe('criticalityOf', () => {
  it('reads the tag at the start of a line', () => {
    expect(criticalityOf('  Criticality: high (the carrier outlives the session).')).toEqual({
      level: 'high',
      rationale: '(the carrier outlives the session).',
    })
  })

  it('reads it MID-LINE too — the corpus writes it both ways', () => {
    expect(criticalityOf('…in the same commit as in point 535. Criticality: medium.').level).toBe('med')
  })

  it('normalises medium to med and is case-insensitive', () => {
    expect(criticalityOf('criticality: MEDIUM').level).toBe('med')
    expect(criticalityOf('CRITICALITY: High').level).toBe('high')
  })

  it('SKIPS a quoted occurrence — point 298 quotes the convention it defines', () => {
    // Reading the quotation as a tag would have the gate judge a point by a
    // sentence ABOUT the tag rather than by its own triage.
    const body = 'a CRITICALITY tag convention on TASKS points ("Criticality: low|med|high" + a rationale)'
    expect(criticalityOf(body).level).toBe(null)
  })

  it('lets the LAST real tag win — the tag is written at the end of a spec', () => {
    expect(criticalityOf('Criticality: low in isolation.\nmore.\nCriticality: high (it gates merges).').level).toBe(
      'high',
    )
  })

  it('answers null for no tag and for a malformed one — the fail-open direction', () => {
    // The overwhelming majority of points predate the convention; a gate that
    // blocked on an untagged or mistyped tick would fire on every one of them.
    expect(criticalityOf('no tag anywhere in this spec').level).toBe(null)
    expect(criticalityOf('Criticality: catastrophic').level).toBe(null)
    expect(criticalityOf(undefined).level).toBe(null)
  })
})

describe('newlyTicked', () => {
  const openTasks = point(500, { tail: 'Criticality: high (a must-work guard).' })
  const archived = point(500, { done: true, tail: 'Criticality: high (a must-work guard).' })

  it('sees the point that moved from open to archived', () => {
    expect(
      newlyTicked({ baseTasks: openTasks, baseArchive: '', headTasks: '', headArchive: archived }),
    ).toEqual([500])
  })

  it('does not re-report a point that was already done at the baseline', () => {
    expect(
      newlyTicked({ baseTasks: '', baseArchive: archived, headTasks: '', headArchive: archived }),
    ).toEqual([])
  })

  it('sees a tick left standing in TASKS.md too', () => {
    // tasks-archive-guard owns that hygiene; this gate only needs to know the
    // point went from open to done, wherever the tick was written.
    expect(
      newlyTicked({ baseTasks: openTasks, baseArchive: '', headTasks: archived, headArchive: '' }),
    ).toEqual([500])
  })

  it('reports nothing when the baseline already knows everything', () => {
    expect(tickedNumbers(archived)).toEqual(new Set([500]))
    expect(newlyTicked({})).toEqual([])
  })
})

describe('highTicks', () => {
  const base = { baseTasks: point(500) + point(501) + point(502), baseArchive: '' }

  it('returns only the HIGH ones, with their rationale', () => {
    const headArchive =
      point(500, { done: true, tail: 'Criticality: high (a must-work guard).' }) +
      point(501, { done: true, tail: 'Criticality: med.' }) +
      point(502, { done: true, tail: 'Criticality: low, frequency HIGH.' })
    expect(highTicks({ ...base, headArchive })).toEqual([
      { number: 500, level: 'high', rationale: '(a must-work guard).' },
    ])
  })

  it('ignores an untagged tick', () => {
    expect(highTicks({ ...base, headArchive: point(500, { done: true }) })).toEqual([])
  })
})

describe('evaluateCriticalityReview', () => {
  it('owes nothing without a baseline — the gate audits from now on, not history', () => {
    const v = evaluateCriticalityReview({ baseline: null, ticks: [tick()], records: [] })
    expect(v).toMatchObject({ block: false, bootstrap: true })
  })

  it('BLOCKS a high tick with no review at all', () => {
    const v = evaluateCriticalityReview({ baseline: 'b', ticks: [tick()], records: [] })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('no-review')
    expect(formatCriticalityReviewVerdict(v)).toContain('point 500')
    expect(formatCriticalityReviewVerdict(v)).toContain('--point <N>')
  })

  it('ALLOWS a high tick cleared by a different model', () => {
    const v = evaluateCriticalityReview({ baseline: 'b', ticks: [tick()], records: [record()] })
    expect(v).toMatchObject({ block: false, clear: true })
    expect(formatCriticalityReviewVerdict(v)).toBe('')
  })

  it('ALLOWS a tick that is not tagged high — it never reaches the gate', () => {
    // `ticks` is already the HIGH set; a low/med point simply is not in it.
    expect(evaluateCriticalityReview({ baseline: 'b', ticks: [], records: [] }).block).toBe(false)
  })

  it('treats a record OUTSIDE the millisecond timestamp domain as no review at all (round-6 pass 1)', () => {
    // Removing ledgerAtUsable from the filter must redden this: at:null, at:1
    // and a seconds-scale epoch each lose every later-than comparison, so a
    // refusal dated that way could read as answered by an earlier merge.
    for (const at of [null, undefined, 'unknown', 1, 1_787_027_296, 4_102_444_800_001]) {
      const v = evaluateCriticalityReview({
        baseline: 'b',
        head: 'h',
        ticks: [tick()],
        records: [{ ...record({ verdict: 'merge' }), at }],
      })
      expect(v.block, `at=${String(at)}`).toBe(true)
      expect(v.findings[0].kind).toBe('no-review')
    }
  })

  it('a malformed-timestamp REFUSAL poisons the point — a valid merge cannot clear past it (final round)', () => {
    // The suppression path: the bad-at do-not-merge vanished from wellFormed,
    // the valid merge stood alone, and the high point cleared.
    const v = evaluateCriticalityReview({
      baseline: 'b',
      head: 'h',
      ticks: [tick()],
      records: [
        record({ verdict: 'merge', at: 1_787_000_002_000 }),
        { ...record({ verdict: 'do-not-merge' }), at: 1 },
      ],
    })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('malformed-record')
    expect(formatCriticalityReviewVerdict(v)).toContain('cannot be ORDERED')
  })

  it('BLOCKS on a self-review — a green ledger is worse than an empty one', () => {
    const v = evaluateCriticalityReview({
      baseline: 'b',
      ticks: [tick()],
      records: [record({ model: 'Claude Opus 5', authoredBy: 'Claude Opus 5' })],
    })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('self-review')
  })

  it('BLOCKS on a review recorded against a commit that is not in this history', () => {
    const v = evaluateCriticalityReview({
      baseline: 'b',
      ticks: [tick()],
      records: [record({ reachable: false })],
    })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('not-in-history')
    expect(formatCriticalityReviewVerdict(v)).toContain('not in this history')
  })

  it('BLOCKS on a lone do-not-merge — the case that was measured on 30.07.2026', () => {
    // The review outlived its author: the verdict landed after the agent had
    // stopped, and the branch looked reviewed. A refusal in the ledger must
    // therefore be as loud as no record at all.
    const v = evaluateCriticalityReview({
      baseline: 'b',
      ticks: [tick()],
      records: [record({ verdict: 'do-not-merge', evidence: 'two blockers, one reddens the unit gate' })],
    })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('unresolved')
    expect(formatCriticalityReviewVerdict(v)).toContain('not advisory')
  })

  it('BLOCKS on a lone merge-with-fixes — stricter than the mechanism gate, deliberately', () => {
    const v = evaluateCriticalityReview({
      baseline: 'b',
      ticks: [tick()],
      records: [record({ verdict: 'merge-with-fixes' })],
    })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('unresolved')
  })

  it('ALLOWS once a later merge on a DESCENDANT commit answers the refusal', () => {
    const refused = record({ sha: 'a'.repeat(40), verdict: 'do-not-merge', at: 1_787_000_001_000 })
    const answered = record({ sha: 'b'.repeat(40), verdict: 'merge', at: 1_787_000_002_000, descendsFrom: ['a'.repeat(40)] })
    const v = evaluateCriticalityReview({ baseline: 'b', ticks: [tick()], records: [refused, answered] })
    expect(v.block).toBe(false)
  })

  it('BLOCKS when the later merge judges the SAME commit — nothing was fixed between them', () => {
    const refused = record({ sha: 'a'.repeat(40), verdict: 'do-not-merge', at: 1_787_000_001_000 })
    const rerun = record({ sha: 'a'.repeat(40), verdict: 'merge', at: 1_787_000_002_000, descendsFrom: [] })
    const v = evaluateCriticalityReview({ baseline: 'b', ticks: [tick()], records: [refused, rerun] })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('unanswered')
    expect(formatCriticalityReviewVerdict(v)).toContain('LATER commit')
  })

  it('BLOCKS when the answering merge is older in time than the refusal it claims to answer', () => {
    const refused = record({ sha: 'b'.repeat(40), verdict: 'do-not-merge', at: 1_787_000_003_000 })
    const stale = record({ sha: 'a'.repeat(40), verdict: 'merge', at: 1_787_000_001_000 })
    // `stale` sits BELOW the refusal in history, so it cannot descend from it.
    const v = evaluateCriticalityReview({ baseline: 'b', ticks: [tick()], records: [refused, stale] })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('unanswered')
  })

  it('ignores a record for another point', () => {
    const v = evaluateCriticalityReview({
      baseline: 'b',
      ticks: [tick(500)],
      records: [record({ point: 501 })],
    })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('no-review')
  })

  it('ignores a half-written ledger line rather than clearing on it', () => {
    const v = evaluateCriticalityReview({
      baseline: 'b',
      ticks: [tick()],
      records: [record({ verdict: 'looks fine' }), record({ model: '  ' })],
    })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('no-review')
  })

  it('reports EVERY offending point, not just the first', () => {
    const v = evaluateCriticalityReview({
      baseline: 'b',
      ticks: [tick(500), tick(501)],
      records: [],
    })
    expect(v.findings).toHaveLength(2)
    const text = formatCriticalityReviewVerdict(v)
    expect(text).toContain('point 500')
    expect(text).toContain('point 501')
  })
})
