// The two pieces of the mechanism gate's WRAPPER that decide what gets judged
// at all, and that a spawned-hook case cannot pin cheaply: which baseline a
// branch is measured against, and where a tree with no baseline starts.
//
// Both were caught live rather than by reading: the fork-point lookup silently
// fell back to HEAD on Windows and grandfathered the branch's own work — the
// gate reported "GATE CLEAR" on four unreviewed mechanism commits.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  attachContributionDispositions,
  attachCoverage,
  BASELINE_RECOVERY_ANCHOR,
  baselineFor,
  bootstrapBase,
  measureReviewGap,
  mechanismLogCommand,
  parseMechanismLog,
  pendingReviewContributions,
} from './mechanism-review-guard.mjs'
import {
  CONTRIBUTION_DISPOSITION_KIND,
  CONTRIBUTION_SCOPE_BOUNDARY,
  LEGACY_CONTRIBUTION_BASELINE,
  evaluateMechanismReview,
  formatMechanismReviewVerdict,
  LEGACY_RANGE_RETIREMENT_REASON,
} from './mechanism-review-core.mjs'
import { repoPath } from './repo-paths.mjs'

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
  it('recovers only from the immutable tracked anchor, quoted for cmd.exe', () => {
    const asked = []
    const head = 'headsha'
    expect(
      bootstrapBase(head, (rev) => {
        asked.push(rev)
        return BASELINE_RECOVERY_ANCHOR
      }, () => true),
    ).toBe(BASELINE_RECOVERY_ANCHOR)
    expect(asked).toEqual([`--verify --quiet "${BASELINE_RECOVERY_ANCHOR}^{commit}"`])
  })

  it('never falls back to HEAD when the anchor is absent', () => {
    expect(bootstrapBase('headsha', () => '')).toBe(null)
  })

  it('refuses an unreachable anchor and names the merge that makes recovery possible', () => {
    const head = 'headsha'
    const baseline = bootstrapBase(head, () => BASELINE_RECOVERY_ANCHOR, () => false)
    expect(baseline).toBe(null)

    const verdict = evaluateMechanismReview({
      baseline,
      baselineMissing: true,
      head,
      pendingCommits: [],
      records: [],
    })
    expect(verdict).toMatchObject({ block: true, clear: false })
    expect(formatMechanismReviewVerdict(verdict)).toContain('merge origin/main into this branch')
  })
})

