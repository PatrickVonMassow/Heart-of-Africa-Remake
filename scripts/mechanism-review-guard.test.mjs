// The two pieces of the mechanism gate's WRAPPER that decide what gets judged
// at all, and that a spawned-hook case cannot pin cheaply: which baseline a
// branch is measured against, and where a tree with no baseline starts.
//
// Both were caught live rather than by reading: the fork-point lookup silently
// fell back to HEAD on Windows and grandfathered the branch's own work — the
// gate reported "GATE CLEAR" on four unreviewed mechanism commits.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import {
  attachContributionDispositions,
  attachCoverage,
  BASELINE_PATH as MECHANISM_BASELINE_PATH,
  BASELINE_RECOVERY_ANCHOR,
  baselineFor,
  bootstrapBase,
  measureReviewGap,
  mechanismLogCommand,
  parseRangeLog,
  parseMechanismLog,
  pendingReviewContributions,
  authorshipBlockResponse,
  authorshipRead,
  readSubject,
  defaultParentReader,
  planningContributions,
  rangeCommits,
  gatherMechanismReviewInputs,
  GATE_SWITCHED_OFF,
  resolveMechanismReviewSessionId,
  shouldSeedRecoveryAnchor,
} from './mechanism-review-guard.mjs'
import { BASELINE_PATH as CRITICALITY_BASELINE_PATH } from './criticality-review-guard.mjs'
import { BASELINE_PATH as TASKS_SPEC_BASELINE_PATH } from './tasks-spec-guard.mjs'
import {
  CONTRIBUTION_DISPOSITION_KIND,
  CONTRIBUTION_SCOPE_BOUNDARY,
  LEGACY_CONTRIBUTION_BASELINE,
  evaluateMechanismReview,
  formatMechanismReviewVerdict,
  LEGACY_RANGE_RETIREMENT_REASON,
  mechanismPathsIn,
  modelsFromTrailers,
} from './mechanism-review-core.mjs'
import { planAuthorshipGroups } from './mechanism-review-range-core.mjs'
import { commonRepoPath, repoPath } from './repo-paths.mjs'
import { readOwnerLock } from './batch-singleton.mjs'

describe('the switched-off gate (point 1036)', () => {
  it('stands down for every caller but the measuring read, and says why', () => {
    // The block is off (CLAUDE.md §2 infrastructure freeze). A gather without
    // `report` is what the Stop hook and guard-preflight both do, and it must
    // carry no inputs at all — an applicable gather is what produced a verdict.
    const gate = gatherMechanismReviewInputs({ sessionId: 'anything' })
    expect(gate.applicable).toBe(false)
    expect(gate.why).toBe(GATE_SWITCHED_OFF)
    expect(gate.inputs).toBeUndefined()

    // Nothing is forgiven: the reason names the report that still measures the
    // debt, so a reader is never left without the way to see it.
    expect(GATE_SWITCHED_OFF).toContain('mechanism-review-guard.mjs --status')

    // And the read answers regardless of who holds the batch lock — the defect
    // that made a hand-run `--status` print "stands down" and exit 0.
    const read = gatherMechanismReviewInputs({ sessionId: '', report: true })
    expect(read.applicable).toBe(true)
  })
})

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

  it('stores every checkout-shared guard baseline in the main checkout', () => {
    expect(MECHANISM_BASELINE_PATH).toBe(commonRepoPath('.claude/mechanism-review-baseline.json'))
    expect(CRITICALITY_BASELINE_PATH).toBe(commonRepoPath('.claude/criticality-review-baseline.json'))
    expect(TASKS_SPEC_BASELINE_PATH).toBe(commonRepoPath('.claude/tasks-spec-guard-baseline.json'))
  })
})

