// POINT 373 IS DELIVERED BY A MEASUREMENT, not by a mechanism: "report the %/h rate
// for the first full day after the change against today's 1.25 %/h. The point counts
// as delivered when the rate is measured, not when the mechanism runs."
//
// So the aggregation has to be trustworthy, and the failure side is a number that
// LOOKS measured: a transcript repeats one turn's usage across its streamed lines, an
// idle night would dilute any per-hour rate to nothing, and a weighted sum invites
// being mistaken for a bill. Each of those is pinned here.
import { describe, it, expect } from 'vitest'
import {
  COST_WEIGHTS,
  LARGE_CONTEXT_TOKENS,
  IDLE_GAP_MS,
  turnCost,
  activeMs,
  measureCost,
  sessionProfile,
  derivedRate,
  projectSlug,
  mainCheckoutOf,
  transcriptCandidates,
  resolveTranscriptDir,
  LEGACY_TRANSCRIPT_SLUG,
} from './measure-context-cost-core.mjs'

const usage = (over = {}) => ({
  input_tokens: 1000,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  output_tokens: 0,
  ...over,
})
const NOW = 1_785_000_000_000
const MIN = 60_000

describe('turnCost — the context a turn ran in, and what it weighs', () => {
  it('adds every input kind into the CONTEXT, output excluded', () => {
    const c = turnCost(usage({ cache_read_input_tokens: 140_000, cache_creation_input_tokens: 9_000, output_tokens: 500 }))
    expect(c.contextTokens).toBe(150_000)
  })

  it('weights each kind by its published ratio to an input token', () => {
    expect(turnCost(usage()).weighted).toBe(1000 * COST_WEIGHTS.input)
    expect(turnCost(usage({ input_tokens: 0, cache_read_input_tokens: 1000 })).weighted).toBe(1000 * COST_WEIGHTS.cacheRead)
    expect(turnCost(usage({ input_tokens: 0, cache_creation_input_tokens: 1000 })).weighted).toBe(
      1000 * COST_WEIGHTS.cacheCreation,
    )
    expect(turnCost(usage({ input_tokens: 0, output_tokens: 1000 })).weighted).toBe(1000 * COST_WEIGHTS.output)
    // A cache read is the cheap one and an output token the dear one — if that order
    // ever inverts, the number has stopped meaning what the report says it means.
    expect(COST_WEIGHTS.cacheRead).toBeLessThan(COST_WEIGHTS.input)
    expect(COST_WEIGHTS.output).toBeGreaterThan(COST_WEIGHTS.cacheCreation)
  })

  it('treats missing, negative and junk fields as zero', () => {
    expect(turnCost({}).weighted).toBe(0)
    expect(turnCost().contextTokens).toBe(0)
    expect(turnCost({ input_tokens: -5, output_tokens: 'lots' }).weighted).toBe(0)
  })
})

describe('activeMs — an idle night is not work', () => {
  it('sums the gaps between consecutive turns', () => {
    expect(activeMs([NOW, NOW + MIN, NOW + 3 * MIN])).toBe(3 * MIN)
  })

  it('SKIPS a gap longer than the idle bound — otherwise a night halves every rate', () => {
    expect(activeMs([NOW, NOW + MIN, NOW + 9 * 3600_000, NOW + 9 * 3600_000 + MIN])).toBe(2 * MIN)
    expect(activeMs([NOW, NOW + IDLE_GAP_MS])).toBe(0)
    expect(activeMs([NOW, NOW + IDLE_GAP_MS - 1])).toBe(IDLE_GAP_MS - 1)
  })

  it('is order-insensitive, and a single turn spans no time', () => {
    expect(activeMs([NOW + 3 * MIN, NOW, NOW + MIN])).toBe(3 * MIN)
    expect(activeMs([NOW])).toBe(0)
    expect(activeMs([])).toBe(0)
    expect(activeMs()).toBe(0)
  })
})

