// The two pieces of the mechanism gate's WRAPPER that decide what gets judged
// at all, and that a spawned-hook case cannot pin cheaply: which baseline a
// branch is measured against, and where a tree with no baseline starts.
//
// Both were caught live rather than by reading: the fork-point lookup silently
// fell back to HEAD on Windows and grandfathered the branch's own work — the
// gate reported "GATE CLEAR" on four unreviewed mechanism commits.
import { describe, it, expect } from 'vitest'
import {
  attachCoverage,
  baselineFor,
  bootstrapBase,
  mechanismLogCommand,
  parseMechanismLog,
  rangeFilesCommand,
} from './mechanism-review-guard.mjs'

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
  // The sentinels are CONTROL BYTES (round-4 pass 3): raw 0x1E/0x1F cannot
  // appear in a quoted-on path line, so no file name can forge a boundary.
  const REC = String.fromCharCode(0x1e)
  const FLD = String.fromCharCode(0x1f)
  const header = (sha) => `${REC}${sha}${FLD}1723000000`
  const files = ['x-guard.mjs']

  it('keeps a path with a trailing space BYTE-EXACT, never its trimmed spelling', () => {
    const out = [header(SHA), '', 'scripts/git-hooks/check ', ''].join('\n')
    const commits = parseMechanismLog(out, files)
    expect(commits).toHaveLength(1)
    expect(commits[0].files).toEqual(['scripts/git-hooks/check '])
    expect(commits[0].files).not.toContain('scripts/git-hooks/check')
    expect(commits[0]).toMatchObject({ sha: SHA, at: 1723000000000 })
  })

  // ROUND-1 PASS 2: the header used to carry the subject and the trailers behind
  // two more `__F__` separators, and a legal subject CONTAINING that separator
  // shifted the trailer field out of the destructuring — the authoring model
  // then read empty or attacker-chosen, and the self-review refusal missed. The
  // header now carries machine-shaped fields ONLY; free text can no longer
  // reach this parser, so no subject can forge a field boundary.
  it('refuses a header line that carries free text — the old shape is not a header', () => {
    const forged =
      `${REC}${SHA}${FLD}1723000000${FLD}A subject${FLD}Evil Model <evil@example.invalid>`
    const commits = parseMechanismLog([forged, '', 'scripts/x-guard.mjs', ''].join('\n'), files)
    // The forged line matches no header, so no commit exists to carry the
    // attacker's model — the fields simply have nowhere to land.
    expect(commits).toEqual([])
  })

  it('exposes NO author or subject fields — free text travels outside the log', () => {
    const out = [header(SHA), '', 'scripts/x-guard.mjs', ''].join('\n')
    const [commit] = parseMechanismLog(out, files)
    // The wrapper fetches subject and trailers per commit through single-format
    // git calls; anything author-shaped in THIS output would have come from
    // text an author controls.
    expect(commit.subject).toBeUndefined()
    expect(commit.authorModel).toBeUndefined()
    expect(commit.authorModels).toBeUndefined()
  })

  it('keeps a leading space too, and strips only a trailing carriage return', () => {
    const out = [header(SHA), '', 'scripts/git-hooks/ lead\r', ''].join('\n')
    expect(parseMechanismLog(out, files)[0].files).toEqual(['scripts/git-hooks/ lead'])
  })

  it('does not cut a commit in half on a path containing the OLD printable sentinel', () => {
    const out = [header(SHA), '', 'scripts/git-hooks/x__C__y', 'scripts/x-guard.mjs', ''].join('\n')
    const commits = parseMechanismLog(out, files)
    expect(commits).toHaveLength(1)
    expect(commits[0].files).toEqual(['scripts/git-hooks/x__C__y', 'scripts/x-guard.mjs'])
  })

  it('a file NAMED like the old printable header forges no boundary (round-4 pass 3)', () => {
    // The exact exploit: a legal root file named `__C__<sha>__F__<epoch>`
    // used to reset the current commit and attribute the following mechanism
    // path to a sha of the forger's choosing — one already reviewed.
    const spoof = `__C__${SHB}__F__1723000001`
    const out = [header(SHA), '', spoof, 'scripts/x-guard.mjs', ''].join('\n')
    const commits = parseMechanismLog(out, files)
    expect(commits).toHaveLength(1)
    expect(commits[0].sha).toBe(SHA)
    // The spoof line is a PATH of this commit now, nothing more.
    expect(commits[0].files).toContain('scripts/x-guard.mjs')
  })

  it('a QUOTED path carrying the raw separator bytes forges no boundary either', () => {
    // core.quotepath=on prints a path holding 0x1E/0x1F quoted with octal
    // escapes — the raw bytes never reach a path line. If such a quoted
    // spelling arrives, it stays one path.
    const quoted = `"evil\\036${SHB}\\0371723000001"`
    const out = [header(SHA), '', quoted, 'scripts/x-guard.mjs', ''].join('\n')
    const commits = parseMechanismLog(out, files)
    expect(commits).toHaveLength(1)
    expect(commits[0].sha).toBe(SHA)
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
      header(SHB),
      '',
      'scripts/x-guard.mjs',
      '',
    ].join('\n')
    const commits = parseMechanismLog(out, files)
    expect(commits).toHaveLength(1)
    expect(commits[0].sha).toBe(SHB)
  })

  it('parses nothing from an empty or fileless log', () => {
    expect(parseMechanismLog('', files)).toEqual([])
    expect(parseMechanismLog(`${header(SHA)}\n`, files)).toEqual([])
  })
})

