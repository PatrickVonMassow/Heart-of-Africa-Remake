// Stop hook (point 377): the four-eyes rule for a MECHANISM gets its own
// mechanism.
//
// "A new or changed guard is reviewed by the second model before it goes live"
// was the project's exemplar of enforcing rather than remembering — and the
// rule-corpus audit found it claimed a Stop check that had never been built. It
// was skipped in exactly the cases where it mattered. So: when the commits since
// the last confirmed baseline add or change a guard, a gate, a core beside one or
// a versioned git hook, the turn does not end until a review by a DIFFERENT model
// is recorded for that change.
//
// Decision logic: mechanism-review-core.mjs (pure, Vitest-covered). This wrapper
// only gathers git output and the two state files, and is fail-OPEN — an internal
// error never traps the session. It stands down while .claude/batch-paused exists
// and for a session that does not own the batch lock.
//
// RECOVERY: the baseline is per branch local state. Its absence blocks once and
// seeds a fixed tracked-history anchor; it never self-arms at HEAD, because on
// main that would forgive every outstanding review in one empty-range turn.
//
// How the gate clears:
//   node scripts/mechanism-review.mjs --record <sha> --model <name> \
//       --verdict <merge|merge-with-fixes|do-not-merge> --evidence "<one line>" \
//       --mode <review|blind-parallel>
// CLI:
//   node scripts/mechanism-review-guard.mjs --status
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync, execSync } from 'node:child_process'
import { dirname } from 'node:path'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { readRecords, verifyCarried } from './mechanism-review.mjs'
import {
  CONTRIBUTION_DISPOSITION_KIND,
  CONTRIBUTION_SCOPE_BOUNDARY,
  evaluateMechanismReview,
  formatMechanismReviewVerdict,
  LEGACY_CONTRIBUTION_BASELINE,
  mechanismPathsIn,
  LEGACY_RANGE_RETIREMENT_REASON,
  modelFromTrailers,
  modelsFromTrailers,
} from './mechanism-review-core.mjs'
import {
  mechanismLogCommand,
  parseRangeLog as parseWholeRangeLog,
  planAuthorshipGroups,
  reviewEndStateFiles,
} from './mechanism-review-range-core.mjs'
import { quotePassFile, unquoteGitPath } from './review-material-core.mjs'
import {
  decideContributionReviewGap,
  formatContributionReviewGap,
  guardOutcome,
} from './mechanism-review-guard-gap-core.mjs'
import { gatherGuardDutyContext } from './guard-duty.mjs'

const PAUSE = repoPath('.claude/batch-paused')

/** Per-branch baseline. Local bookkeeping ("what this tree has confirmed"), so
 *  it is deliberately NOT tracked: a shared file would conflict on every branch,
 *  while the ledger that must travel — the reviews — is the tracked one. */
export const BASELINE_PATH = repoPath('.claude/mechanism-review-baseline.json')

/** The reviewed source revision immediately before fail-closed recovery. Unlike
 * a timestamp or ledger field, reachability from this immutable commit is not a
 * value the recording hand can edit. */
export const BASELINE_RECOVERY_ANCHOR = '28293f97ce0149a9936593733763fd20e62b13e7'

// The record/field sentinels and the header shape of the one `git log` this
// guard runs now live with the parser that owns them, in
// mechanism-review-range-core.mjs — including WHY they are raw control bytes
// and why the header carries no free text. This file only consumes them.

