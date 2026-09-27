// Stop hook (point 377): the four-eyes rule for a MECHANISM gets its own
// mechanism.
//
// "A new or changed guard is reviewed by the second model before it goes live"
// was the project's exemplar of enforcing rather than remembering — and the
// rule-corpus audit found it claimed a Stop check that had never been built. It
// was skipped in exactly the cases where it mattered. So: when the commits since
// the last confirmed baseline add or change a guard, a gate, a core beside one or
// a versioned git hook, a review by a model of a DIFFERENT vendor is owed for that
// change — and was meant to hold the turn until recorded (switched off, below).
//
// Decision logic: mechanism-review-core.mjs (pure, Vitest-covered). This wrapper
// gathers git output and the two state files, and runs the gap measurement and
// the contribution planning for the report. An internal error does not trap the
// session; the typed ledger and authorship read failures print a block response.
//
// THAT BLOCK IS SWITCHED OFF (point 1036) — see GATE_SWITCHED_OFF below for why
// and how to reverse it. What remains is the MEASUREMENT: `--status` reports the
// outstanding debt in full, to whoever asks, under any lock or pause.
//
// RECOVERY: the baseline is per branch local state. A missing one is reported
// and the range is judged from a fixed tracked-history anchor; it never
// self-arms at HEAD, because on main that would forgive every outstanding review
// in one empty-range turn.
//
// How the debt clears:
//   node scripts/mechanism-review.mjs --record <sha> --model <name> \
//       --verdict <merge|merge-with-fixes|do-not-merge> --evidence "<one line>" \
//       --mode <review|blind-parallel>
// CLI:
//   node scripts/mechanism-review-guard.mjs --status
import { readdirSync, readFileSync } from 'node:fs'
import { execFileSync, execSync } from 'node:child_process'
import { commonRepoPath, REPO_ROOT, repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { readOwnerLock } from './batch-singleton.mjs'
import { readRecords, verifyCarried } from './mechanism-review.mjs'
import {
  CONTRIBUTION_DISPOSITION_KIND,
  CONTRIBUTION_SCOPE_BOUNDARY,
  contributionRetiredBy,
  evaluateMechanismReview,
  formatMechanismReviewVerdict,
  LEGACY_CONTRIBUTION_BASELINE,
  mechanismPathsIn,
  LEGACY_RANGE_RETIREMENT_REASON,
  modelFromTrailers,
  modelVendor,
  modelsFromTrailers,
  verifiedPlannerPasses,
} from './mechanism-review-core.mjs'
import {
  commitObjectParents,
  mechanismLogCommand,
  parseRangeLog as parseWholeRangeLog,
  planAuthorshipGroups,
  reviewEndStateFiles,
  withResolvedCommitAuthors,
} from './mechanism-review-range-core.mjs'
import { quotePassFile, unquoteGitPath } from './review-material-core.mjs'
import {
  decideContributionReviewGap,
  formatContributionReviewGap,
  guardOutcome,
} from './mechanism-review-guard-gap-core.mjs'
import { gatherGuardDutyContext } from './guard-duty.mjs'
import { buildAuthorshipPassPlan, formatContributionPassPlan } from './review-astra.mjs'


// SWITCHED OFF, NOT REBUILT (CLAUDE.md §2 infrastructure freeze, user decision
// 01.09.2026; point 1036). What is recorded here is the DECISION and what was
// measured, not a theory of why the gate behaved as it did:
//   · it refused every merge, so the batch's whole throughput stood behind it;
//   · fourteen cross-vendor rounds in one day, every finding answered, did not
//     clear it, and each round's fixes added a contribution of their own;
//   · CLAUDE.md §2 says a rule that is in the way is switched off, not rebuilt.
// Two causes were proposed along the way and are NOT claimed here: a
// ledger-only commit owes no round (the contribution selection already excludes
// it), and one follow-up review per fix is ordinary practice, not a regress.
//
// What is switched off is the automatic BLOCK, and only that. The four-eyes
// rule of CLAUDE.md §6 stands as practice; nothing is deleted, forgiven or
// retired, and the debt stays measurable in full through the guard's own
// report:
//
//   node scripts/mechanism-review-guard.mjs --status
//
// Reversing this means restoring the Stop path (block, gap suspension and
// baseline advance) that was removed as unreachable after the switch-off — see
// the git history of this file — and dropping the stand-down in the gathering.
export const GATE_SWITCHED_OFF =
  'the four-eyes mechanism gate no longer blocks — switched off under the infrastructure ' +
  'freeze (CLAUDE.md §2, user decision 01.09.2026) after it refused every merge and ' +
  'fourteen cross-vendor rounds in one day did not clear it. The debt is not forgiven ' +
  'and stays readable: node scripts/mechanism-review-guard.mjs --status'

/** WHAT THE REPORT PRINTS IS DECIDED BY THE FINDINGS, NEVER BY `block`
 * (cross-vendor review of point 1036). A deferred verdict carries its findings
 * and sets `block` false, so a status keyed on `block` announced GATE CLEAR
 * over a real debt — and with the block switched off that keying is wrong for
 * good, because `block` no longer decides what the report prints (it still
 * selects whether the gap is measured). */
export const statusReportsFindings = (verdict) => (verdict?.findings?.length ?? 0) > 0

/** Per-branch baseline. Host-local rather than tracked, but shared by every
 * linked worktree: a disposable checkout must see main's branch baselines and
 * must not recover from the tracked-history anchor merely because it lives at
 * another path. The branch-keyed map still keeps branch decisions separate. */
export const BASELINE_PATH = commonRepoPath('.claude/mechanism-review-baseline.json')

/** The reviewed source revision immediately before fail-closed recovery. Unlike
 * a timestamp or ledger field, reachability from this immutable commit is not a
 * value the recording hand can edit. */
export const BASELINE_RECOVERY_ANCHOR = '28293f97ce0149a9936593733763fd20e62b13e7'

const git = (cmd, options = {}) =>
  execSync(`git ${cmd}`, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8', ...options }).trim()

/** The NO-SHELL lane for the path-carrying log command (round-5 pass 3): on
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
 * True when `sha` resolves to no commit object — the ONE condition under which an
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

/**
 * The recovery predicate of the switched-off Stop path: a blocked turn could seed
 * only the IMMUTABLE anchor, never HEAD. Only `--status` gathers now, and a
 * `--status` read decides nothing and therefore writes nothing, so nothing seeds.
 *
 * Both facts must come from the SAME shape — the gathered result reports the
 * flag and the anchor side by side, and this predicate is what a test can pin.
 * PURE.
 */
export function shouldSeedRecoveryAnchor(gathered, { status = false } = {}) {
  return status !== true && gathered?.baselineMissing === true && Boolean(gathered?.baseline)
}

/**
 * Whose session a guard invocation belongs to.
 *
 * A Stop payload's id is used as given (the Stop path stands down while the gate
 * is off). A manual `--status` invocation has no payload, however, and is the read-only
 * command every refusal prints. Resolve that inspection through the same two
 * honest fallbacks as guard-preflight: the caller's environment, then the live
 * lock's recorded owner. Without this distinction the owner's own bare status
 * command supplied `''`, identified itself as a stranger, and printed no debt
 * or runnable repair command at all.
 */
export function resolveMechanismReviewSessionId({
  payloadSessionId = '',
  status = false,
  env = process.env,
  readLock = readOwnerLock,
} = {}) {
  if (payloadSessionId) return String(payloadSessionId)
  if (!status) return ''
  if (env?.CLAUDE_SESSION_ID) return String(env.CLAUDE_SESSION_ID)
  try {
    const lock = readLock()
    if (lock?.sessionId) return String(lock.sessionId)
  } catch {
    /* unreadable lock — the id stays empty; --status still measures */
  }
  return ''
}

function readBaselineState() {
  try {
    const s = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    return s && typeof s === 'object' ? s : {}
  } catch {
    return {}
  }
}

/**
 * The baseline this branch is judged against. A branch without one falls back to
 * main's: without that fallback a fresh feature branch would read as missing its
 * baseline and be judged from the fixed recovery anchor rather than from main's
 * confirmed state.
 */
export function baselineFor(state, branch) {
  const map = state?.baselines ?? {}
  return map[branch] ?? map.main ?? state?.baseline ?? null
}

// Size only the contributions the evaluator still says are owed. A stale
// baseline increases this list but never enters a contribution's material, so
// accumulated history cannot turn a runnable commit into a review gap. Planner
// failure stays fail-closed: an unmeasured contribution earns no gap ruling.
export async function measureReviewGap({
  blocked = false,
  commits = [],
  loadPlanner = () => import('./review-astra.mjs'),
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

/**
 * The raw `git log --name-only` output of base..head, parsed into EVERY commit
 * of the range with its files, oldest first (mechanism selection happens later,
 * in pendingReviewContributions). The parsing lives in
 * mechanism-review-range-core.mjs, which the gate, the criticality guard and the
 * planners share; this wrapper only adds git's path unquoting.
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
 *  resolution delta for an evil one.
 *
 * Two old habits of the parser each blinded it to a legal path (cross-vendor
 * review, second and third rounds):
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
 * The header carries NO free-text field — the subject travels per commit through
 * readSubject and the trailers through rangeCommits' own reads (escalation
 * round, pass 2) — so this parser returns { sha, at, parentShas, files } and the
 * wrapper adds who wrote it.
 *
 * git QUOTES a path with a tab, a quote or a high byte in it, and the quoted
 * form matches neither a mechanism path nor a pass record's file list — so
 * every path line goes through unquoteGitPath.
 */
export function parseRangeLog(out) {
  return parseWholeRangeLog(out, { decodePath: unquoteGitPath })
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
 * The path-carrying log command, built pure in mechanism-review-range-core.mjs
 * and re-exported so the unit layer can pin its flags (round-1 pass 2, both
 * findings):
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

/** The command buffer every authorship and subject read is bounded by. */
const PARENT_READ_MAX_BYTES = 1024 * 1024

/**
 * The default parent reader, exported so a test can exercise the REAL command
 * rather than replace it (cross-vendor review, GPT-5.6 Sol: a test that injects
 * `readParents` stays green if the production wiring drops the no-replace flag
 * or scans past the header).
 *
 * BOUNDED, and the bound fails closed: `cat-file -p` emits the whole object
 * though only its header is wanted, so a commit with a huge message would
 * otherwise exceed the command buffer. Overflow throws, `authorshipRead` types
 * it, and the failure is reported, never read as "no author" — a denial of
 * progress rather than a bypass.
 */
export function defaultParentReader(sha, runGit) {
  return commitObjectParents(
    runGit(`--no-replace-objects cat-file -p "${sha}"`, { maxBuffer: PARENT_READ_MAX_BYTES }),
  )
}

/** The commit subject, for the refusal text alone. It answers a placeholder
 *  where the read fails, because a display string may not be able to stop a
 *  gate — and because failing closed here would reopen the very bypass the
 *  authorship reads were hardened against. */
export function readSubject(sha, runGit) {
  const run = runGit ?? git
  try {
    return run(`--no-replace-objects show -s --format=%s "${sha}"`, { maxBuffer: PARENT_READ_MAX_BYTES })
  } catch {
    return `(subject unreadable for ${String(sha).slice(0, 12)})`
  }
}

/** The refusal a typed authorship failure earns, built pure so the answer the
 *  main module emits is pinnable without spawning it (cross-vendor review,
 *  GPT-5.6 Sol: the failure cases stopped at the typed error and never showed
 *  what the caller finally sees). */
export function authorshipBlockResponse(error) {
  return {
    decision: 'block',
    reason:
      'mechanism-review-guard: a read that decides authorship failed, so no contribution here can be ' +
      'proven independently reviewed.\n' +
      `  ${error?.message ?? error}\n` +
      '  Repair the read (a missing object, an unreachable repository, or an object past the command ' +
      'buffer) and run --status again. An empty author list is not the answer: it omits an author.',
  }
}

/** Run one authorship read, and type whatever it throws so the gate can block on
 *  it instead of letting the fail-open catch wave the turn through. */
export function authorshipRead(read, what) {
  try {
    return read()
  } catch (error) {
    const wrapped = new Error(
      `${what} could not be read (${error?.message ?? error}) — authorship that cannot be read is not authorship that is absent`,
    )
    wrapped.authorshipUnreadable = true
    throw wrapped
  }
}

export function rangeCommits(base, head, files, readers = {}) {
  // `runGit` exists so a test can pin the PRODUCTION wiring rather than replace
  // it (cross-vendor review, GPT-5.6 Sol): injecting `readParents` bypasses both
  // the real command and the real parser, so those cases stayed green even if the
  // default reader stopped being used at all.
  const runGit = readers.runGit ?? git
  const readLog = readers.readLog ?? ((args) => gitRawFile(args))
  const readTrailers =
    readers.readTrailers ??
    ((sha) =>
      runGit(
        `--no-replace-objects show -s --format="%(trailers:key=Co-Authored-By,valueonly,separator=;)" "${sha}"`,
        // Bounded like the object read, and for the same reason: the format asks
        // for trailers alone, but a pathological commit should refuse rather
        // than return something shorter than the truth.
        { maxBuffer: PARENT_READ_MAX_BYTES },
      ))
  const out = readLog(mechanismLogCommand(base, head))
  const commits = parseRangeLog(out)
  // THE MERGED TIP'S TRAILER, FETCHED BEFORE IT IS NEEDED (point 784's ruling).
  // `authorshipResolver` attributes a trailerless merge to the tips it merged,
  // but it can only read a parent that is IN the measured list or supplied here
  // — and the list is FIRST-PARENT, so a landing's merged branch tip never is.
  // Without this the resolver fell through to "unknown" for every merge that
  // contributed a conflict resolution, and an unknown vendor is unreviewable by
  // construction: no verdict can be recorded against it and no route clears it.
  // The criticality guard has fetched the same trailers since 28.08.2026; this
  // is that gatherer's missing half, not a new rule.
  // AND `--no-replace-objects` HERE TOO, for the reason the log command states:
  // a replaced parent could otherwise answer with somebody else's trailers.
  const trailersOf = (sha) => readTrailers(sha)
  // THE PARENTS THE ANCESTRY RULE USES COME FROM THE COMMIT OBJECT, NOT FROM THE
  // LOG (cross-vendor review, GPT-5.6 Sol at effort high, second do-not-merge on
  // this half). `--no-replace-objects` disables `refs/replace` and NOTHING ELSE:
  // `log --format=%P` is still GRAFT-aware, so at a shallow boundary a merge
  // prints as single-parented and the resolver inherits nothing — the merged
  // tip's author is hidden, and an invisible author is not an absent one. Read
  // only where it can matter: a commit that names its own model needs no
  // ancestry, so the extra object read is confined to the trailerless ones.
  const readParents = readers.readParents ?? ((sha) => defaultParentReader(sha, runGit))
  const measured = commits.map((commit) => {
    // THE COMMIT'S OWN TRAILERS ARE AN AUTHORSHIP READ TOO (cross-vendor review,
    // GPT-5.6 Sol at effort high, second do-not-merge on this end state). It was
    // the one left unwrapped, and it is the most load-bearing of the three: it
    // decides `own`, both author fields, AND whether the ancestry rule is
    // consulted at all. Failing open here switched the gate off exactly as the
    // other two did.
    const trailers = authorshipRead(
      () => trailersOf(commit.sha),
      `the trailers of commit ${String(commit.sha).slice(0, 12)}`,
    )
    const own = modelsFromTrailers(trailers)
    // A FAILED AUTHORSHIP READ IS A BLOCK, NEVER A SHRUG (cross-vendor review,
    // GPT-5.6 Sol at effort high, do-not-merge on the end state). Both reads
    // below can throw — an object too large for the command buffer, a parent
    // missing from a shallow or partial clone, a repository that cannot be
    // reached — and the exception used to travel all the way to this file's
    // top-level catch, which then allowed the stop. A single large
    // trailerless commit anywhere in the measured range would therefore have
    // switched the whole gate off, without touching a mechanism file at all.
    // The failure is typed here and answered with `decision: block` there, the
    // same way an unreadable ledger already is. Substituting an empty author
    // list would be worse than either: it OMITS a possible author.
    const parentShas = own.length ? (commit.parentShas ?? []) : authorshipRead(
      () => readParents(commit.sha),
      `the parents of commit ${String(commit.sha).slice(0, 12)}`,
    )
    // EVERY non-first parent, never only the ones outside this range. The
    // criticality guard may skip an in-range parent because it hands the
    // planner the WHOLE list, so the resolver finds that parent itself. This
    // gate plans ONE COMMIT AT A TIME, so its resolver's lookup table holds
    // that single commit and nothing else — an in-range parent is exactly as
    // invisible to it as an out-of-range one, and skipping it left the merge
    // unattributed.
    const parentAuthorModels = Object.fromEntries(
      parentShas
        .slice(1)
        .map((parent) => [
          parent,
          modelsFromTrailers(
            authorshipRead(() => trailersOf(parent), `the trailers of merged parent ${String(parent).slice(0, 12)}`),
          ),
        ]),
    )
    return {
      ...commit,
      parentShas,
      authorModel: modelFromTrailers(trailers),
      // EVERY co-author, not only the first: a commit naming two models has
      // two list authors, and neither may merge the union (point 634).
      authorModels: modelsFromTrailers(trailers),
      parentAuthorModels,
      mechanismFiles: mechanismPathsIn(commit.files, { scriptFiles: files }),
    }
  })
  return withResolvedCommitAuthors(measured)
}

/**
 * The pending contributions the gate still PLANS FOR — everything the evaluator
 * has not already retired.
 *
 * Measured on the merge candidate 27.08.2026: the settled legacy range carries
 * merge commits whose trailers name no vendor, so planning them put eight
 * UNREVIEWABLE groups of settled history in front of the four contributions
 * really owed — and the verdict prints the unreviewable branch INSTEAD of the
 * runnable commands, hiding the finite plan this scoping exists to produce.
 * What the evaluator skips, the plan skips, by the very same predicate.
 */
export function planningContributions(pendingCommits = [], records = []) {
  const recordsBySha = new Map()
  for (const record of records ?? []) {
    const key = String(record?.sha ?? '')
    if (!recordsBySha.has(key)) recordsBySha.set(key, [])
    recordsBySha.get(key).push(record)
  }
  return (pendingCommits ?? []).filter(
    (commit) =>
      !contributionRetiredBy(
        [...new Set(commit?.coveringRecordShas ?? [])].flatMap((sha) => recordsBySha.get(String(sha)) ?? []),
        commit,
      ),
  )
}

/**
 * Everything the core needs — exported so the guard preflight and `--status`
 * share ONE gathering rather than a second copy of this git work, which would
 * drift. Without `report` it stands down (the gate is switched off); with it,
 * it measures. Read-only: nothing here writes the baseline.
 */
export function gatherMechanismReviewInputs({
  sessionId = '',
  guardDuty = gatherGuardDutyContext,
  // `--status` still MEASURES: the report is the debt's only remaining reader,
  // and it answers whoever asks. A read decides nothing, so neither the pause
  // nor the batch lock may silence it — that lock check is what made a
  // hand-run `--status` print "stands down" and exit 0 (point 1036).
  report = false,
  // Test seams: a fixture baseline keeps the unit layer off the live history.
  readBaseline = readBaselineState,
  bootstrap = bootstrapBase,
} = {}) {
  if (!report) return { applicable: false, why: GATE_SWITCHED_OFF }
  const head = git('rev-parse HEAD')
  let branch = 'HEAD'
  try {
    branch = git('rev-parse --abbrev-ref HEAD')
  } catch {
    /* no branch name — the 'HEAD' key is as good a bucket as any */
  }
  const state = readBaseline()
  const stored = baselineFor(state, branch)
  const baselineMissing = !stored
  const baseline = stored || bootstrap(head)

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
    /* unrelated baseline — the raw range below decides */
  }
  let effective = baseline
  let pendingCommits = []
  let commits = []
  if (base !== head) {
    try {
      commits = rangeCommits(base, head, scriptFiles())
      pendingCommits = pendingReviewContributions(commits, scriptFiles(), (sha) => readSubject(sha))
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
      // wrapper's catch, and no path advances the baseline while the block is off.
      if (!commitMissing(baseline)) throw e
      // Recover from the fixed BASELINE_RECOVERY_ANCHOR (an ancestor of HEAD),
      // never from HEAD: HEAD would grandfather this branch's own pending
      // mechanism work in the act of recovering. The range is then judged for
      // real — a recovery that reported "clear" without looking would be the
      // same silent pass in a new place.
      effective = bootstrap(head)
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
      pendingCommits = pendingReviewContributions(commits, scriptFiles(), (sha) => readSubject(sha))
    }
  }

  // Which recorded reviews CONTAIN each pending commit (see attachCoverage for
  // the cost rule this obeys). Nothing pending means nothing to cover, and the
  // ledger is not even read then: the overwhelmingly common range changes no
  // mechanism at all, and a gathering that costs a process per ledger line is
  // one nobody runs.
  // Carried rows are RE-MEASURED on every read (delta rounds, 18.08.2026):
  // the blob-identity stamp is the wrapper's, never the ledger's own word.
  const records = attachContributionDispositions(verifyCarried(attachCoverage({
    pendingCommits,
    allRecords: pendingCommits.length ? readRecords() : [],
    effective,
    head,
    revList: (rev) => git(`rev-list ${rev} --not ${effective}`),
  })))

  // A mixed-vendor FILE split is judged by the reviewer the runnable planner
  // assigned to each pass, not by every contribution author in the wider
  // range. Re-run that planner only for recorded multi-pass heads, once per
  // sha, from this guard's measured baseline. `verifiedPlannerPasses` compares
  // every semantic field, so a hand-edited row or a plan that has genuinely
  // changed earns no stamp and the evaluator keeps blocking.
  const plansBySha = new Map()
  const claimedSplits = new Map()
  for (const record of records) {
    const total = Number(record?.pass?.total)
    const index = Number(record?.pass?.index)
    if (!Number.isInteger(total) || total < 2 || !Number.isInteger(index) || index < 1 || index > total) continue
    const key = `${String(record?.sha ?? '')}\0${total}`
    if (!claimedSplits.has(key)) {
      claimedSplits.set(key, { sha: String(record?.sha ?? ''), total, indices: new Set(), reviewerVendors: new Set() })
    }
    const split = claimedSplits.get(key)
    split.indices.add(index)
    split.reviewerVendors.add(modelVendor(record?.model))
  }
  // An incomplete raw set cannot become complete through reviewer validation,
  // so planning it spends Git work without changing the verdict. This keeps
  // the common --status/preflight read bounded to the few historical splits whose
  // every claimed round is actually present (408757d is one).
  const splitShas = new Set(
    [...claimedSplits.values()]
      .filter((split) => split.indices.size === split.total && split.reviewerVendors.size > 1)
      .map((split) => split.sha)
      .filter(Boolean),
  )
  for (const sha of splitShas) {
    try {
      plansBySha.set(sha, buildAuthorshipPassPlan({ sha, base: effective, records: [] }))
    } catch {
      // No trusted plan means no verified pass. The evaluator fails closed and
      // the contribution planner below remains the only repair-command source.
    }
  }
  const plannerVerifiedPasses = verifiedPlannerPasses(records, plansBySha)

  // Authorship is also contribution-local. Grouping the whole baseline range
  // by its last file writers was the same unbounded scope in another form.
  const plannedCommits = planningContributions(pendingCommits, records)
  const groups = plannedCommits.flatMap(
    (commit) => planAuthorshipGroups({ commits: [commit], endStateFiles: commit.files }).groups,
  )
  const authorshipPlan = { groups, unreviewable: groups.filter((group) => !group.reviewer) }

  return {
    applicable: true,
    head,
    branch,
    baseline: effective,
    // TOP-LEVEL, exactly as both early returns report it, so
    // shouldSeedRecoveryAnchor can read the flag beside `gathered.baseline` in
    // one shape. While it lived only under `inputs`, the switched-off Stop path's
    // two-turn recovery never wrote anything.
    baselineMissing,
    // Null if git could not establish a merge-base: pending detection may keep
    // using its conservative raw fallback. Informational only — the gap ruling
    // measures contributions, not this range.
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
      plannerVerifiedPasses,
    },
    commits,
    debt: { outstanding: plannedCommits, invalidatedCoverage: [] },
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
 * WORST CASE, and it does not depend on the ledger's size: 1 + R calls (1 + 2R
 * when a `rangeFiles` measurer is supplied, which the guard does not do), where R
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
  // Call 1 of 1 + R: the whole branch range, which selects the records at all.
  const branchRange = pendingCommits.length ? lines(head) : new Set()
  const records = (pendingCommits.length ? allRecords : []).filter((r) => branchRange.has(r.sha))
  // Then one per SURVIVING record — the reviews recorded on this branch, never
  // the whole ledger — plus one more each where `rangeFiles` is supplied: the
  // file set of `effective..record.sha`, which the gate holds a pass
  // composition's union against (escalation round). An unanswerable diff
  // attaches nothing, and the evaluator treats that unmeasured range as UNKNOWN
  // coverage, which blocks.
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
    let payloadSessionId = ''
    try {
      payloadSessionId = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      /* manual run — the session id is resolved below */
    }
    const sessionId = resolveMechanismReviewSessionId({ payloadSessionId, status })

    // Without --status the gathering stands down (the gate is switched off),
    // and with it the gathering always measures — so past this line the run is a
    // status report.
    const gathered = gatherMechanismReviewInputs({ sessionId, report: status })
    if (!gathered.applicable) process.exit(0)

    const verdict = evaluateMechanismReview(gathered.inputs)

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

    let statusPlan = sizedGapPlan
    if (owedContributions.length) {
      try {
        if (!statusPlan) {
          const { buildContributionPassPlan } = await import('./review-astra.mjs')
          statusPlan = buildContributionPassPlan({ commits: owedContributions })
        }
      } catch {
        /* the status names an unavailable plan instead of inventing a count */
      }
    }
    console.log(`HEAD:      ${gathered.head.slice(0, 7)} (branch ${gathered.branch})`)
    console.log(`baseline:  ${gathered.baseline ? String(gathered.baseline).slice(0, 7) : '<none — missing, and the recovery anchor did not resolve>'}`)
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
      console.log(formatContributionPassPlan(statusPlan))
    }
    // NOTHING SUPPRESSES THE DEBT ANY MORE (cross-vendor rounds 2 and 3 of
    // point 1036). The report used to choose ONE of three things to print —
    // the gap, the verdict, or GATE CLEAR — and both other branches hid a
    // real debt: the deferral because it left `block` false, the gap because
    // it replaced the finding list with the reason it could not be assembled.
    // The report is the only reader the debt has left, so it prints the
    // findings whenever there are findings, and the gap and the deferral are
    // context ABOVE them rather than alternatives to them.
    if (verdict.deferred) console.log(`\nDEFERRED, NOT CLEAR: ${verdict.reason}`)
    if (outcome.action === 'report-gap') console.log(`\n${gap.report}`)
    if (statusReportsFindings(verdict)) {
      console.log(
        `\n${formatMechanismReviewVerdict(verdict, {
          authorshipPlan: gathered.authorshipPlan,
          contributionPlan: statusPlan,
        })}`,
      )
    } else if (outcome.action !== 'report-gap') console.log('\nGATE CLEAR')
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
            '  Repair the ledger (it is tracked in git) and run --status again.',
        }),
      )
      process.exit(0)
    }
    // THE SAME ANSWER AN UNREADABLE LEDGER GETS, for the same reason (cross-vendor
    // review, GPT-5.6 Sol at effort high): a read that decides AUTHORSHIP cannot
    // fail into the catch below, or one unreadable object switches the gate off.
    if (e && e.authorshipUnreadable) {
      process.stdout.write(JSON.stringify(authorshipBlockResponse(e)))
      process.exit(0)
    }
    console.error(`mechanism-review-guard --status could not complete: ${e && e.message}`)
    process.exit(0)
  }
}
