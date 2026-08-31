// Stop hook (work-order point 298): a HIGH-criticality point does not get
// ticked without a second model's recorded, ANSWERED review.
//
// The rule — triage difficulty × criticality, and put a different pair of eyes
// on the HIGH work — was carried by intention and applied where somebody
// remembered it. The gate beside this one (mechanism-review-guard) covers a
// change by its FILE PATH; this one covers it by its DECLARED CRITICALITY, which
// is the half no path rule can see: save/load, the batch singleton and the
// deadline are must-work systems that live nowhere near scripts/.
//
// Decision logic: criticality-review-guard-core.mjs (pure, Vitest-covered). This
// wrapper only gathers git output and one state file, and is fail-OPEN — an
// internal error never traps the session.
//
// WHERE IT STANDS DOWN, and why each one:
//   - .claude/batch-paused exists                    (the batch is not running)
//   - another live session owns the batch lock       (subagents must not be judged)
//   - the checkout is not on `main`                  TASKS.md is main-only and the
//     tick happens on main (CLAUDE.md §6). On a feature branch the work order is
//     whatever main last said, so a branch that merges main in would otherwise
//     re-report main's own (already cleared) ticks as its own.
//
// GRANDFATHERING: the baseline is per branch and self-arms at the fork point on
// its first run, exactly as mechanism-review-guard does. The points ticked before
// this gate existed owe nothing.
//
// How the gate clears:
//   node scripts/mechanism-review.mjs --record <sha> --point <N> --model <name> \
//       --verdict <merge|merge-with-fixes|do-not-merge> --evidence "<one line>" \
//       --mode <review|blind-parallel>
// CLI:
//   node scripts/criticality-review-guard.mjs --status
// usage: node scripts/criticality-review-guard.mjs --record-unavailable <sha> --point <N> --files "<exact paths>" --reason "<why no vendor is eligible>"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync, execSync } from 'node:child_process'
import { dirname } from 'node:path'
import { commonRepoPath, REPO_ROOT, repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { appendRecord, readRecords, verifyCarried } from './mechanism-review.mjs'
import { modelsFromTrailers } from './mechanism-review-core.mjs'
import { parseRangeLog, planAuthorshipGroups, reviewEndStateFiles } from './mechanism-review-range-core.mjs'
import { parsePassFiles, quotePassFile, unquoteGitPath } from './review-material-core.mjs'
import {
  ancestorIndex,
  evaluateCriticalityReview,
  formatCriticalityReviewVerdict,
  highTicks,
  openNumbers,
  REVIEW_UNAVAILABLE_KIND,
  strictAncestorProbe,
} from './criticality-review-guard-core.mjs'

const PAUSE = repoPath('.claude/batch-paused')

/** Per-branch baseline. Local bookkeeping ("what this tree has confirmed"), so
 *  it is deliberately NOT tracked — the ledger that must travel between a branch
 *  and the session that merges it is the tracked one. */
export const BASELINE_PATH = commonRepoPath('.claude/criticality-review-baseline.json')

/** The branch ticks happen on (CLAUDE.md §6: TASKS.md is main-only). */
export const TICK_BRANCH = 'main'

const TASKS_FILE = 'TASKS.md'
const ARCHIVE_FILE = 'docs/tasks-archive.md'
const AUTHORING_COMMISSION_KIND = 'authoring-commission'

export const unavailableReceiptUsage = () =>
  'node scripts/criticality-review-guard.mjs --record-unavailable <sha> --point <N> ' +
  '--files "<exact measured paths>" --reason "<why no reviewer vendor is eligible>"'

// maxBuffer is NOT a precaution here, it is the difference between a guard that
// works and one that never once fires: `git show <rev>:docs/tasks-archive.md`
// returns the WHOLE archive — 1.12 MB on 07.08.2026 and only growing — against
// execSync's 1 MB default. Past it the child dies with ENOBUFS, the throw reaches
// the wrapper's fail-open, and the gate allows every turn while looking armed.
// Found on main the moment the branch merged; the guard's own fixtures build temp
// repos whose work order is a few hundred bytes and could not see it.
const git = (cmd) =>
  execSync(`git ${cmd}`, {
    windowsHide: true,
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim()

/** Path-carrying git output never goes through a shell and is never trimmed. */
const gitRawFile = (args) =>
  execFileSync('git', args, {
    windowsHide: true,
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })

/**
 * Files authored for one point between its recorded commission and a review.
 *
 * First-parent, non-merge commits are the point's own lane. A merge from main
 * imports other points into the reviewed tree; counting those paths would make
 * this point owe reviews of work it did not author. NUL separation preserves
 * every legal path byte representable in the ledger, including edge spaces.
 */
export const pointFilesCommand = (commissionSha, reviewSha) => [
  'log',
  '--first-parent',
  '--no-merges',
  '--format=format:',
  '--name-only',
  '-z',
  `${commissionSha}..${reviewSha}`,
]

/** Named point landings on main, oldest first so a later rework cannot claim an
 * older review from the same point. */
export const pointLandingLogCommand = () => [
  'log',
  '--first-parent',
  '--merges',
  '--reverse',
  '--format=%x1e%H%x1f%P%x1f%s',
  'HEAD',
]

/** Live local/remote lane refs are the second Git-owned route before landing. */
export const pointLaneRefsCommand = (point) => [
  'for-each-ref',
  '--format=%(refname)%09%(objectname)',
  `refs/heads/feat/${Number(point)}-*`,
  `refs/remotes/origin/feat/${Number(point)}-*`,
]

/** Commits authored on a lane, excluding everything already on main. */
export const pointLaneCommitsCommand = (ref, exclude = TICK_BRANCH) => [
  'rev-list',
  '--first-parent',
  '--reverse',
  String(ref),
  '--not',
  String(exclude),
]

// THE SAME BOUNDARY THE PLANNER USES (`reviewEndStateFiles`). The gate demanded
// coverage of paths `review-sol` structurally refuses to put in a pass — the work
// order, its archive, the retrospective — so a HIGH point whose file set had
// picked one of them up could never reach a complete composition, whatever was
// reviewed. The exclusion list already says why those documents have their own
// enforcement instead; consuming it here is what makes gate, coverage demand and
// planner agree, which is what that list was written to guarantee.
const uniqueFiles = (raw) => reviewEndStateFiles(String(raw).split('\0').filter(Boolean))

const ancestorOrEqual = (a, b, isAncestor) => Boolean(a && b && (a === b || isAncestor(a, b)))

/**
 * Measure a point that has no authoring-commission row from Git alone.
 *
 * A named landing merge is the strongest fallback: its first-parent tree diff
 * is exactly what the point brought to main, including merge resolutions. If
 * the point has not landed yet, a retained feat/<point>-… ref proves the lane;
 * the parent of that lane's first commit is the range base, so the first commit
 * itself is not accidentally omitted.
 */
export function measurePointFilesWithoutCommission(
  point,
  reviewSha,
  { run = gitRawFile, isAncestor = gitIsStrictAncestor } = {},
) {
  const number = Number(point)
  const reviewed = String(reviewSha ?? '').trim()
  if (!Number.isInteger(number) || number <= 0 || !reviewed) throw new Error('point and reviewed commit are required')

  const mergePattern = new RegExp(`^Merge branch '(?:origin/)?feat/${number}-`)
  const landings = String(run(pointLandingLogCommand()))
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha = '', parents = '', subject = ''] = entry.split('\x1f')
      return { sha, parents: parents.trim().split(/\s+/).filter(Boolean), subject }
    })
  for (const landing of landings) {
    if (!mergePattern.test(landing.subject) || landing.parents.length < 2) continue
    if (reviewed !== landing.sha && !ancestorOrEqual(reviewed, landing.parents[1], isAncestor)) continue
    if (reviewed === landing.sha) {
      return uniqueFiles(run(['diff', '--name-only', '-z', `${landing.sha}^1`, landing.sha]))
    }
    const first = String(run(pointLaneCommitsCommand(landing.parents[1], `${landing.sha}^1`)))
      .trim()
      .split(/\s+/)
      .filter(Boolean)[0]
    if (!first || !ancestorOrEqual(first, reviewed, isAncestor)) continue
    const base = String(run(['rev-parse', '--verify', `${first}^`])).trim()
    if (!base) continue
    return uniqueFiles(run(pointFilesCommand(base, reviewed)))
  }

  const refs = String(run(pointLaneRefsCommand(number)))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('\t'))
  for (const [ref, tip] of refs) {
    if (!ref || !tip || !ancestorOrEqual(reviewed, tip, isAncestor)) continue
    const first = String(run(pointLaneCommitsCommand(ref))).trim().split(/\s+/).filter(Boolean)[0]
    if (!first || !ancestorOrEqual(first, reviewed, isAncestor)) continue
    const base = String(run(['rev-parse', '--verify', `${first}^`])).trim()
    if (!base) continue
    return uniqueFiles(run(pointFilesCommand(base, reviewed)))
  }
  throw new Error(`Git has no landing merge or feat/${number}-… lane for the reviewed commit`)
}

