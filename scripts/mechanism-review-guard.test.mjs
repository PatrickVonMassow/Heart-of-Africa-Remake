// The two pieces of the mechanism gate's WRAPPER that decide what gets judged
// at all, and that a spawned-hook case cannot pin cheaply: which baseline a
// branch is measured against, and where a tree with no baseline starts.
//
// Both were caught live rather than by reading: the fork-point lookup silently
// fell back to HEAD on Windows and grandfathered the branch's own work — the
// gate reported "GATE CLEAR" on four unreviewed mechanism commits.
import { describe, it, expect } from 'vitest'
import { attachCoverage, baselineFor, bootstrapBase } from './mechanism-review-guard.mjs'

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

// THE COST RULE (point 387): this probe walks real git history from the unit
// layer, and it is bounded by CONSTRUCTION, not by a timeout. It once cost one
// git process per (commit, record) PAIR — ~700 processes, 26–38 s past its own
// budget — so CI failed on every push of a guard branch and mailed the
// repository owner thirteen times through the night while the tree was green
// locally. Its budget had already been raised once; the second raise would have
// hidden it again. So the CALL COUNT is asserted, not the wall clock.
describe('attachCoverage', () => {
  const ledger = (n) => Array.from({ length: n }, (_, i) => ({ sha: `rec${i}` }))

  it('costs ONE git call per branch record, never one per (commit, record) pair', () => {
    const asked = []
    const pendingCommits = Array.from({ length: 13 }, (_, i) => ({ sha: `c${i}` }))
    // 52 records in the ledger, of which 3 sit on this branch. The pairwise form
    // would have been 13 × 52 = 676 calls — the shape that broke the night.
    const onBranch = ['rec0', 'rec7', 'rec51']
    attachCoverage({
      pendingCommits,
      allRecords: ledger(52),
      head: 'head',
      revList: (rev) => {
        asked.push(rev)
        if (rev === 'head') return [...pendingCommits.map((c) => c.sha), ...onBranch].join('\n')
        return onBranch.includes(rev) ? 'c0\nc1' : ''
      },
    })
    expect(asked).toEqual(['head', ...onBranch])
    expect(asked.length).toBe(1 + onBranch.length)
  })

  it('still answers what the pairwise probe answered', () => {
    const pendingCommits = [{ sha: 'c0' }, { sha: 'c1' }, { sha: 'c2' }]
    const records = attachCoverage({
      pendingCommits,
      allRecords: [{ sha: 'recA' }, { sha: 'recB' }, { sha: 'recOld' }],
      head: 'head',
      revList: (rev) =>
        ({
          head: 'c0\nc1\nc2\nrecA\nrecB',
          recA: 'c0\nc1',
          recB: 'c1',
        })[rev] ?? '',
    })
    // recOld lies at or before the baseline, so it can cover nothing and is
    // never asked about.
    expect(records.map((r) => r.sha)).toEqual(['recA', 'recB'])
    expect(pendingCommits.map((c) => c.coveringRecordShas)).toEqual([['recA'], ['recA', 'recB'], []])
  })

  it('asks git NOTHING when no mechanism commit is pending — the common turn', () => {
    const asked = []
    expect(
      attachCoverage({
        pendingCommits: [],
        allRecords: ledger(52),
        head: 'head',
        revList: (rev) => {
          asked.push(rev)
          return ''
        },
      }),
    ).toEqual([])
    expect(asked).toEqual([])
  })
})