describe('the mechanism status session identity', () => {
  it('lets the printed bare status command inspect through the live lock owner', () => {
    const readLock = () => ({ sessionId: 'owning-session' })
    expect(resolveMechanismReviewSessionId({ status: true, env: {}, readLock })).toBe('owning-session')
  })

  it('prefers explicit payload and environment identities before the lock', () => {
    const readLock = () => ({ sessionId: 'lock-session' })
    expect(resolveMechanismReviewSessionId({
      payloadSessionId: 'hook-session',
      status: true,
      env: { CLAUDE_SESSION_ID: 'env-session' },
      readLock,
    })).toBe('hook-session')
    expect(resolveMechanismReviewSessionId({
      status: true,
      env: { CLAUDE_SESSION_ID: 'env-session' },
      readLock,
    })).toBe('env-session')
  })

  it('does not borrow the lock owner for an unidentified Stop hook', () => {
    expect(resolveMechanismReviewSessionId({
      status: false,
      env: { CLAUDE_SESSION_ID: 'env-session' },
      readLock: () => ({ sessionId: 'lock-session' }),
    })).toBe('')
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

  it('seeds the anchor from the one shape that carries the flag AND the baseline', () => {
    // THE DEFECT THIS PINS: the flag lived only under `inputs` on the normal
    // path, while the early returns that carry it at the top level carry no
    // baseline. The Stop path asks for both AT ONCE, so the write could never
    // happen — a tree whose local baseline file was gone stayed blocked for
    // good, and its own recovery text described a step the code never took.
    expect(shouldSeedRecoveryAnchor({ baselineMissing: true, baseline: BASELINE_RECOVERY_ANCHOR })).toBe(true)
    // The two shapes that must NOT write: no baseline to seed, and a baseline
    // that is already recorded.
    expect(shouldSeedRecoveryAnchor({ baselineMissing: true, baseline: null })).toBe(false)
    expect(shouldSeedRecoveryAnchor({ baselineMissing: false, baseline: BASELINE_RECOVERY_ANCHOR })).toBe(false)
    // A `--status` read decides nothing and therefore writes nothing.
    expect(
      shouldSeedRecoveryAnchor({ baselineMissing: true, baseline: BASELINE_RECOVERY_ANCHOR }, { status: true }),
    ).toBe(false)

    // And the real gathered shape reports the flag where the predicate reads it,
    // with the same value it hands to the verdict — the symmetry that broke.
    // The owner's own id is used so the gather is APPLICABLE here too: with a
    // live batch lock any other id stands the guard down, and a skipped
    // assertion would have let the very defect above pass unnoticed.
    // `report: true` is what makes the gather APPLICABLE at all now: the gate's
    // block is switched off (point 1036) and only the measuring read remains.
    const gathered = gatherMechanismReviewInputs({
      sessionId: readOwnerLock()?.sessionId ?? '',
      report: true,
    })
    expect(gathered.applicable).toBe(true)
    expect(Object.hasOwn(gathered, 'baselineMissing')).toBe(true)
    expect(gathered.baselineMissing).toBe(gathered.inputs.baselineMissing)
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

describe('the measured 30.08 refusal multiplication', () => {
  const baseline = '7472bb7e086934ad6da85e57aaa809d7380f3bd7'
  const checkpoints = [
    'b79e43305a4bd75e0c0d6e72b18d59de5435a52a',
    'a1d4bf3f022d7b830d7a89d7e61c7ada780b186b',
    '8249b20b22aea2ffb5d1e2d64052290401c5a090',
  ]
  const gitHistory = (args) => execFileSync('git', args, {
    cwd: repoPath(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  })

  // CI checks out with fetch-depth 2, so this range is not a range there and
  // the replay dies on "fatal: Invalid revision range" — MEASURED on run
  // 33400556465, which reddened for the checkout and not for the code. Like
  // the dispositions and four-eyes-artefact audits it SKIPS there and says
  // why; every full clone runs it. Skipping is safe in exactly one direction:
  // this case only ever recomputes a historical counter, so a shallow checkout
  // loses coverage and can never manufacture a pass.
  const historyReachable = checkpoints.every((head) => {
    try {
      gitHistory(['merge-base', '--is-ancestor', baseline, head])
      return true
    } catch {
      return false
    }
  })
  if (!historyReachable) {
    console.warn(
      'mechanism-review-guard: SKIPPED the 30.08 refusal replay — ' +
        `${baseline.slice(0, 7)}..${checkpoints[checkpoints.length - 1].slice(0, 7)} is not in this ` +
        'clone (shallow checkout); a full clone runs it',
    )
  }

  const replayAt = (head) => {
    const scriptFiles = readdirSync(repoPath('scripts'))
    const commits = parseRangeLog(gitHistory(mechanismLogCommand(baseline, head))).map((commit) => {
      const trailers = gitHistory([
        'show',
        '-s',
        '--format=%(trailers:key=Co-Authored-By,valueonly,separator=;)',
        commit.sha,
      ])
      const authorModels = modelsFromTrailers(trailers)
      return {
        ...commit,
        authorModel: authorModels[0] ?? '',
        authorModels,
        mechanismFiles: mechanismPathsIn(commit.files, { scriptFiles }),
      }
    })
    const pendingCommits = pendingReviewContributions(
      commits,
      scriptFiles,
      (sha) => gitHistory(['show', '-s', '--format=%s', sha]).trim(),
    )
    const ledger = gitHistory(['show', `${head}:.claude/mechanism-reviews.jsonl`])
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const records = attachCoverage({
      pendingCommits,
      allRecords: ledger,
      head,
      revList: (revision) => gitHistory(['rev-list', revision, '--not', baseline]),
    })
    return { pendingCommits, records, head }
  }

  it.skipIf(!historyReachable)('replays 3 → 30 → 40 before scoping, then 2 → 2 → 11 with corrected refusal scope', () => {
    const replays = checkpoints.map(replayAt)
    const count = (replay, reviewScope) => evaluateMechanismReview({
      baseline,
      ...replay,
      reviewScope,
    }).findings.length

    // The former rule treated every bounded record as range-wide. The later
    // strict-subset reread still corrects one overbroad refusal at the first
    // immutable state, so even this emulation now starts at three. These are
    // measured counters recomputed from the versioned ledger and commit graph,
    // not copied from the work-order prose.
    expect(replays.map((replay) => count(replay, () => 'range'))).toEqual([3, 30, 40])
    // The remaining growth names real exact-state refusals, incomplete passes,
    // self-reviews and as-yet-unreviewed repair commits. The one-row reduction
    // at every cut is the same strict-subset scope correction, not a waiver.
    expect(replays.map((replay) => count(replay, undefined))).toEqual([2, 2, 11])
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

  it('excludes a ledger-only append but keeps the ledger beside a real mechanism change', () => {
    const ledger = '.claude/mechanism-reviews.jsonl'
    const commits = [
      { sha: 'a'.repeat(40), files: [ledger], authorModels: ['GPT-5.6 Sol'] },
      {
        sha: 'b'.repeat(40),
        files: [ledger, 'scripts/example-guard.mjs'],
        authorModels: ['GPT-5.6 Sol'],
      },
    ]
    const pending = pendingReviewContributions(commits, ['example-guard.mjs'])

    expect(pending.map((commit) => commit.sha)).toEqual(['b'.repeat(40)])
    expect(pending[0].mechanismFiles).toEqual(['scripts/example-guard.mjs'])
    expect(pending[0].files).toEqual([ledger, 'scripts/example-guard.mjs'])
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
      // FIRST, and a GLOBAL flag rather than a log option: %P is what a
      // trailerless merge is attributed by, and `log` honours `refs/replace`.
      '--no-replace-objects',
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

describe('the plan the gate prints names what is OWED, never what the range holds', () => {
  // Measured on the merge candidate 27.08.2026, reviewing point 957: the
  // contribution-scoped plan was built from EVERY pending commit, so 240
  // settled contributions — merge commits among them, whose trailers name no
  // vendor — arrived as UNREVIEWABLE groups. The verdict prints the
  // unreviewable branch INSTEAD of the runnable commands, so the gate's own
  // message hid the four owed contributions and their eight runnable passes.
  const retirement = (sha) => ({
    kind: CONTRIBUTION_DISPOSITION_KIND,
    sha,
    disposition: 'retired',
    contributionDispositionVerified: true,
  })

  it('drops a retired contribution from the planning set by the evaluator’s own predicate', () => {
    const retired = { sha: 'a'.repeat(40), files: ['scripts/x.mjs'], coveringRecordShas: ['a'.repeat(40)] }
    const owed = { sha: 'b'.repeat(40), files: ['scripts/y.mjs'], coveringRecordShas: [] }
    const planned = planningContributions([retired, owed], [retirement('a'.repeat(40))])
    expect(planned.map((c) => c.sha)).toEqual(['b'.repeat(40)])
  })

  it('keeps a contribution whose retirement row was never verified from Git', () => {
    const claimed = { sha: 'a'.repeat(40), files: ['scripts/x.mjs'], coveringRecordShas: ['a'.repeat(40)] }
    const unverified = { ...retirement('a'.repeat(40)), contributionDispositionVerified: false }
    expect(planningContributions([claimed], [unverified]).map((c) => c.sha)).toEqual(['a'.repeat(40)])
  })

  it('prints only the groups of the contributions the verdict reports', () => {
    const owedSha = 'b'.repeat(40)
    const verdict = evaluateMechanismReview({
      baseline: 'base',
      head: 'h'.repeat(40),
      pendingCommits: [{ sha: owedSha, at: 1, files: ['scripts/y.mjs'], authorModel: 'GPT-5.6 Sol' }],
      records: [],
    })
    const text = formatMechanismReviewVerdict(verdict, {
      authorshipPlan: {
        groups: [
          {
            vendor: 'openai',
            reviewer: 'Opus 5',
            reviewerVendor: 'anthropic',
            files: ['scripts/y.mjs'],
            commits: [owedSha],
          },
          {
            vendor: 'openai',
            reviewer: 'Opus 5',
            reviewerVendor: 'anthropic',
            files: ['scripts/settled.mjs'],
            commits: ['c'.repeat(40)],
          },
        ],
        unreviewable: [
          {
            files: ['scripts/settled-merge.mjs'],
            commits: ['c'.repeat(40)],
            unreviewableReason: 'authorship vendor is unknown',
          },
        ],
      },
    })
    expect(text).toContain('scripts/y.mjs')
    expect(text).not.toContain('scripts/settled.mjs')
    // The settled merge commit must not turn the whole verdict into the
    // UNREVIEWABLE branch, which suppresses the runnable-command guidance.
    expect(text).not.toContain('scripts/settled-merge.mjs')
    expect(text).not.toContain('UNREVIEWABLE')
  })

  it('narrows nothing when a finding names no commit, so a demand is never trimmed away', () => {
    const verdict = evaluateMechanismReview({ baseline: 'b', head: 'h'.repeat(40), pendingCommits: [], records: [] })
    const groups = [
      { vendor: 'openai', reviewer: 'Opus 5', reviewerVendor: 'anthropic', files: ['scripts/y.mjs'], commits: ['d'.repeat(40)] },
      { vendor: 'anthropic', reviewer: 'GPT-5.6 Sol', reviewerVendor: 'openai', files: ['scripts/z.mjs'], commits: ['e'.repeat(40)] },
    ]
    const text = formatMechanismReviewVerdict({ ...verdict, block: true, findings: [{ kind: 'no-review' }] }, {
      authorshipPlan: { groups, unreviewable: [] },
    })
    expect(text).toContain('scripts/y.mjs')
    expect(text).toContain('scripts/z.mjs')
  })
})

// A LANDING'S MERGE CARRIES NO TRAILER OF ITS OWN, and the gate plans one commit
// at a time, so its authorship resolver's lookup table holds that single commit
// and never the branch tip it merged. Supplying every non-first parent's trailer
// is what lets `authorshipResolver` apply point 784's ruling here; without it a
// merge that contributed a conflict resolution measured as UNKNOWN authorship,
// which is unreviewable by construction — no verdict may be recorded against it
// and no documented route clears it, so one hand-resolved landing shut the gate
// for every later merge (measured 01.09.2026 on main, after landing point 1031).
describe('a trailerless merge is attributed to the tip it merged', () => {
  const REC = String.fromCharCode(0x1e)
  const FLD = String.fromCharCode(0x1f)
  const MERGE = 'a'.repeat(40)
  const FIRST = 'b'.repeat(40)
  const MERGED = 'c'.repeat(40)
  // THE MERGED TIP IS ITSELF IN THE RANGE — that is the shape measured on main,
  // and it is the shape a lookup filtered on "outside the range" gets wrong.
  const log = [
    `${REC}${MERGE}${FLD}1788000000${FLD}${FIRST} ${MERGED}`,
    '',
    'scripts/x-guard.mjs',
    '',
    `${REC}${MERGED}${FLD}1787900000${FLD}${FIRST}`,
    '',
    'scripts/x-guard.mjs',
    '',
  ].join('\n')
  const trailers = {
    [MERGE]: '',
    [MERGED]: 'GPT-5.6 Sol <noreply@openai.com>',
    [FIRST]: 'Claude Opus 5 <noreply@anthropic.com>',
  }

  it('hands the merged tip trailer to the planner, even when it is in range', () => {
    const asked = []
    const commits = rangeCommits('base', 'head', ['scripts/x-guard.mjs'], {
      readLog: () => log,
      readParents: () => [FIRST, MERGED],
      readTrailers: (sha) => {
        asked.push(sha)
        return trailers[sha] ?? ''
      },
    })

    expect(commits).toHaveLength(2)
    expect(commits[0].authorModels).toEqual(['GPT-5.6 Sol <noreply@openai.com>'])
    expect(commits[0].authorModel).toBe('GPT-5.6 Sol <noreply@openai.com>')
    // The MERGED tip, not the first parent: a merge inherits from what it took in.
    expect(commits[0].parentAuthorModels).toEqual({ [MERGED]: ['GPT-5.6 Sol <noreply@openai.com>'] })
    expect(asked).toContain(MERGED)
    expect(Object.keys(commits[0].parentAuthorModels)).not.toContain(FIRST)
  })

  it('resolves that merge to an eligible reviewer instead of unknown authorship', () => {
    const [commit] = rangeCommits('base', 'head', ['scripts/x-guard.mjs'], {
      readLog: () => log,
      readParents: () => [FIRST, MERGED],
      readTrailers: (sha) => trailers[sha] ?? '',
    })
    // The gate plans ONE commit; that is the shape the fix has to survive.
    const { groups } = planAuthorshipGroups({ commits: [commit], endStateFiles: commit.files })

    expect(groups).toHaveLength(1)
    expect(groups[0].reviewer).toBeTruthy()
    expect(groups[0].unreviewableReason).toBeUndefined()
  })

  it('inherits authorship from every non-first tip of an octopus merge', () => {
    const THIRD = 'd'.repeat(40)
    const octopusLog = [
      `${REC}${MERGE}${FLD}1788000000${FLD}${FIRST} ${MERGED} ${THIRD}`,
      '',
      'scripts/x-guard.mjs',
      '',
    ].join('\n')
    const [commit] = rangeCommits('base', 'head', ['scripts/x-guard.mjs'], {
      readLog: () => octopusLog,
      readParents: () => [FIRST, MERGED, THIRD],
      readTrailers: (sha) => ({
        [MERGE]: '',
        [MERGED]: 'GPT-5.6 Sol <noreply@openai.com>',
        [THIRD]: 'Claude Fable 5 <noreply@anthropic.com>',
      })[sha] ?? '',
    })

    expect(commit.authorModels).toEqual([
      'GPT-5.6 Sol <noreply@openai.com>',
      'Claude Fable 5 <noreply@anthropic.com>',
    ])
    expect(commit.parentAuthorModels).toEqual({
      [MERGED]: ['GPT-5.6 Sol <noreply@openai.com>'],
      [THIRD]: ['Claude Fable 5 <noreply@anthropic.com>'],
    })
  })

  it('lets later attributed pass rows settle the pre-repair unknown-row era', () => {
    const [commit] = rangeCommits('base', 'head', ['scripts/x-guard.mjs'], {
      readLog: () => log,
      readParents: () => [FIRST, MERGED],
      readTrailers: (sha) => trailers[sha] ?? '',
    })
    commit.coveringRecordShas = [MERGE]
    commit.files = ['scripts/a-guard.mjs', 'scripts/b-guard.mjs']
    const pass = (index, at, authoredBy) => ({
      sha: MERGE,
      authoredBy,
      model: 'Opus 5',
      reviewerAuthorship: {
        status: 'agreement',
        claimedModel: 'Opus 5',
        actualModel: 'Opus 5',
      },
      verdict: 'merge',
      evidence: `Checked the complete merge end state in pass ${index}.`,
      mode: 'review',
      handover: 'sol-authored',
      handoverChain: ['Opus 5', 'Fable 5', 'Opus 4.8'],
      pass: {
        index,
        total: 2,
        files: [commit.files[index - 1]],
        endState: MERGE,
      },
      at,
    })
    const beforeRepair = [
      pass(1, 1_788_000_001_000, ''),
      pass(2, 1_788_000_002_000, ''),
    ]
    const afterRepair = [
      pass(1, 1_788_000_003_000, 'GPT-5.6 Sol <noreply@openai.com>'),
      pass(2, 1_788_000_004_000, 'GPT-5.6 Sol <noreply@openai.com>'),
    ]
    const verdict = evaluateMechanismReview({
      baseline: 'base',
      head: MERGE,
      pendingCommits: [commit],
      records: [...beforeRepair, ...afterRepair],
    })

    expect(verdict.clear).toBe(true)
    expect(verdict.findings).toEqual([])
  })


  it('takes the parents from the commit object, so a graft in the log cannot hide the tip', () => {
    // `--no-replace-objects` disables refs/replace and NOTHING else: the log's
    // %P is still graft-aware, so at a shallow boundary a merge prints as
    // single-parented. Reading that left the merge with nothing to inherit.
    const grafted = [`${REC}${MERGE}${FLD}1788000000${FLD}${FIRST}`, '', 'scripts/x-guard.mjs', ''].join('\n')
    const [commit] = rangeCommits('base', 'head', ['scripts/x-guard.mjs'], {
      readLog: () => grafted,
      readParents: () => [FIRST, MERGED],
      readTrailers: (sha) => trailers[sha] ?? '',
    })

    expect(commit.parentShas).toEqual([FIRST, MERGED])
    expect(commit.parentAuthorModels).toEqual({ [MERGED]: ['GPT-5.6 Sol <noreply@openai.com>'] })
    const { groups } = planAuthorshipGroups({ commits: [commit], endStateFiles: commit.files })
    expect(groups[0].reviewer).toBeTruthy()
  })

  it('spends no object read on a commit that names its own model', () => {
    const authored = [`${REC}${MERGE}${FLD}1788000000${FLD}${FIRST} ${MERGED}`, '', 'scripts/x-guard.mjs', ''].join('\n')
    let reads = 0
    rangeCommits('base', 'head', ['scripts/x-guard.mjs'], {
      readLog: () => authored,
      readParents: () => {
        reads += 1
        return [FIRST, MERGED]
      },
      readTrailers: () => 'Claude Opus 5 <noreply@anthropic.com>',
    })

    expect(reads).toBe(0)
  })

  it('leaves an ordinary trailerless commit unknown, so absence is never an assignment', () => {
    const plain = [`${REC}${MERGE}${FLD}1788000000${FLD}${FIRST}`, '', 'scripts/x-guard.mjs', ''].join('\n')
    const [commit] = rangeCommits('base', 'head', ['scripts/x-guard.mjs'], {
      readLog: () => plain,
      readParents: () => [FIRST],
      readTrailers: () => '',
    })
    const { groups } = planAuthorshipGroups({ commits: [commit], endStateFiles: commit.files })

    expect(commit.parentAuthorModels).toEqual({})
    expect(groups[0].reviewer).toBe('')
  })
})

// THE PRODUCTION READ ITSELF, NOT A STAND-IN (cross-vendor review, GPT-5.6 Sol at
// effort high). Every case above injects `readParents`, which replaces the real
// command and the real parser — so they stay green if the wiring drops the
// no-replace flag or starts scanning past the header, and a `parent` line forged
// in a commit MESSAGE could then become authorship evidence.
describe('the default parent reader, exercised rather than replaced', () => {
  const SHA = 'a'.repeat(40)
  const REAL = 'b'.repeat(40)
  const FORGED = 'f'.repeat(40)

  it('asks git past refs/replace and ignores a parent line forged in the message', () => {
    const asked = []
    const parents = defaultParentReader(SHA, (cmd, options) => {
      asked.push({ cmd, options })
      return [
        `tree ${'0'.repeat(40)}`,
        `parent ${REAL}`,
        'author X <x@y> 1 +0000',
        '',
        'Merge branch ...',
        '',
        `parent ${FORGED}`,
        '',
      ].join('\n')
    })

    expect(parents).toEqual([REAL])
    expect(parents).not.toContain(FORGED)
    expect(asked).toHaveLength(1)
    expect(asked[0].cmd).toContain('--no-replace-objects')
    expect(asked[0].cmd).toContain('cat-file -p')
    // The whole object comes back although only the header is wanted, so the
    // read is bounded and its overflow fails closed.
    expect(asked[0].options?.maxBuffer).toBeGreaterThan(0)
  })

  it('is the reader rangeCommits ACTUALLY uses — the production wiring, not a stand-in', () => {
    // Every parent case above injects `readParents`, so none of them would notice
    // if rangeCommits stopped calling the default reader at all. This one injects
    // only the git runner, one layer below, and watches the real command go out.
    const REC = String.fromCharCode(0x1e)
    const FLD = String.fromCharCode(0x1f)
    const MERGED = 'c'.repeat(40)
    const commands = []
    const [commit] = rangeCommits('base', 'head', ['scripts/x-guard.mjs'], {
      // The LOG claims one parent, as a shallow graft would; the object names two.
      readLog: () => [`${REC}${SHA}${FLD}1788000000${FLD}${REAL}`, '', 'scripts/x-guard.mjs', ''].join('\n'),
      runGit: (cmd) => {
        commands.push(cmd)
        if (cmd.includes('cat-file -p')) {
          return [
            `tree ${'0'.repeat(40)}`,
            `parent ${REAL}`,
            `parent ${MERGED}`,
            'author X <x@y> 1 +0000',
            '',
            'Merge branch ...',
            '',
            `parent ${'f'.repeat(40)}`,
            '',
          ].join('\n')
        }
        return cmd.includes(MERGED) ? 'GPT-5.6 Sol <noreply@openai.com>' : ''
      },
    })

    expect(commit.parentShas).toEqual([REAL, MERGED])
    expect(commit.parentAuthorModels).toEqual({ [MERGED]: ['GPT-5.6 Sol <noreply@openai.com>'] })
    expect(commands.some((cmd) => cmd.includes('--no-replace-objects') && cmd.includes('cat-file -p'))).toBe(true)
    expect(commands.every((cmd) => cmd.startsWith('--no-replace-objects'))).toBe(true)
  })

  it('lets the read throw, so the bound is a refusal and not a truncation', () => {
    expect(() =>
      defaultParentReader(SHA, () => {
        throw new Error('ENOBUFS: stdout maxBuffer length exceeded')
      }),
    ).toThrow(/maxBuffer/)
  })
})

// AND A FAILED AUTHORSHIP READ MUST BLOCK. The exception used to travel to this
// file's top-level catch, which prints "allowing stop" and exits 0 — so one
// oversized or missing object anywhere in the measured range switched the gate
// off without touching a mechanism file.
describe('an authorship read that fails is typed, never shrugged off', () => {
  const SHA = 'a'.repeat(40)
  const REAL = 'b'.repeat(40)

  it('marks the failure so the gate can block on it', () => {
    let caught = null
    try {
      authorshipRead(() => {
        throw new Error('bad object')
      }, 'the parents of commit abc123')
    } catch (error) {
      caught = error
    }

    expect(caught?.authorshipUnreadable).toBe(true)
    expect(caught?.message).toContain('the parents of commit abc123')
    expect(caught?.message).toContain('bad object')
  })

  it('becomes the refusal the caller finally sees', () => {
    let caught = null
    try {
      authorshipRead(() => {
        throw new Error('ENOBUFS: stdout maxBuffer length exceeded')
      }, 'the parents of commit abc123')
    } catch (error) {
      caught = error
    }
    const answer = authorshipBlockResponse(caught)

    expect(answer.decision).toBe('block')
    expect(answer.reason).toContain('the parents of commit abc123')
    expect(answer.reason).toContain('maxBuffer')
    // The one wrong answer this whole repair exists to refuse.
    expect(answer.reason).toContain('An empty author list is not the answer')
  })

  it('lets the DISPLAY-ONLY subject degrade, because it may not be able to stop a gate', () => {
    // The opposite rule to its siblings, and deliberately so: the subject names
    // a commit in the refusal text and decides nothing. Making it fail closed
    // would let a commit with an enormous subject throw into the allow-stop
    // catch — the same bypass through the one read that has no authority.
    expect(
      readSubject('a'.repeat(40), () => {
        throw new Error('ENOBUFS: stdout maxBuffer length exceeded')
      }),
    ).toContain('subject unreadable')
    expect(readSubject('a'.repeat(40), () => 'a real subject')).toBe('a real subject')
  })

  it('returns the value untouched when the read succeeds', () => {
    expect(authorshipRead(() => ['x'], 'anything')).toEqual(['x'])
  })

  it('carries a failing parent read out of rangeCommits as a blocking failure', () => {
    const REC = String.fromCharCode(0x1e)
    const FLD = String.fromCharCode(0x1f)
    const log = [`${REC}${SHA}${FLD}1788000000${FLD}${REAL}`, '', 'scripts/x-guard.mjs', ''].join('\n')
    let caught = null
    try {
      rangeCommits('base', 'head', ['scripts/x-guard.mjs'], {
        readLog: () => log,
        readTrailers: () => '',
        readParents: () => {
          throw new Error('fatal: not a valid object name')
        },
      })
    } catch (error) {
      caught = error
    }

    expect(caught?.authorshipUnreadable).toBe(true)
  })

  it('carries a failing OWN trailer read out the same way — the read that decides everything', () => {
    // It decides `own`, both author fields, and whether the ancestry rule runs at
    // all, so it is the most load-bearing of the three and was the last to be
    // wrapped (cross-vendor review, GPT-5.6 Sol, second do-not-merge).
    const REC = String.fromCharCode(0x1e)
    const FLD = String.fromCharCode(0x1f)
    const log = [`${REC}${SHA}${FLD}1788000000${FLD}${REAL}`, '', 'scripts/x-guard.mjs', ''].join('\n')
    let caught = null
    try {
      rangeCommits('base', 'head', ['scripts/x-guard.mjs'], {
        readLog: () => log,
        readParents: () => [REAL],
        readTrailers: () => {
          throw new Error('ENOBUFS: stdout maxBuffer length exceeded')
        },
      })
    } catch (error) {
      caught = error
    }

    expect(caught?.authorshipUnreadable).toBe(true)
    expect(caught?.message).toContain('the trailers of commit')
  })

  it('carries a failing merged-parent trailer read out the same way', () => {
    const REC = String.fromCharCode(0x1e)
    const FLD = String.fromCharCode(0x1f)
    const MERGED = 'c'.repeat(40)
    const log = [`${REC}${SHA}${FLD}1788000000${FLD}${REAL} ${MERGED}`, '', 'scripts/x-guard.mjs', ''].join('\n')
    let caught = null
    try {
      rangeCommits('base', 'head', ['scripts/x-guard.mjs'], {
        readLog: () => log,
        readParents: () => [REAL, MERGED],
        readTrailers: (sha) => {
          if (sha === MERGED) throw new Error('fatal: bad object')
          return ''
        },
      })
    } catch (error) {
      caught = error
    }

    expect(caught?.authorshipUnreadable).toBe(true)
    expect(caught?.message).toContain('merged parent')
  })
})
