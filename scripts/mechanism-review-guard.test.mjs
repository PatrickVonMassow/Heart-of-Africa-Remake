// The two pieces of the mechanism gate's WRAPPER that decide what gets judged
// at all, and that a spawned-hook case cannot pin cheaply: which baseline a
// branch is measured against, and where a tree with no baseline starts.
//
// Both were caught live rather than by reading: the fork-point lookup silently
// fell back to HEAD on Windows and grandfathered the branch's own work — the
// gate reported "GATE CLEAR" on four unreviewed mechanism commits.
import { describe, it, expect } from 'vitest'
import { baselineFor, bootstrapBase } from './mechanism-review-guard.mjs'

describe('baselineFor', () => {
  const state = { baselines: { main: 'aaa', 'feat/x': 'bbb' } }

  it('prefers the branch’s own confirmed baseline', () => {
    expect(baselineFor(state, 'feat/x')).toBe('bbb')
  })

  it('falls back to main for a branch that has none', () => {
    // Without this a fresh feature branch would judge itself against its own
    // HEAD and grandfather the mechanism it just added.
    expect(baselineFor(state, 'feat/new')).toBe('aaa')
  })

  it('reads the legacy scalar, and answers null when there is nothing', () => {
    expect(baselineFor({ baseline: 'ccc' }, 'feat/new')).toBe('ccc')
    expect(baselineFor({}, 'main')).toBe(null)
    expect(baselineFor(undefined, 'main')).toBe(null)
  })
})

describe('bootstrapBase', () => {
  it('QUOTES the revision — cmd.exe eats a bare ^ and the gate then armed at HEAD', () => {
    // The regression, exactly: `main^{commit}` reached git as `main{commit}`,
    // every lookup failed, and the fallback below silently grandfathered a whole
    // branch. Asserting the argument pins it without needing a repository.
    const asked = []
    const head = 'headsha'
    expect(
      bootstrapBase(head, (rev) => {
        asked.push(rev)
        throw new Error('no such ref')
      }),
    ).toBe(head)
    expect(asked[0]).toContain('"main^{commit}"')
    expect(asked[1]).toContain('"origin/main^{commit}"')
  })

  it('falls back to HEAD when no integration branch resolves', () => {
    // The grandfathering the point asks for: a checkout with no main to fork
    // from owes nothing for its history.
    expect(bootstrapBase('headsha', () => '')).toBe('headsha')
  })
})