/**
 * Replace any ledger-supplied `pointFiles` with Git's measurement. Each review
 * prefers the latest authoring commission for its point that it contains, then
 * falls back to a named landing merge or retained point lane. A failed
 * measurement stays absent, which the pure core reads as unknown coverage and
 * refuses for pass compositions.
 */
export function attachPointFileSets(records = [], measure = (base, sha) =>
  uniqueFiles(gitRawFile(pointFilesCommand(base, sha))), fallbackMeasure = measurePointFilesWithoutCommission) {
  const rows = records ?? []
  for (const row of rows) delete row.pointFiles
  const commissions = rows.filter((row) => row?.kind === AUTHORING_COMMISSION_KIND && row.reachable !== false)
  for (const row of rows) {
    if (!row?.verdict || row.reachable === false) continue
    const bases = commissions.filter(
      (commission) =>
        Number(commission.point) === Number(row.point) &&
        (commission.sha === row.sha || (row.descendsFrom ?? []).includes(commission.sha)),
    )
    if (bases.length) {
      const commission = bases.reduce((a, b) => (Number(b.at ?? 0) >= Number(a.at ?? 0) ? b : a))
      try {
        const files = measure(commission.sha, row.sha)
        if (Array.isArray(files)) row.pointFiles = [...new Set(files.map(String).filter(Boolean))]
      } catch {
        /* try the Git-only routes below */
      }
    }
    if (!Array.isArray(row.pointFiles)) {
      try {
        const files = fallbackMeasure(row.point, row.sha)
        if (Array.isArray(files)) row.pointFiles = [...new Set(files.map(String).filter(Boolean))]
      } catch {
        /* unknown coverage is intentionally represented by absence */
      }
    }
  }
  return rows
}