// ROUND-1 PASS 2, both path-transport findings: the flags are what make the
// gate's view of the tree config-independent and rename-proof, so they are
// pinned as the COMMANDS the wrapper actually builds.
describe('the path-carrying git commands', () => {
  // PINNED WHOLE, not by substring (round-2 pass 3): a `.toContain` still
  // passes with the option after `--`, after the revision, or overridden by a
  // later flag — none of which is the config-proof, rename-split command the
  // guard depends on. The exact string is the claim.
  it('builds the log command config-proof and rename-split, exactly', () => {
    expect(mechanismLogCommand('base', 'head')).toBe(
      '-c core.quotepath=on log --format="%x1e%H%x1f%ct" --name-only --no-renames --diff-merges=cc --reverse "base..head"',
    )
  })

  it('builds the range listing raw (-z) and rename-split, exactly', () => {
    expect(rangeFilesCommand('base', 'sha')).toBe('diff --name-only -z --no-renames "base..sha"')
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

  // ESCALATION ROUND, PASSES 1/2: a pass composition judged against the pending
  // commit's mechanism paths alone could read complete while ordinary files of
  // the reviewed range were in no pass. The wrapper therefore attaches, to each
  // branch record, the FILE SET its range would clear.
  it('attaches each branch record’s range file set, and survives a diff that cannot answer', () => {
    const pendingCommits = [{ sha: 'c0' }]
    const records = attachCoverage({
      pendingCommits,
      allRecords: [{ sha: 'recA' }, { sha: 'recB', rangeFiles: ['scripts/forged-by-hand.mjs'] }],
      head: 'head',
      revList: (rev) => ({ head: 'c0\nrecA\nrecB', recA: 'c0', recB: 'c0' })[rev] ?? '',
      rangeFiles: (sha) => {
        if (sha === 'recB') throw new Error('undiffable')
        return ['scripts/a-guard.mjs', 'docs/notes.md', ' edge-space.mjs']
      },
    })
    // recB arrived POISONED (round-4 pass 3): the ledger accepts extra fields,
    // so a hand-written row can carry its own rangeFiles — and it must not
    // survive the failed trusted measurement.
    expect(records.find((r) => r.sha === 'recA').rangeFiles).toEqual([
      'scripts/a-guard.mjs',
      'docs/notes.md',
      ' edge-space.mjs',
    ])
    // The failed measurement attaches nothing…
    expect(records.find((r) => r.sha === 'recB').rangeFiles).toBeUndefined()
  })

  it('an unattached range measurement BLOCKS the composition, never narrows it (round-3 pass 3)', async () => {
    // The half the wrapper test above cannot claim alone: what the evaluator
    // DOES with records that carry no rangeFiles. A complete-looking split
    // whose range was never measured has unknown coverage and blocks — the
    // old fallback judged it against the commit's own mechanism paths, a
    // silently narrower demand, exactly when git could not say what the range
    // really changed.
    const { evaluateMechanismReview } = await import('./mechanism-review-core.mjs')
    const recSha = 'c'.repeat(40)
    const rec = (index) => ({
      sha: recSha,
      model: 'GPT-5.6 Sol',
      authoredBy: 'Claude Opus 5 <noreply@anthropic.com>',
      verdict: 'merge',
      evidence: 'checked the guard change against its spec end to end',
      mode: 'review',
      at: Date.now(),
      pass: { index, total: 2, files: index === 1 ? ['scripts/x-guard.mjs'] : ['scripts/y.mjs'] },
      // Deliberately NO rangeFiles — the wrapper's diff could not answer.
    })
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [
        {
          sha: '1'.repeat(40),
          subject: 'change a guard',
          authorModel: 'Claude Opus 5',
          files: ['scripts/x-guard.mjs'],
          coveringRecordShas: [recSha],
        },
      ],
      records: [rec(1), rec(2)],
    })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('incomplete-passes')
    expect(v.findings[0].passes.coverageUnknown).toBe(true)
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