describe('historical ledger eras', () => {
  it('keeps every named historical refusal reviewable without changing its verdict', () => {
    const named = [
      '042ffbf',
      '5ce597c',
      '65022b1',
      '7db99ea',
      '80b96e6',
      'c3f5ad8',
      'e0ebcff',
      'e1d242a',
      'ece3757',
      'f999250',
      'fe20777',
    ]
    const ledger = readFileSync(repoPath('.claude/mechanism-reviews.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))

    for (const shortSha of named) {
      const row = ledger.find(
        (record) => String(record.sha ?? '').startsWith(shortSha) && record.verdict === 'do-not-merge',
      )
      expect(row, shortSha).toBeTruthy()
      const reviewerIsAnthropic = /claude|opus|fable/i.test(String(row.model))
      const verdict = evaluateMechanismReview({
        baseline: 'b',
        head: 'h',
        pendingCommits: [{
          sha: shortSha.padEnd(40, '0'),
          subject: `historical refusal ${shortSha}`,
          at: Number(row.at) - 1,
          authorModel: reviewerIsAnthropic ? 'GPT-5.6 Sol' : 'Claude Opus 5',
          files: [row.pass?.files?.[0] ?? 'scripts/historical-guard.mjs'],
          coveringRecordShas: [row.sha],
        }],
        records: [row],
      })
      expect(verdict.block, shortSha).toBe(true)
      expect(verdict.findings.some((finding) => finding.kind === 'malformed-record'), shortSha).toBe(false)
      expect(formatMechanismReviewVerdict(verdict), shortSha).not.toContain('is malformed')
    }
  })
})

describe('legacy contribution dispositions', () => {
  const row = (over = {}) => ({
    kind: CONTRIBUTION_DISPOSITION_KIND,
    disposition: 'retired',
    sha: 'a'.repeat(40),
    scopeBoundary: CONTRIBUTION_SCOPE_BOUNDARY,
    reason: LEGACY_RANGE_RETIREMENT_REASON,
    measurement: {
      measuredOn: '2026-08-26',
      point: 943,
      passesAtOpen: 45,
      passesAtClose: 42,
      passesOnMain: 115,
    },
    ...over,
  })

  it('stamps only the fixed historical retirement Git places inside the migration interval', () => {
    const records = [row(), row({ sha: 'b'.repeat(40), disposition: 'reviewed' })]
    attachContributionDispositions(records, (ancestor, descendant) => {
      if (descendant === LEGACY_CONTRIBUTION_BASELINE) return false
      expect(descendant).toBe(CONTRIBUTION_SCOPE_BOUNDARY)
      return ancestor === 'a'.repeat(40)
    })
    expect(records[0].contributionDispositionVerified).toBe(true)
    expect(records[1].contributionDispositionVerified).toBeUndefined()
  })

  it('trusts none of the ledger row own boundary, measurement or prose', () => {
    const altered = [
      row({ scopeBoundary: 'b'.repeat(40) }),
      row({ reason: 'please retire this' }),
      row({ measurement: { ...row().measurement, passesOnMain: 114 } }),
      row({ sha: 'future' }),
    ]
    attachContributionDispositions(altered, () => true)
    expect(altered.every((record) => record.contributionDispositionVerified === undefined)).toBe(true)
  })

  it('rejects a valid-shaped retirement already reachable from the confirmed baseline', () => {
    const beforeBaseline = row()
    attachContributionDispositions([beforeBaseline], (ancestor, descendant) =>
      ancestor === beforeBaseline.sha && descendant === LEGACY_CONTRIBUTION_BASELINE,
    )
    expect(beforeBaseline.contributionDispositionVerified).toBeUndefined()
  })

  it('removes a stale in-memory stamp before re-verifying', () => {
    const forged = row({ contributionDispositionVerified: true })
    attachContributionDispositions([forged], () => false)
    expect(forged.contributionDispositionVerified).toBeUndefined()
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
  const header = (sha, parents = []) => `${REC}${sha}${FLD}1723000000${FLD}${parents.join(' ')}`
  const files = ['x-guard.mjs']

  it('keeps a path with a trailing space BYTE-EXACT, never its trimmed spelling', () => {
    const out = [header(SHA), '', 'scripts/git-hooks/check ', ''].join('\n')
    const commits = parseMechanismLog(out, files)
    expect(commits).toHaveLength(1)
    expect(commits[0].files).toEqual(['scripts/git-hooks/check '])
    expect(commits[0].files).not.toContain('scripts/git-hooks/check')
    expect(commits[0]).toMatchObject({ sha: SHA, at: 1723000000000, parentShas: [] })
  })

  it('carries only machine-shaped parent shas for merge attribution', () => {
    const out = [header(SHA, [SHB, 'c'.repeat(40)]), '', 'scripts/x-guard.mjs', ''].join('\n')
    expect(parseMechanismLog(out, files)[0].parentShas).toEqual([SHB, 'c'.repeat(40)])
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
describe('pending review contributions', () => {
  it('uses mechanism paths only to select a commit, then owes that commit own complete file set', () => {
    const commits = [
      {
        sha: 'a'.repeat(40),
        files: ['scripts/example-guard.mjs', 'src/ordinary.ts', 'TASKS.md'],
        authorModels: ['GPT-5.6 Sol'],
      },
      { sha: 'b'.repeat(40), files: ['src/unrelated.ts'], authorModels: ['GPT-5.6 Sol'] },
    ]
    const pending = pendingReviewContributions(
      commits,
      ['example-guard.mjs'],
      (sha) => `subject ${sha.slice(0, 1)}`,
    )
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ sha: 'a'.repeat(40), subject: 'subject a' })
    expect(pending[0].mechanismFiles).toEqual(['scripts/example-guard.mjs'])
    expect(pending[0].files).toEqual(['scripts/example-guard.mjs', 'src/ordinary.ts'])
  })
})

describe('the path-carrying git commands', () => {
  // PINNED WHOLE, not by substring (round-2 pass 3): a `.toContain` still
  // passes with the option after `--`, after the revision, or overridden by a
  // later flag — none of which is the config-proof, rename-split command the
  // guard depends on. The exact string is the claim.
  it('builds the log command config-proof and rename-split, exactly — as an args ARRAY', () => {
    // An array, never a shell line (round-5 pass 3): cmd.exe expands
    // %x1e%-shaped spans as environment variables before git runs, and the
    // gate would then parse an output with no headers at all — and clear.
    expect(mechanismLogCommand('base', 'head')).toEqual([
      '-c',
      'core.quotepath=on',
      'log',
      '--format=%x1e%H%x1f%ct%x1f%P',
      '--name-only',
      '--no-renames',
      '--diff-merges=cc',
      '--reverse',
      'base..head',
    ])
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
      reviewerAuthorship: { status: 'unverified', claimedModel: 'GPT-5.6 Sol', reason: 'fixture transcript absent' },
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

describe('measureReviewGap', () => {
  const runnable = {
    scope: 'contribution',
    contributions: [{
      sha: 'c'.repeat(40),
      statTruncated: false,
      passes: [{ index: 1, total: 1 }],
      uncoverable: [],
      unreviewable: [],
    }],
  }

  it('fails closed when the contribution planner throws', async () => {
    const { gap, sizedPlan } = await measureReviewGap({
      blocked: true,
      commits: [{ sha: 'c'.repeat(40) }],
      loadPlanner: async () => ({
        buildContributionPassPlan: () => {
          throw new Error('planPasses assembled nothing')
        },
      }),
    })
    expect(gap).toMatchObject({ gap: false, reason: 'unmeasured' })
    expect(sizedPlan).toBe(null)
  })

  it('fails closed when the planner module cannot be loaded', async () => {
    const { gap, sizedPlan } = await measureReviewGap({
      blocked: true,
      commits: [{ sha: 'c'.repeat(40) }],
      loadPlanner: () => {
        throw new Error('review-sol.mjs is broken')
      },
    })
    expect(gap).toMatchObject({ gap: false, reason: 'unmeasured' })
    expect(sizedPlan).toBe(null)
  })

  it('passes the contribution plan through when the planner works', async () => {
    const { gap, sizedPlan } = await measureReviewGap({
      blocked: true,
      commits: [{ sha: 'c'.repeat(40) }],
      loadPlanner: async () => ({ buildContributionPassPlan: () => runnable }),
    })
    expect(sizedPlan).toBe(runnable)
    expect(gap).toMatchObject({ gap: false, reason: 'contributions-runnable' })
  })

  it('reports only a named contribution that no pass can assemble', async () => {
    const impossible = {
      scope: 'contribution',
      contributions: [{
        sha: 'd'.repeat(40),
        subject: 'Huge contribution',
        rawSize: 400_000,
        budget: 200_000,
        statTruncated: false,
        passes: [],
        uncoverable: [{ path: 'huge.mjs', reason: 'diff too large' }],
        unreviewable: [],
      }],
    }
    const { gap } = await measureReviewGap({
      blocked: true,
      commits: [{ sha: 'd'.repeat(40) }],
      loadPlanner: async () => ({ buildContributionPassPlan: () => impossible }),
    })
    expect(gap).toMatchObject({ gap: true, reason: 'contributions-unassemblable' })
    expect(gap.report).toContain('dddddddddddd')
    expect(gap.report).toContain('huge.mjs')
  })

  it('measures nothing at all when the verdict is not blocked', async () => {
    let touched = false
    expect(
      await measureReviewGap({
        blocked: false,
        loadPlanner: () => {
          touched = true
          return {}
        },
      }),
    ).toEqual({ gap: null, sizedPlan: null })
    expect(touched).toBe(false)
  })
})