/** The point lane plus cc-only work authored while it merged main. */
export const pointAuthorshipLogCommand = (commissionSha, reviewSha) => [
  '-c',
  'core.quotepath=on',
  'log',
  '--first-parent',
  '--format=%x1e%H%x1f%ct%x1f%P',
  '--name-only',
  '--no-renames',
  '--diff-merges=cc',
  '--reverse',
  `${commissionSha}..${reviewSha}`,
]

/** Git-owned authorship and touched-file facts for one point's own lane. */
export function pointAuthorship(commissionSha, reviewSha) {
  const commits = parseRangeLog(gitRawFile(pointAuthorshipLogCommand(commissionSha, reviewSha)), {
    decodePath: unquoteGitPath,
  })
  const inRange = new Set(commits.map((commit) => commit.sha))
  const attributed = commits.map((commit) => {
    const trailers = gitRawFile([
      'show',
      '-s',
      '--format=%(trailers:key=Co-Authored-By,valueonly,separator=;)',
      commit.sha,
    ])
    const parentAuthorModels = Object.fromEntries(
      (commit.parentShas ?? [])
        .slice(1)
        .filter((parent) => !inRange.has(parent))
        .map((parent) => [
          parent,
          modelsFromTrailers(
            gitRawFile([
              'show',
              '-s',
              '--format=%(trailers:key=Co-Authored-By,valueonly,separator=;)',
              parent,
            ]),
          ),
        ]),
    )
    return { ...commit, authorModels: modelsFromTrailers(trailers), parentAuthorModels }
  })
  const plan = planAuthorshipGroups({ commits: attributed })
  // BOTH SETS GO THROUGH THE PLANNER'S BOUNDARY (cross-vendor review, GPT-5.6 Sol,
  // 28.08.2026). The ordinary measurement was routed through it and this one was
  // not, so an unavailable receipt could still claim the work order or the
  // retrospective as an unreviewable file — a clearance for paths no round was
  // ever owed, written into the append-only ledger.
  return {
    pointFiles: reviewEndStateFiles(attributed.flatMap((commit) => commit.files)),
    unavailableFiles: reviewEndStateFiles(plan.unreviewable.flatMap((group) => group.files)),
  }
}