describe('measureCost — before and after the moment the boundary first fired', () => {
  const turns = [
    // BEFORE: two big-context turns a minute apart.
    { at: NOW - 10 * MIN, usage: usage({ cache_read_input_tokens: 400_000 }) },
    { at: NOW - 9 * MIN, usage: usage({ cache_read_input_tokens: 400_000 }) },
    // AFTER: two small-context turns a minute apart.
    { at: NOW + MIN, usage: usage({ cache_read_input_tokens: 40_000 }) },
    { at: NOW + 2 * MIN, usage: usage({ cache_read_input_tokens: 40_000 }) },
  ]

  it('splits at the boundary moment, not at a calendar day', () => {
    const r = measureCost({ turns, boundaryAt: NOW })
    expect(r.before.turns).toBe(2)
    expect(r.after.turns).toBe(2)
    // A turn exactly AT the boundary counts as after.
    expect(measureCost({ turns: [{ at: NOW, usage: usage() }], boundaryAt: NOW }).after.turns).toBe(1)
  })

  it('reports the per-hour rate and the ratio between the two sides', () => {
    const r = measureCost({ turns, boundaryAt: NOW })
    expect(r.before.activeHours).toBe(0.02) // one minute, rounded for a report
    expect(r.after.weightedPerHour).toBeLessThan(r.before.weightedPerHour)
    expect(r.ratio).toBeCloseTo(r.after.weightedPerHour / r.before.weightedPerHour, 2)
  })

  it('reports the LARGE-CONTEXT share, which is the claim point 373 rests on', () => {
    const r = measureCost({
      turns: [
        { at: NOW + MIN, usage: usage({ cache_read_input_tokens: LARGE_CONTEXT_TOKENS }) },
        { at: NOW + 2 * MIN, usage: usage({ cache_read_input_tokens: 1000 }) },
      ],
      boundaryAt: NOW,
    })
    expect(r.after.largeShare).toBeGreaterThan(0.9)
    expect(LARGE_CONTEXT_TOKENS).toBe(150_000)
  })

  it('a side with no turns reports null rather than zero — absence is not a measurement', () => {
    const r = measureCost({ turns: [{ at: NOW + MIN, usage: usage() }], boundaryAt: NOW })
    expect(r.before.turns).toBe(0)
    expect(r.before.weightedPerHour).toBe(null)
    expect(r.before.largeShare).toBe(null)
    expect(r.ratio).toBe(null)
  })

  it('a side that spans NO active time reports null, not a division by zero', () => {
    const r = measureCost({ turns: [{ at: NOW + MIN, usage: usage() }], boundaryAt: NOW })
    expect(r.after.activeHours).toBe(0)
    expect(r.after.weightedPerHour).toBe(null)
  })

  it('ignores unusable records instead of counting them as free turns', () => {
    const r = measureCost({
      turns: [{ at: 'later', usage: usage() }, { at: NOW + MIN, usage: {} }, null],
      boundaryAt: NOW,
    })
    expect(r.after.turns).toBe(0)
    expect(() => measureCost()).not.toThrow()
  })
})

describe('sessionProfile — WHY the rate came out where it did', () => {
  const t = (at, session, context) => ({ at, session, usage: usage({ cache_read_input_tokens: context }) })

  it('reports each side\'s median and p90 peak context, and how many crossed the threshold', () => {
    const p = sessionProfile({
      turns: [
        t(NOW - MIN, 'old-a', 600_000),
        t(NOW - MIN, 'old-b', 700_000),
        t(NOW + MIN, 'new-a', 100_000),
        t(NOW + 2 * MIN, 'new-a', 200_000), // the PEAK is what counts, not the last turn
        t(NOW + MIN, 'new-b', 90_000),
      ],
      boundaryAt: NOW,
    })
    expect(p.before.sessions).toBe(2)
    expect(p.before.overLarge).toBe(1)
    expect(p.after.sessions).toBe(2)
    expect(p.after.medianPeak).toBe(201_000) // the cache read plus the turn's own input
    expect(p.after.overLarge).toBe(0.5)
  })

  it('a turn without a session id is not a session', () => {
    const p = sessionProfile({ turns: [{ at: NOW + MIN, usage: usage() }], boundaryAt: NOW })
    expect(p.after.sessions).toBe(0)
    expect(p.after.medianPeak).toBe(null)
    expect(() => sessionProfile()).not.toThrow()
  })
})

describe('derivedRate — the anchor is carried, never re-invented', () => {
  it('multiplies the point\'s own 1.25 %/h by the measured ratio', () => {
    expect(derivedRate({ ratio: 0.5 })).toEqual({ rate: 0.625, underCeiling: false })
    expect(derivedRate({ ratio: 0.4 })).toEqual({ rate: 0.5, underCeiling: true })
  })

  it('says nothing when there is no ratio — the quota is not in the transcript', () => {
    expect(derivedRate({ ratio: null })).toEqual({ rate: null, underCeiling: null })
    expect(derivedRate({ ratio: 0 }).rate).toBe(null)
    expect(derivedRate()).toEqual({ rate: null, underCeiling: null })
  })

  it('the ceiling it compares against is the one the point names', () => {
    expect(derivedRate({ ratio: 1, anchorRatePerHour: 0.6, fits: 0.6 }).underCeiling).toBe(true)
    expect(derivedRate({ ratio: 1.02, anchorRatePerHour: 0.6, fits: 0.6 }).underCeiling).toBe(false)
    // The measured reality on 30.07.2026: the boundary works, and it is not enough.
    expect(derivedRate({ ratio: 0.888 })).toEqual({ rate: 1.11, underCeiling: false })
  })
})