const git = (cmd) => execSync(`git ${cmd}`, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' }).trim()

/** The NO-SHELL lane for the two path-carrying commands (round-5 pass 3): on
 *  Windows, execSync routes through cmd.exe, which expands `%x1e%`-shaped
 *  spans as environment variables BEFORE git sees the format string — the
 *  headers then never appear and an empty parse would clear the gate. An args
 *  array through execFileSync reaches git verbatim on every platform. The
 *  output is UNTRIMMED — its last line can be a PATH, and trimming the log
 *  would strip a real trailing space off it (cross-vendor review, third
 *  round). */
const gitRawFile = (args) =>
  execFileSync('git', args, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' })

/**
 * True when `sha` names no reachable commit — the ONE condition under which an
 * undiffable range may move the gate. A git failure here answers "cannot tell",
 * which counts as PRESENT: the gate then stays where it is rather than
 * recovering on a question it could not answer.
 *
 * The revision stays QUOTED for the same reason `bootstrapBase` does: cmd.exe
 * eats a bare `^`, and an unquoted probe would call every baseline gone.
 */
export function commitMissing(sha, run = (cmd) => execSync(cmd, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' })) {
  try {
    run(`git rev-parse --verify --quiet "${sha}^{commit}"`)
    return false
  } catch (e) {
    // Exit 1 is git's own quiet "no such revision". Anything else — 128, or a
    // spawn failure with no status at all under parallel-agent load — means the
    // probe could not answer, and an unanswered question counts as PRESENT.
    return e?.status === 1
  }
}

function readBaselineState() {
  try {
    const s = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    return s && typeof s === 'object' ? s : {}
  } catch {
    return {}
  }
}

function writeBaseline(branch, head) {
  const state = readBaselineState()
  const baselines = { ...(state.baselines ?? {}), [branch]: head }
  mkdirSync(dirname(BASELINE_PATH), { recursive: true })
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ ...state, baselines }, null, 2)}\n`)
}

/**
 * The baseline this branch is judged against. A branch without one falls back to
 * main's: without that fallback a fresh feature branch would bootstrap at its own
 * HEAD and grandfather the very mechanism it just added — the hole that makes the
 * gate look green precisely where it should bite.
 */
export function baselineFor(state, branch) {
  const map = state?.baselines ?? {}
  return map[branch] ?? map.main ?? state?.baseline ?? null
}

// Size only the contributions the evaluator still says are owed. A stale
// baseline increases this list but never enters a contribution's material, so
// accumulated history cannot turn a runnable commit into a review gap. Planner
// failure stays fail-closed: an unmeasured contribution earns no suspension.
export async function measureReviewGap({
  blocked = false,
  commits = [],
  loadPlanner = () => import('./review-sol.mjs'),
}) {
  if (!blocked) return { gap: null, sizedPlan: null }
  let sizedPlan = null
  try {
    const { buildContributionPassPlan } = await loadPlanner()
    sizedPlan = buildContributionPassPlan({ commits })
  } catch {
    /* no measured contribution plan — the decision below fails closed */
  }
  const decision = decideContributionReviewGap({ blocked, plan: sizedPlan })
  const gap = {
    ...decision,
    report: decision.gap ? formatContributionReviewGap(decision) : '',
  }
  return { gap, sizedPlan }
}

/**
 * Re-derive the one-time historical retirement stamp from immutable Git facts.
 * A hand-edited ledger row cannot choose its own boundary, counts or reason;
 * later contributions are ineligible even when they copy the complete shape.
 */
export function attachContributionDispositions(
  records = [],
  isAncestor = (ancestor, descendant) => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
        windowsHide: true,
        cwd: REPO_ROOT,
      })
      return true
    } catch {
      return false
    }
  },
) {
  for (const row of records ?? []) delete row.contributionDispositionVerified
  for (const row of records ?? []) {
    if (row?.kind !== CONTRIBUTION_DISPOSITION_KIND || row?.disposition !== 'retired') continue
    const measured = row.measurement
    const exactMeasurement =
      measured?.measuredOn === '2026-08-26' &&
      measured?.point === 943 &&
      measured?.passesAtOpen === 45 &&
      measured?.passesAtClose === 42 &&
      measured?.passesOnMain === 115
    if (
      row.scopeBoundary !== CONTRIBUTION_SCOPE_BOUNDARY ||
      row.reason !== LEGACY_RANGE_RETIREMENT_REASON ||
      !exactMeasurement ||
      !/^[0-9a-f]{40}$/.test(String(row.sha ?? '')) ||
      isAncestor(row.sha, LEGACY_CONTRIBUTION_BASELINE) ||
      !isAncestor(row.sha, CONTRIBUTION_SCOPE_BOUNDARY)
    ) continue
    row.contributionDispositionVerified = true
  }
  return records
}

/**
 * Recover a missing local baseline from one immutable, tracked history point.
 * There is deliberately no HEAD or main fallback: on main both resolve to HEAD,
 * producing an empty range and silently forgiving all existing debt.
 */
export function bootstrapBase(
  head,
  revParse = (r) => git(`rev-parse ${r}`),
  isAncestor = (base, tip) => {
    execFileSync('git', ['merge-base', '--is-ancestor', base, tip], { windowsHide: true, cwd: REPO_ROOT })
    return true
  },
) {
  try {
    const base = revParse(`--verify --quiet "${BASELINE_RECOVERY_ANCHOR}^{commit}"`)
    if (!base || isAncestor(base, head) !== true) return null
    return base
  } catch {
    return null
  }
}

/** The current scripts/ listing — needed for the "a core beside a guard" rule. */
function scriptFiles() {
  try {
    return readdirSync(repoPath('scripts'))
  } catch {
    return []
  }
}

/** Commits in base..head that touch a mechanism path, oldest first.
 *
 *  `--diff-merges=cc` is load-bearing, and the WEAKER `first-parent` was worse
 *  than none (four-eyes review, 27.07.2026, both readings measured on real
 *  history). By default `git log --name-only` prints NO files for a merge, so a
 *  guard rewritten while RESOLVING a conflict — the case CLAUDE.md §6 tells the
 *  merging session to be careful about — was invisible: the turn cleared and the
 *  baseline advanced past it for good. But `first-parent` lists everything the
 *  merge brought in, so every clean merge of a mechanism branch became a pending
 *  commit that no branch-head record can cover (a merge is not an ancestor of the
 *  branch it merges) — the gate would have blocked its own landing, every time,
 *  and merges carry no model trailer, so the self-review refusal could not even
 *  bite on the record the trapped session would write. `cc` shows only what the
 *  merge changed against ALL its parents: nothing for a clean merge, the
 *  resolution delta for an evil one. */
/**
 * The pure half of mechanismCommits: the raw `git log --name-only` output,
 * parsed into the commits that touch a mechanism path. EXPORTED for the test —
 * the parsing IS the gate's view of the tree, and two of its old habits each
 * blinded it to a legal path (cross-vendor review, second and third rounds):
 *
 *  - a path is read BYTE-EXACT, never trimmed. git does not quote a plain
 *    leading or trailing space, so `scripts/git-hooks/check ` printed as-is and
 *    the trim turned it into a DIFFERENT path — one a pass record could then
 *    name in the trimmed spelling and satisfy the union without anyone reading
 *    the changed file. Only a trailing `\r` is stripped: a path really ending
 *    in `\r` is git-quoted, so a bare one is line-ending noise.
 *  - a header is a LINE matching the full header shape, never a `split(REC)`:
 *    the sentinel is a legal path substring, and the split cut such a commit's
 *    record in half. RESIDUAL, accepted: a committed path whose whole line
 *    mimics the header shape (sentinel + 40-hex sha + epoch) would still be
 *    read as one — that shape names itself as adversarial, and git quotes any
 *    path that could smuggle a newline to fake a line of its own.
 *
 * The header carries NO free-text field — the subject and the trailers travel
 * per commit through commitFacts (escalation round, pass 2) — so this parser
 * returns { sha, at, files } and the wrapper adds who wrote it.
 *
 * git QUOTES a path with a tab, a quote or a high byte in it, and the quoted
 * form matches neither a mechanism path nor a pass record's file list — so
 * every path line goes through unquoteGitPath.
 */
export function parseRangeLog(out) {
  return parseWholeRangeLog(out, { decodePath: unquoteGitPath })
}

export function parseMechanismLog(out, files) {
  return parseRangeLog(out)
    .map((commit) => ({ ...commit, files: mechanismPathsIn(commit.files, { scriptFiles: files }) }))
    .filter((commit) => commit.files.length)
}

/** Select mechanism contributions without shrinking their review file set. */
export function pendingReviewContributions(commits = [], files = [], subjectFor = () => '') {
  return (commits ?? [])
    .filter((commit) => (commit.mechanismFiles ?? mechanismPathsIn(commit.files, { scriptFiles: files })).length)
    .map((commit) => ({
      ...commit,
      mechanismFiles: commit.mechanismFiles ?? mechanismPathsIn(commit.files, { scriptFiles: files }),
      subject: subjectFor(commit.sha),
      files: reviewEndStateFiles(commit.files),
    }))
}

/**
 * The free-text facts of ONE commit — its subject and its co-author trailers —
 * each through its own single-format `git show`, so no separator exists for a
 * crafted subject to forge (escalation round, pass 2: the combined format's
 * separator inside a legal subject shifted the trailers out of their field,
 * and the self-review refusal read an empty author). Two calls per PENDING
 * MECHANISM commit only — the common turn has none.
 */
function commitFacts(sha) {
  return {
    subject: git(`show -s --format=%s "${sha}"`),
    trailers: git(`show -s --format="%(trailers:key=Co-Authored-By,valueonly,separator=;)" "${sha}"`),
  }
}

/**
 * The two path-carrying git commands, built pure so the unit layer can pin
 * their flags (round-1 pass 2, both findings):
 *  - `-c core.quotepath=on` makes the LOG's path spelling CONFIG-INDEPENDENT:
 *    with a user's `core.quotePath=false`, a legal non-UTF-8 file name arrived
 *    as raw bytes and the UTF-8 decode collapsed distinct paths into one
 *    replacement-character spelling. Quoted-on, every such byte travels as a
 *    pure-ASCII octal escape and unquoteGitPath decodes it; what remains
 *    undecodable surfaces as U+FFFD, which the pass records can never name
 *    (parsePassFiles refuses it), so a conflated path can only ever DENY a
   *    clearance.
 *  - `--no-renames` closes the rename-out blindness: with rename detection on,
 *    `--name-only` reports only the DESTINATION, so renaming a guard to an
 *    ordinary path hid the mechanism's removal from the gate. Split into
 *    delete + add, BOTH spellings are listed and the old guard path still
 *    demands its review.
 */
export { mechanismLogCommand }

function rangeCommits(base, head, files) {
  const out = gitRawFile(mechanismLogCommand(base, head))
  return parseRangeLog(out).map((commit) => {
    const trailers = git(`show -s --format="%(trailers:key=Co-Authored-By,valueonly,separator=;)" "${commit.sha}"`)
    return {
      ...commit,
      authorModel: modelFromTrailers(trailers),
      // EVERY co-author, not only the first: a commit naming two models has
      // two list authors, and neither may merge the union (point 634).
      authorModels: modelsFromTrailers(trailers),
      mechanismFiles: mechanismPathsIn(commit.files, { scriptFiles: files }),
    }
  })
}

/**
 * Everything the core needs — exported so the guard preflight judges the gate
 * from the SAME gathering the Stop hook uses rather than a second copy of this
 * git work, which would drift and hand back a false "clean". Read-only: arming
 * and advancing the baseline stay in the main path below.
 */
export function gatherMechanismReviewInputs({ sessionId = '', guardDuty = gatherGuardDutyContext } = {}) {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  if (heldByOtherLiveOwner(sessionId)) {
    return {
      applicable: false,
      why: 'another live session owns the batch lock',
      cause: 'not-lock-owner',
    }
  }
  const head = git('rev-parse HEAD')
  let branch = 'HEAD'
  try {
    branch = git('rev-parse --abbrev-ref HEAD')
  } catch {
    /* detached or unborn — the 'HEAD' key is as good a bucket as any */
  }
  const state = readBaselineState()
  const stored = baselineFor(state, branch)
  const baselineMissing = !stored
  const baseline = stored || bootstrapBase(head)

  if (!baseline) {
    return {
      applicable: true,
      head,
      branch,
      baseline: null,
      baselineMissing: true,
      rangeBase: null,
      inputs: { baseline: null, baselineMissing: true, head, pendingCommits: [], records: [], sessionId },
      commits: [],
      debt: { outstanding: [], invalidatedCoverage: [] },
      authorshipPlan: { groups: [], unreviewable: [] },
    }
  }

  // Diff from merge-base, never the raw baseline: on a feature branch the
  // baseline sits on main, and a two-dot diff would re-show main's own (already
  // confirmed) mechanism work as pending.
  let base = baseline
  let rangeBase = null
  try {
    base = git(`merge-base "${baseline}" "${head}"`)
    if (base) rangeBase = base
  } catch {
    /* unrelated baseline — the raw range below decides, or re-arms us at HEAD */
  }
  let effective = baseline
  let pendingCommits = []
  let commits = []
  if (base !== head) {
    try {
      commits = rangeCommits(base, head, scriptFiles())
      pendingCommits = pendingReviewContributions(commits, scriptFiles(), (sha) => commitFacts(sha).subject)
    } catch (e) {
      // ONLY a baseline that is genuinely GONE may move the gate. A baseline
      // rebased away or gc'd makes the range undiffable forever, and falling
      // through to the wrapper's fail-open would disable the gate permanently,
      // because nothing would ever move the baseline again.
      //
      // Every OTHER failure must NOT move it: a spawn error under parallel-agent
      // load and execSync's 1 MiB buffer on a long log are both real here, and
      // recovering from those would forgive pending unreviewed commits for good —
      // fail-open ONCE turned into fail-open FOREVER (the lesson render-verify
      // learned with its typed BaselineDiffError). Those rethrow into the
      // wrapper's per-turn fail-open, which leaves the gate exactly where it was.
      if (!commitMissing(baseline)) throw e
      // Recover at the FORK POINT, not at HEAD: HEAD would grandfather this
      // branch's own pending mechanism work in the act of recovering. The range
      // is then judged for real — a recovery that reported "clear" without
      // looking would be the same silent pass in a new place.
      effective = bootstrapBase(head)
      if (!effective) {
        return {
          applicable: true,
          head,
          branch,
          baseline: null,
          baselineMissing: true,
          rangeBase: null,
          inputs: { baseline: null, baselineMissing: true, head, pendingCommits: [], records: [], sessionId },
          commits: [],
          debt: { outstanding: [], invalidatedCoverage: [] },
          authorshipPlan: { groups: [], unreviewable: [] },
        }
      }
      base = effective
      rangeBase = null
      try {
        base = git(`merge-base "${effective}" "${head}"`)
        if (base) rangeBase = base
      } catch {
        /* the raw range below decides */
      }
      commits = base === head ? [] : rangeCommits(base, head, scriptFiles())
      pendingCommits = pendingReviewContributions(commits, scriptFiles(), (sha) => commitFacts(sha).subject)
    }
  }

  // Which recorded reviews CONTAIN each pending commit (see attachCoverage for
  // the cost rule this obeys). Nothing pending means nothing to cover, and the
  // ledger is not even read then: the overwhelmingly common turn changes no
  // mechanism at all, and a hook that costs a process per ledger line on every
  // turn end is a hook people switch off.
  // Carried rows are RE-MEASURED on every read (delta rounds, 18.08.2026):
  // the blob-identity stamp is the wrapper's, never the ledger's own word.
  const records = attachContributionDispositions(verifyCarried(attachCoverage({
    pendingCommits,
    allRecords: pendingCommits.length ? readRecords() : [],
    effective,
    head,
    revList: (rev) => git(`rev-list ${rev} --not ${effective}`),
  })))

  // Authorship is also contribution-local. Grouping the whole baseline range
  // by its last file writers was the same unbounded scope in another form.
  const groups = pendingCommits.flatMap(
    (commit) => planAuthorshipGroups({ commits: [commit], endStateFiles: commit.files }).groups,
  )
  const authorshipPlan = { groups, unreviewable: groups.filter((group) => !group.reviewer) }

  return {
    applicable: true,
    head,
    branch,
    baseline: effective,
    // Null if git could not establish a merge-base: pending detection may keep
    // using its conservative raw fallback, but that unproved range can never
    // support a gap waiver.
    rangeBase,
    inputs: {
      baseline: effective,
      baselineMissing,
      head,
      pendingCommits,
      records,
      sessionId,
      fence: guardDuty({ sessionId }),
      authorshipPlan,
      endStateFiles: null,
    },
    commits,
    debt: { outstanding: pendingCommits, invalidatedCoverage: [] },
    authorshipPlan,
  }
}

/**
 * Attach, to every pending commit, the shas of the recorded reviews that CONTAIN
 * it — and do it in a number of git calls BOUNDED BY CONSTRUCTION.
 *
 * THE COST RULE (point 387). A check inside the unit layer that walks REAL git
 * history is bounded by construction, not by a raised timeout. This probe is the
 * reason the rule exists: it began as one git process per (pending commit,
 * record) PAIR — 13 × 52 ≈ 700 processes, 26 to 38 s past the check's own budget
 * — so CI failed on every push of a long-lived guard branch and mailed the
 * repository owner thirteen times through the night of 30.07.2026 while the tree
 * was green locally. Its budget had already been raised once; a second raise
 * would have hidden it again.
 *
 * WORST CASE, and it does not depend on the ledger's size: 1 + R calls, where R
 * is the number of records that lie on THIS branch (in practice a handful, and
 * zero on the overwhelmingly common turn, which has no pending mechanism commit
 * at all). Never 1 per pair, never 1 per ledger line. `revList(rev)` answers
 * "everything `rev` reaches that `effective` does not".
 *
 * The narrowing to branch records is EXACT, not an approximation: a record can
 * only cover a pending commit when that commit is reachable from the record's
 * sha and NOT from `effective`, so the record's own sha must itself lie in
 * `effective..head`. A record at or before `effective` reaches nothing that
 * `effective` does not, so its contained set is empty by construction.
 */
export function attachCoverage({ pendingCommits = [], allRecords = [], head, revList, rangeFiles = null }) {
  const lines = (rev) =>
    new Set(
      String(revList(rev) ?? '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    )
  // Call 1 of 1 + 2R: the whole branch range, which selects the records at all.
  const branchRange = pendingCommits.length ? lines(head) : new Set()
  const records = (pendingCommits.length ? allRecords : []).filter((r) => branchRange.has(r.sha))
  // Calls 2..1+2R: two per SURVIVING record — the reviews recorded on this
  // branch, never the whole ledger. `rangeFiles` is what a record at that sha
  // would CLEAR: the file set of `effective..record.sha`, which the gate holds
  // a pass composition's union against (escalation round). An unanswerable
  // diff attaches nothing, and the gate then falls back to the pending
  // commit's own mechanism paths — a NARROWER expected set, so the failure
  // can only ever demand less, never clear more.
  for (const r of records) {
    r.containedShas = lines(r.sha)
    // MEASURED HERE OR NOT AT ALL (round-4 pass 3): the ledger accepts extra
    // fields, so a hand-written row could arrive CARRYING a rangeFiles of its
    // own — and surviving the failed measurement below, it would stand in for
    // the trusted diff. The field is stripped before the measurement, so the
    // only value it can ever hold is this guard's own.
    delete r.rangeFiles
    if (rangeFiles) {
      try {
        const files = rangeFiles(r.sha)
        if (Array.isArray(files)) r.rangeFiles = files.map((f) => String(f))
      } catch {
        /* unanswered — rangeFiles stays absent, and the evaluator treats an
           unmeasured range as UNKNOWN coverage, which BLOCKS (round-3 pass 3:
           the old fallback narrowed the demand to the commit's own paths
           exactly when nothing could say what the range really changed) */
      }
    }
  }
  for (const c of pendingCommits) {
    c.coveringRecordShas = records.filter((r) => r.containedShas?.has(c.sha)).map((r) => r.sha)
  }
  return records
}

if (isMainModule(import.meta.url)) {
  const status = process.argv[2] === '--status'
  try {
    let sessionId = ''
    try {
      sessionId = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      /* manual run — the gate is global truth, not session-local */
    }

    const gathered = gatherMechanismReviewInputs({ sessionId })
    if (!gathered.applicable) {
      if (status) console.log(`mechanism-review-guard stands down: ${gathered.why}`)
      process.exit(0)
    }

    const verdict = evaluateMechanismReview(gathered.inputs)

    // Recovery is a two-turn operation: this turn reports and refuses the
    // missing evidence; a non-status Stop invocation may seed only the immutable
    // anchor, never HEAD. The next turn then judges the full anchor..HEAD range.
    if (!status && gathered.baselineMissing && gathered.baseline) {
      writeBaseline(gathered.branch, gathered.baseline)
    }

    if (verdict.deferred) {
      // Leave the baseline behind the pending mechanism range: that range is
      // the successor's inbox, not a clearance by the fenced session.
      process.stdout.write(JSON.stringify({ systemMessage: verdict.reason }))
      process.exit(0)
    }

    // THE GAP CLAUSE NOW MEASURES EACH OWED CONTRIBUTION IN ISOLATION. The
    // baseline decides how many findings exist, never how much material one
    // finding carries. One runnable commit keeps blocking; only an entirely
    // measured list of individually unassemblable commits may report a gap.
    const owedBySha = new Map()
    for (const finding of verdict.findings ?? []) {
      const commit = finding?.commit
      if (commit?.sha && !owedBySha.has(commit.sha)) owedBySha.set(commit.sha, commit)
    }
    const owedContributions = [...owedBySha.values()]
    const { gap, sizedPlan: sizedGapPlan } = await measureReviewGap({
      blocked: verdict.block,
      commits: owedContributions,
    })
    const outcome = guardOutcome({ blocked: verdict.block, gap })

    if (status) {
      let statusPlan = sizedGapPlan
      if (owedContributions.length) {
        try {
          if (!statusPlan) {
            const { buildContributionPassPlan } = await import('./review-sol.mjs')
            statusPlan = buildContributionPassPlan({ commits: owedContributions })
          }
        } catch {
          /* the status names an unavailable plan instead of inventing a count */
        }
      }
      console.log(`HEAD:      ${gathered.head.slice(0, 7)} (branch ${gathered.branch})`)
      console.log(`baseline:  ${String(gathered.baseline ?? '<none — arms at this HEAD>').slice(0, 7)}`)
      const pending = gathered.inputs.pendingCommits ?? []
      console.log(`mechanism commits since the baseline: ${pending.length}`)
      for (const c of pending) {
        console.log(
          // Quoted like every structural path list (round-3 pass 3): the log
          // parser unquotes git's spelling, so a legal newline or comma in a
          // name could forge a --status line if joined raw.
          `  ${c.sha.slice(0, 7)}  ${c.files.map((f) => quotePassFile(f)).join(', ')}\n      authored by ${c.authorModel || 'unknown'}, ` +
            `${c.coveringRecordShas.length} covering review(s)`,
        )
      }
      console.log(`outstanding review contributions: ${owedContributions.length}`)
      console.log(`outstanding review passes: ${statusPlan?.passCount ?? '<plan unavailable>'}`)
      if (statusPlan) {
        const { formatContributionPassPlan } = await import('./review-sol.mjs')
        console.log(formatContributionPassPlan(statusPlan))
      }
      if (outcome.action === 'report-gap') console.log(`\n${gap.report}`)
      else console.log(
        verdict.block
          ? `\n${formatMechanismReviewVerdict(verdict, { authorshipPlan: gathered.authorshipPlan })}`
          : '\nGATE CLEAR',
      )
      process.exit(0)
    }

    if (outcome.action === 'report-gap') {
      // The gap holds: name it where the session sees it, and let the turn
      // end. Deliberately NOT a baseline advance — the demand is suspended,
      // never satisfied, and blocking resumes when the material fits again.
      console.error(gap.report)
      process.exit(0)
    }
    if (outcome.action === 'block') {
      process.stdout.write(
        JSON.stringify({
          decision: 'block',
          reason: formatMechanismReviewVerdict(verdict, { authorshipPlan: gathered.authorshipPlan }),
        }),
      )
      process.exit(0)
    }
    // Clear (or bootstrapping): pin the confirmed state so the next turn starts
    // from here instead of re-walking history.
    if (gathered.head) writeBaseline(gathered.branch, gathered.head)
    process.exit(0)
  } catch (e) {
    // AN UNREADABLE LEDGER IS NOT AN ENVIRONMENT TRANSIENT (cross-vendor review
    // of point 780). The ledger IS this gate's evidence: without it the gate
    // cannot tell a reviewed mechanism from an unreviewed one, so the fail-open
    // catch below would wave through exactly what it exists to stop.
    if (e && e.ledgerUnreadable) {
      process.stdout.write(
        JSON.stringify({
          decision: 'block',
          reason:
            `mechanism-review-guard: the review ledger cannot be read, so nothing here can be proven reviewed.\n` +
            `  ${e.message}\n` +
            '  Repair the ledger (it is tracked in git) and end the turn again.',
        }),
      )
      process.exit(0)
    }
    console.error(`mechanism-review-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
