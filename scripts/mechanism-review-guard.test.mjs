// The two pieces of the mechanism gate's WRAPPER that decide what gets judged
// at all, and that a spawned-hook case cannot pin cheaply: which baseline a
// branch is measured against, and where a tree with no baseline starts.
//
// Both were caught live rather than by reading: the fork-point lookup silently
// fell back to HEAD on Windows and grandfathered the branch's own work — the
// gate reported "GATE CLEAR" on four unreviewed mechanism commits.
import { describe, it, expect } from 'vitest'
import { attachCoverage, baselineFor, bootstrapBase, parseMechanismLog } from './mechanism-review-guard.mjs'

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

// THE LOG PARSE IS THE GATE'S VIEW OF THE TREE, and two of its old habits each
// blinded it to a legal path (cross-vendor review, second and third rounds):
// trimming a line turned `…/check ` into `…/check`, so a pass record naming the
// trimmed spelling satisfied the union without naming the changed file; and
// splitting the whole log on the `__C__` sentinel cut a commit in half wherever
// a path carried that legal substring.
describe('parseMechanismLog', () => {
  const SHA = 'a'.repeat(40)
  const SHB = 'b'.repeat(40)
  const header = (sha, trailers = 'Claude Opus 5 <noreply@anthropic.com>') =>
    `__C__${sha}__F__1723000000__F__A subject__F__${trailers}`
  const files = ['x-guard.mjs']

  it('keeps a path with a trailing space BYTE-EXACT, never its trimmed spelling', () => {
    const out = [header(SHA), '', 'scripts/git-hooks/check ', ''].join('\n')
    const commits = parseMechanismLog(out, files)
    expect(commits).toHaveLength(1)
    expect(commits[0].files).toEqual(['scripts/git-hooks/check '])
    expect(commits[0].files).not.toContain('scripts/git-hooks/check')
    expect(commits[0]).toMatchObject({
      sha: SHA,
      subject: 'A subject',
      authorModel: 'Claude Opus 5 <noreply@anthropic.com>',
    })
  })

  it('keeps a leading space too, and strips only a trailing carriage return', () => {
    const out = [header(SHA), '', 'scripts/git-hooks/ lead\r', ''].join('\n')
    expect(parseMechanismLog(out, files)[0].files).toEqual(['scripts/git-hooks/ lead'])
  })

  it('does not cut a commit in half on a path containing the record sentinel', () => {
    const out = [header(SHA), '', 'scripts/git-hooks/x__C__y', 'scripts/x-guard.mjs', ''].join('\n')
    const commits = parseMechanismLog(out, files)
    expect(commits).toHaveLength(1)
    expect(commits[0].files).toEqual(['scripts/git-hooks/x__C__y', 'scripts/x-guard.mjs'])
  })

  it('unquotes the path git QUOTED, exactly as the pass records spell it', () => {
    const out = [header(SHA), '', '"scripts/git-hooks/we\\tird"', ''].join('\n')
    expect(parseMechanismLog(out, files)[0].files).toEqual(['scripts/git-hooks/we\tird'])
  })

  it('separates commits by the full header shape and skips the non-mechanism ones', () => {
    const out = [
      header(SHA),
      '',
      'src/App.tsx',
      header(SHB, 'Claude Fable 5 <noreply@anthropic.com>;GPT-5.6 Sol <noreply@openai.com>'),
      '',
      'scripts/x-guard.mjs',
      '',
    ].join('\n')
    const commits = parseMechanismLog(out, files)
    expect(commits).toHaveLength(1)
    expect(commits[0].sha).toBe(SHB)
    expect(commits[0].authorModels).toEqual([
      'Claude Fable 5 <noreply@anthropic.com>',
      'GPT-5.6 Sol <noreply@openai.com>',
    ])
  })

  it('parses nothing from an empty or fileless log', () => {
    expect(parseMechanismLog('', files)).toEqual([])
    expect(parseMechanismLog(`${header(SHA)}\n`, files)).toEqual([])
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