// THE MISS THAT READ AS A MEASUREMENT (07.08.2026): the folder was a hard-coded
// Windows slug, so on the Linux container the tool found nothing, printed `n/a`
// everywhere and exited 0. What is pinned here is that the folder is DERIVED and that
// finding none is a THROW.
describe('projectSlug — the harness key for a checkout path', () => {
  it('dashes every non-alphanumeric character and lowercases the drive letter', () => {
    expect(projectSlug('C:\\Users\\Patri\\Documents\\Developing\\hoa')).toBe(LEGACY_TRANSCRIPT_SLUG)
    expect(projectSlug('/workspace/hoa')).toBe('-workspace-hoa')
  })

  it('keeps a trailing separator as the trailing dash the harness would write', () => {
    expect(projectSlug('/workspace/hoa/')).toBe('-workspace-hoa-')
  })
})

describe('mainCheckoutOf — a worktree writes under the main checkout key', () => {
  it('strips the worktree suffix, with or without a trailing slash', () => {
    expect(mainCheckoutOf('/workspace/hoa/.claude/worktrees/agent-abc')).toBe('/workspace/hoa')
    expect(mainCheckoutOf('/workspace/hoa/.claude/worktrees/agent-abc/')).toBe('/workspace/hoa')
    expect(mainCheckoutOf('C:\\repo\\.claude\\worktrees\\agent-abc')).toBe('C:/repo')
  })

  it('is null for a plain checkout — there is nothing above it', () => {
    expect(mainCheckoutOf('/workspace/hoa')).toBe(null)
    expect(mainCheckoutOf('')).toBe(null)
  })
})

describe('transcriptCandidates — derived, most specific first', () => {
  const join = (a, b) => `${a}/${b}`

  it('offers the checkout slug, then the legacy folder', () => {
    expect(transcriptCandidates({ repoRoot: '/workspace/hoa', projectsDir: '/p', join })).toEqual([
      '/p/-workspace-hoa',
      `/p/${LEGACY_TRANSCRIPT_SLUG}`,
    ])
  })

  it('offers a trailing-dash slug AND its stripped form — both directories exist for real', () => {
    const got = transcriptCandidates({ repoRoot: '/workspace/hoa/', projectsDir: '/p', join })
    expect(got.slice(0, 2)).toEqual(['/p/-workspace-hoa-', '/p/-workspace-hoa'])
  })

  it('adds the main checkout behind a worktree, and repeats no candidate', () => {
    const got = transcriptCandidates({
      repoRoot: '/workspace/hoa/.claude/worktrees/agent-abc/',
      projectsDir: '/p',
      join,
    })
    expect(got).toContain('/p/-workspace-hoa')
    expect(new Set(got).size).toBe(got.length)
  })
})

describe('resolveTranscriptDir — looks, and refuses to guess', () => {
  it('resolves to the one candidate that HOLDS transcripts', () => {
    const candidates = ['/p/empty', '/p/real', '/p/also-real']
    expect(resolveTranscriptDir(candidates, (d) => d === '/p/real' || d === '/p/also-real')).toBe('/p/real')
  })

  it('THROWS when no candidate holds one, naming every path tried', () => {
    const candidates = ['/p/a', '/p/b']
    expect(() => resolveTranscriptDir(candidates, () => false)).toThrow(/\/p\/a[\s\S]*\/p\/b/)
    expect(() => resolveTranscriptDir(candidates, () => false)).toThrow(/MEASURE_TRANSCRIPTS_DIR/)
  })

  it('skips a candidate that exists but holds nothing — that was the old silent zero', () => {
    // `/p/stale` is a real directory to the probe's caller; only "holds a transcript"
    // may decide, so the resolver walks past it to the folder that does.
    expect(resolveTranscriptDir(['/p/stale', '/p/real'], (d) => d === '/p/real')).toBe('/p/real')
  })

  it('throws on an empty candidate list rather than returning nothing', () => {
    expect(() => resolveTranscriptDir([], () => true)).toThrow(/no candidates/)
  })
})