const sameFileSet = (a = [], b = []) => {
  const left = [...new Set(a.map(String))].sort()
  const right = [...new Set(b.map(String))].sort()
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Build the exception only after Git reproduces the caller's exact file set. */
export function buildUnavailableReceipt({
  sha = '',
  point = '',
  files = [],
  reason = '',
  records = [],
  now = Date.now(),
  resolveSha = (ref) => gitRawFile(['rev-parse', '--verify', `${ref}^{commit}`]).trim(),
  isAncestor = gitIsStrictAncestor,
  measure = pointAuthorship,
} = {}) {
  const errors = []
  const ref = String(sha).trim()
  const number = Number(point)
  const claimed = [...new Set((Array.isArray(files) ? files : []).map(String).filter(Boolean))]
  const why = String(reason).trim()
  if (!/^[0-9a-f]{7,40}$/i.test(ref)) errors.push('--record-unavailable <sha> must be a 7–40 digit hexadecimal commit id')
  if (!Number.isInteger(number) || number <= 0) errors.push('--point <N> must be a positive integer')
  if (!claimed.length) errors.push('--files must name the exact non-empty unavailable file set')
  if (why.length < 8) errors.push('--reason must explain why no configured reviewer vendor is eligible')
  if (errors.length) return { ok: false, errors }

  let full = ''
  try {
    full = resolveSha(ref)
  } catch {
    return { ok: false, errors: [`--record-unavailable: ${ref} is not a commit in this repository`] }
  }
  const commissions = (records ?? []).filter(
    (row) =>
      row?.kind === AUTHORING_COMMISSION_KIND &&
      Number(row.point) === number &&
      (row.sha === full || isAncestor(row.sha, full)),
  )
  if (!commissions.length) {
    return { ok: false, errors: [`point ${number} has no reachable authoring commission at ${full.slice(0, 7)}`] }
  }
  const commission = commissions.reduce((a, b) => (Number(b.at ?? 0) >= Number(a.at ?? 0) ? b : a))
  let measured
  try {
    measured = measure(commission.sha, full)
  } catch (error) {
    return { ok: false, errors: [`Git could not measure point ${number}'s unavailable files: ${error?.message ?? error}`] }
  }
  // Filtered HERE too, not only inside the measurement: this is the consumer that
  // writes the clearance, and a receipt naming an excluded path would grant one
  // for a review nothing was ever owed.
  const actual = reviewEndStateFiles((measured?.unavailableFiles ?? []).map(String).filter(Boolean))
  if (!actual.length) {
    return { ok: false, errors: [`Git measures no unavailable files for point ${number} at ${full.slice(0, 7)}`] }
  }
  if (!sameFileSet(claimed, actual)) {
    return {
      ok: false,
      errors: [`--files does not equal Git's unavailable set; expected ${actual.map(quotePassFile).join(', ')}`],
    }
  }
  return {
    ok: true,
    record: {
      kind: REVIEW_UNAVAILABLE_KIND,
      point: number,
      sha: full,
      files: actual,
      reason: why,
      at: now,
      atIso: new Date(now).toISOString(),
    },
  }
}

/** Strict parser for the manual write route; no unknown token is ignored. */
export function parseUnavailableReceiptArgs(argv = []) {
  const spec = new Map([
    ['--record-unavailable', 'sha'],
    ['--point', 'point'],
    ['--files', 'files'],
    ['--reason', 'reason'],
  ])
  const values = {}
  const errors = []
  for (let i = 0; i < argv.length; i++) {
    const flag = String(argv[i])
    const key = spec.get(flag)
    if (!key) {
      errors.push(`unknown unavailable-receipt argument ${flag}`)
      continue
    }
    if (values[key] !== undefined) {
      errors.push(`${flag} was given more than once`)
      i++
      continue
    }
    const value = argv[i + 1]
    if (value === undefined || String(value).startsWith('--')) {
      errors.push(`${flag} expects a value`)
      continue
    }
    values[key] = String(value)
    i++
  }
  const parsedFiles = parsePassFiles(values.files ?? '')
  errors.push(...parsedFiles.errors.map((error) => error.replaceAll('--pass-files', '--files')))
  return { ok: errors.length === 0, values: { ...values, files: parsedFiles.files }, errors }
}

/**
 * Verify explicit no-reviewer receipts from Git, never from their own fields.
 * The claimed files must equal the complete unreviewable set byte-for-byte;
 * omitting one or adding an ordinary reviewable path earns no exception.
 */
export function attachUnavailableClearances(records = [], verify = pointAuthorship) {
  const rows = records ?? []
  for (const row of rows) {
    delete row.unavailableVerified
    delete row.unavailableFiles
  }
  const commissions = rows.filter((row) => row?.kind === AUTHORING_COMMISSION_KIND && row.reachable !== false)
  for (const row of rows) {
    if (row?.kind !== REVIEW_UNAVAILABLE_KIND || row.reachable === false) continue
    const bases = commissions.filter(
      (commission) =>
        Number(commission.point) === Number(row.point) &&
        (commission.sha === row.sha || (row.descendsFrom ?? []).includes(commission.sha)),
    )
    if (!bases.length) continue
    const commission = bases.reduce((a, b) => (Number(b.at ?? 0) >= Number(a.at ?? 0) ? b : a))
    try {
      const measured = verify(commission.sha, row.sha)
      const actual = [...new Set((measured?.unavailableFiles ?? []).map(String).filter(Boolean))]
      const claimed = [...new Set((Array.isArray(row.files) ? row.files : []).map(String).filter(Boolean))]
      const same = actual.length > 0 && JSON.stringify([...actual].sort()) === JSON.stringify([...claimed].sort())
      if (!same) continue
      row.unavailableVerified = true
      row.unavailableFiles = actual
      row.pointFiles = [...new Set((measured?.pointFiles ?? []).map(String).filter(Boolean))]
    } catch {
      /* no Git ruling means no exception */
    }
  }
  return rows
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

/** The baseline this branch is judged against, or null. */
export function baselineFor(state, branch) {
  const map = state?.baselines ?? {}
  return map[branch] ?? map[TICK_BRANCH] ?? null
}

/**
 * A file's content at a revision, or '' when it did not exist there.
 *
 * The empty answer is only for a MISSING PATH, never for a failure to ask: a
 * baseline whose archive read as empty would make every archived point look
 * newly ticked and block the turn on a hundred of them. Anything other than
 * git's own "path does not exist" therefore rethrows into the caller, which
 * re-arms rather than guesses.
 */
export function showAt(rev, path, run = (cmd) => git(cmd)) {
  try {
    return run(`show "${rev}:${path}"`)
  } catch (e) {
    const text = String(e?.stderr ?? e?.message ?? e)
    if (/exists on disk, but not in|does not exist in|path .* does not exist/i.test(text)) return ''
    throw e
  }
}

/**
 * The work order as it stands NOW, from the working tree — or '' when the file
 * is genuinely absent.
 *
 * ENOENT is the ONLY empty answer, and the distinction is the whole point (found
 * by the four-eyes review of this branch): a swallowed read error made the
 * PENDING TICK VANISH, the gate report clear, and — because a clear run advances
 * the baseline — the forgiveness PERMANENT. Reproduced: arm, tick a high point,
 * `chmod 000` the archive, and the gate stayed clear after the mode was
 * restored. On the Windows host a sharing-violation read failure is a documented
 * recurring event, so this is not a hypothetical.
 *
 * Anything else therefore rethrows into the wrapper's per-turn fail-open, which
 * allows the stop and writes NO state — the same rule `showAt` follows one call
 * down: an empty answer is for a missing path, never for a failure to ask.
 */
export function readWorkOrder(path, read = (p) => readFileSync(p, 'utf8')) {
  try {
    return read(path)
  } catch (e) {
    if (e?.code === 'ENOENT') return ''
    throw e
  }
}

/**
 * True when `sha` names no reachable commit — the one condition under which an
 * undiffable baseline may be re-armed. A probe that could not answer counts as
 * PRESENT, so a transient git failure never forgives a pending tick.
 */
export function commitMissing(sha, run = (cmd) => execSync(cmd, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' })) {
  try {
    run(`git rev-parse --verify --quiet "${sha}^{commit}"`)
    return false
  } catch (e) {
    return e?.status === 1
  }
}

/**
 * Where a tree with no baseline starts judging: the fork point from the
 * integration branch, HEAD where none resolves. The revision stays QUOTED —
 * cmd.exe eats a bare `^`, and the two gates beside this one both carry that
 * scar (an unquoted probe silently grandfathered a whole branch).
 */
export function bootstrapBase(head, revParse = (r) => git(`rev-parse ${r}`)) {
  for (const ref of [TICK_BRANCH, `origin/${TICK_BRANCH}`]) {
    try {
      const base = revParse(`--verify --quiet "${ref}^{commit}"`)
      if (!base) continue
      const fork = git(`merge-base "${base}" "${head}"`)
      if (fork) return fork
    } catch {
      /* no such branch here — try the next, then fall back to HEAD */
    }
  }
  return head
}

/** Is `a` a strict ancestor of `b`? Any git failure answers "cannot tell" = no. */
function gitIsStrictAncestor(a, b) {
  if (!a || !b || a === b) return false
  try {
    execSync(`git merge-base --is-ancestor "${a}" "${b}"`, { windowsHide: true, cwd: REPO_ROOT, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * The same question, asked of the commit graph ONCE instead of per pair (see
 * `ancestorIndex` for the measurement that forced this). The per-pair probe stays
 * as the fallback for anything the graph cannot answer — a commit outside it, or
 * a shallow checkout, where the listing is truncated and a "no" would be a guess.
 */
function ancestryProbe(head, shas) {
  let shallow = true
  try {
    shallow = git('rev-parse --is-shallow-repository') !== 'false'
  } catch {
    /* an ancient git without the flag — treat as shallow and keep asking git */
  }
  if (shallow) return gitIsStrictAncestor
  try {
    // The graph answers only about the shas it was BUILT for; everything else is
    // asked of git, so this is a speed-up of the common case and never a change
    // of verdict (`strictAncestorProbe` holds that line).
    return strictAncestorProbe(ancestorIndex(git(`rev-list --topo-order --parents "${head}"`), shas), gitIsStrictAncestor)
  } catch {
    return gitIsStrictAncestor
  }
}

/**
 * Everything the core needs — exported so the guard preflight judges the gate
 * from the SAME gathering the Stop hook uses rather than a second copy of this
 * git work, which would drift and hand back a false "clean".
 */
export function gatherCriticalityReviewInputs({ sessionId = '' } = {}) {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  if (heldByOtherLiveOwner(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: 'not-lock-owner' }
  }
  let branch = 'HEAD'
  try {
    branch = git('rev-parse --abbrev-ref HEAD')
  } catch {
    /* detached or unborn — the branch check below then stands the gate down */
  }
  if (branch !== TICK_BRANCH) {
    return { applicable: false, why: `ticks are ${TICK_BRANCH}-only; this checkout is on ${branch}` }
  }
  const head = git('rev-parse HEAD')
  const stored = baselineFor(readBaselineState(), branch)
  const baseline = stored || bootstrapBase(head)

  // Diff from the merge-base, never the raw baseline.
  let base = baseline
  try {
    base = git(`merge-base "${baseline}" "${head}"`)
  } catch {
    /* unrelated baseline — the read below decides, or re-arms us */
  }

  // NOW is read from the WORKING TREE, not from HEAD: the tick is a file edit,
  // and the gate should bite while it is still being made rather than one turn
  // after it is committed.
  const headTasks = readWorkOrder(repoPath(TASKS_FILE))
  const headArchive = readWorkOrder(repoPath(ARCHIVE_FILE))
  // No work order at all: stand down rather than clear. Clearing would ADVANCE
  // the baseline past a tick this checkout simply could not see.
  if (!headTasks && !headArchive) {
    return { applicable: false, why: 'no work order in this checkout' }
  }

  let effective = baseline
  let ticks = []
  {
    try {
      ticks = highTicks({
        baseTasks: showAt(base, TASKS_FILE),
        baseArchive: showAt(base, ARCHIVE_FILE),
        headTasks,
        headArchive,
      })
    } catch (e) {
      // ONLY a baseline that is genuinely GONE may move the gate — a rebased or
      // gc'd baseline makes the read fail forever, and falling through to the
      // wrapper's fail-open would disable the gate for good. Every other failure
      // rethrows into the per-turn fail-open, which leaves the gate where it was.
      if (!commitMissing(base)) throw e
      effective = bootstrapBase(head)
      ticks = highTicks({
        baseTasks: showAt(effective, TASKS_FILE),
        baseArchive: showAt(effective, ARCHIVE_FILE),
        headTasks,
        headArchive,
      })
    }
  }

  // Only the ledger lines that name a pending point — in the common turn that is
  // none, so the ancestry probes below cost nothing at all.
  const numbers = new Set(ticks.map((t) => t.number))
  const candidates = ticks.length ? readRecords().filter((r) => numbers.has(Number(r?.point))) : []
  // ONE graph for both loops below — the pair probe underneath them is quadratic
  // in a point's review rounds, and twelve rounds were enough to stall the gate.
  const isStrictAncestor = candidates.length
    ? ancestryProbe(
        head,
        candidates.map((r) => r.sha),
      )
    : gitIsStrictAncestor
  const records = candidates.length
    ? verifyCarried(candidates.map((r) => ({ ...r, reachable: r.sha === head || isStrictAncestor(r.sha, head) })))
    : []
  for (const r of records) {
    r.descendsFrom = records
      .filter((o) => Number(o.point) === Number(r.point) && isStrictAncestor(o.sha, r.sha))
      .map((o) => o.sha)
  }
  attachPointFileSets(records)
  attachUnavailableClearances(records)

  return {
    applicable: true,
    head,
    branch,
    baseline: effective,
    // A filed finding clears only while its numbered carrier is visibly open in
    // the live work order. TASKS.md is the open half; the archive cannot prove
    // that unfinished work remains scheduled.
    inputs: { baseline: effective, head, ticks, openPoints: [...openNumbers(headTasks)], records },
  }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  if (argv.includes('--record-unavailable')) {
    try {
      const parsed = parseUnavailableReceiptArgs(argv)
      if (!parsed.ok) {
        console.error(`criticality-review-guard: refusing unavailable receipt.\n  · ${parsed.errors.join('\n  · ')}`)
        console.error(`\nrun: ${unavailableReceiptUsage()}`)
        process.exit(1)
      }
      const built = buildUnavailableReceipt({ ...parsed.values, records: readRecords() })
      if (!built.ok) {
        console.error(`criticality-review-guard: refusing unavailable receipt.\n  · ${built.errors.join('\n  · ')}`)
        console.error(`\nrun: ${unavailableReceiptUsage()}`)
        process.exit(1)
      }
      appendRecord(built.record)
      console.log(
        `recorded: ${built.record.sha.slice(0, 7)} point ${built.record.point} has ` +
          `${built.record.files.length} Git-verified unavailable file(s)\n` +
          '  ledger: .claude/mechanism-reviews.jsonl (tracked — commit it with the reviewed passes)',
      )
      process.exit(0)
    } catch (error) {
      console.error(`criticality-review-guard: unavailable receipt failed: ${error?.message ?? error}`)
      process.exit(1)
    }
  }
  const status = argv[0] === '--status'
  try {
    let sessionId = ''
    try {
      sessionId = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      /* manual run — the gate is global truth, not session-local */
    }

    const gathered = gatherCriticalityReviewInputs({ sessionId })
    if (!gathered.applicable) {
      if (status) console.log(`criticality-review-guard stands down: ${gathered.why}`)
      process.exit(0)
    }

    const verdict = evaluateCriticalityReview(gathered.inputs)

    // THE GAP CLAUSE, mirrored from mechanism-review-guard (point 714): a
    // standing refusal whose re-review no caller can assemble must not trap
    // the session. Only where EVERY blocking finding is record-backed AND
    // every record's own range measures unassemblable does the block degrade
    // to a report; a finding without a record demands a fresh review of a sha
    // the caller chooses, so it always keeps blocking. Keyed on measurement
    // alone; a failed assessment rules no gap.
    let gap = null
    if (verdict.block) {
      try {
        const { assessCriticalityGap } = await import('./mechanism-review-guard-gap.mjs')
        gap = await assessCriticalityGap(verdict.findings)
      } catch {
        /* no ruling — the block below stands */
      }
    }

    if (status) {
      console.log(`HEAD:      ${gathered.head.slice(0, 7)} (branch ${gathered.branch})`)
      console.log(`baseline:  ${String(gathered.baseline ?? '<none — arms at this HEAD>').slice(0, 7)}`)
      const ticks = gathered.inputs.ticks ?? []
      console.log(`high-criticality points ticked since the baseline: ${ticks.length}`)
      for (const t of ticks) {
        const mine = (gathered.inputs.records ?? []).filter((r) => Number(r.point) === t.number)
        console.log(
          `  point ${t.number} — ${t.rationale || '(no rationale given)'}\n      ` +
            `${mine.length} record(s), ${mine.filter((r) => r.reachable).length} in this history`,
        )
      }
      if (gap?.gap) console.log(`\n${gap.report}`)
      else console.log(verdict.block ? `\n${formatCriticalityReviewVerdict(verdict)}` : '\nGATE CLEAR')
      process.exit(0)
    }

    if (verdict.block) {
      if (gap?.gap) {
        // Deliberately NOT a baseline advance: the demand is suspended, never
        // satisfied, and blocking resumes when the material fits again.
        console.error(gap.report)
        process.exit(0)
      }
      process.stdout.write(
        JSON.stringify({ decision: 'block', reason: formatCriticalityReviewVerdict(verdict) }),
      )
      process.exit(0)
    }
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
            `criticality-review-guard: the review ledger cannot be read, so nothing here can be proven reviewed.\n` +
            `  ${e.message}\n` +
            '  Repair the ledger (it is tracked in git) and end the turn again.',
        }),
      )
      process.exit(0)
    }
    console.error(`criticality-review-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
