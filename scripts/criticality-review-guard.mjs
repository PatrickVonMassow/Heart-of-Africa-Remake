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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname } from 'node:path'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { readRecords, verifyCarried } from './mechanism-review.mjs'
import {
  evaluateCriticalityReview,
  formatCriticalityReviewVerdict,
  highTicks,
} from './criticality-review-guard-core.mjs'

const PAUSE = repoPath('.claude/batch-paused')

/** Per-branch baseline. Local bookkeeping ("what this tree has confirmed"), so
 *  it is deliberately NOT tracked — the ledger that must travel between a branch
 *  and the session that merges it is the tracked one. */
export const BASELINE_PATH = repoPath('.claude/criticality-review-baseline.json')

/** The branch ticks happen on (CLAUDE.md §6: TASKS.md is main-only). */
export const TICK_BRANCH = 'main'

const TASKS_FILE = 'TASKS.md'
const ARCHIVE_FILE = 'docs/tasks-archive.md'

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
function isStrictAncestor(a, b) {
  if (!a || !b || a === b) return false
  try {
    execSync(`git merge-base --is-ancestor "${a}" "${b}"`, { windowsHide: true, cwd: REPO_ROOT, stdio: 'ignore' })
    return true
  } catch {
    return false
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
  const records = ticks.length
    ? verifyCarried(
        readRecords()
          .filter((r) => numbers.has(Number(r?.point)))
          .map((r) => ({ ...r, reachable: r.sha === head || isStrictAncestor(r.sha, head) })),
      )
    : []
  for (const r of records) {
    r.descendsFrom = records
      .filter((o) => Number(o.point) === Number(r.point) && isStrictAncestor(o.sha, r.sha))
      .map((o) => o.sha)
  }

  return {
    applicable: true,
    head,
    branch,
    baseline: effective,
    inputs: { baseline: effective, head, ticks, records },
  }
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
    console.error(`criticality-review-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
