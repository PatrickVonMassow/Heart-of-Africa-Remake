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
// GRANDFATHERING: the baseline is per branch and self-arms at the current HEAD on
// its first run, exactly as model-guard does with its timestamp. The twenty-odd
// guards that predate this gate therefore owe nothing; the point is the next
// mechanism, not a review debt for the existing ones.
//
// How the gate clears:
//   node scripts/mechanism-review.mjs --record <sha> --model <name> \
//       --verdict <merge|merge-with-fixes|do-not-merge> --evidence "<one line>"
// CLI:
//   node scripts/mechanism-review-guard.mjs --status
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname } from 'node:path'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { readRecords } from './mechanism-review.mjs'
import {
  evaluateMechanismReview,
  formatMechanismReviewVerdict,
  mechanismPathsIn,
  modelFromTrailers,
} from './mechanism-review-core.mjs'

const PAUSE = repoPath('.claude/batch-paused')

/** Per-branch baseline. Local bookkeeping ("what this tree has confirmed"), so
 *  it is deliberately NOT tracked: a shared file would conflict on every branch,
 *  while the ledger that must travel — the reviews — is the tracked one. */
export const BASELINE_PATH = repoPath('.claude/mechanism-review-baseline.json')

/** Record/field separators for the one `git log` this guard runs. Plain ASCII:
 *  a raw control byte or a `%`-pair in the command line is a Windows shell
 *  hazard, and this hook runs on Windows. */
const REC = '__C__'
const FLD = '__F__'

const git = (cmd) => execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()

/** True when `a` is an ancestor of (or equal to) `b`. A git failure answers no. */
export function isAncestor(a, b) {
  try {
    execSync(`git merge-base --is-ancestor "${a}" "${b}"`, { cwd: REPO_ROOT, stdio: 'ignore' })
    return true
  } catch {
    return false
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

/** The current scripts/ listing — needed for the "a core beside a guard" rule. */
function scriptFiles() {
  try {
    return readdirSync(repoPath('scripts'))
  } catch {
    return []
  }
}

/** Commits in base..head that touch a mechanism path, oldest first. */
function mechanismCommits(base, head, files) {
  const out = git(
    `log --format="${REC}%H${FLD}%ct${FLD}%s${FLD}%(trailers:key=Co-Authored-By,valueonly,separator=;)" ` +
      `--name-only --reverse ${base}..${head}`,
  )
  const commits = []
  for (const chunk of out.split(REC)) {
    if (!chunk.trim()) continue
    const lines = chunk.split('\n')
    const [sha, ct, subject, trailers] = lines[0].split(FLD)
    if (!sha) continue
    const touched = lines
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean)
    const mech = mechanismPathsIn(touched, { scriptFiles: files })
    if (!mech.length) continue
    commits.push({
      sha: sha.trim(),
      at: Number(ct) * 1000 || 0,
      subject: (subject ?? '').trim(),
      authorModel: modelFromTrailers(trailers),
      files: mech,
    })
  }
  return commits
}

/**
 * Everything the core needs — exported so the guard preflight judges the gate
 * from the SAME gathering the Stop hook uses rather than a second copy of this
 * git work, which would drift and hand back a false "clean". Read-only: arming
 * and advancing the baseline stay in the main path below.
 */
export function gatherMechanismReviewInputs({ sessionId = '' } = {}) {
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
  const baseline = baselineFor(state, branch)
  if (!baseline) {
    return { applicable: true, head, branch, bootstrap: true, inputs: { baseline: null, head } }
  }

  // Diff from merge-base, never the raw baseline: on a feature branch the
  // baseline sits on main, and a two-dot diff would re-show main's own (already
  // confirmed) mechanism work as pending.
  let base = baseline
  try {
    base = git(`merge-base ${baseline} ${head}`)
  } catch {
    /* unrelated or gc'd baseline — the raw range below still answers */
  }
  const pendingCommits =
    base === head ? [] : mechanismCommits(base, head, scriptFiles())

  // Which recorded reviews CONTAIN each pending commit. A record only counts when
  // it is reachable from HEAD — a review recorded on an abandoned branch judged a
  // state that is not the one being shipped.
  // Nothing pending means nothing to cover: the ancestry probes below are one
  // git spawn per record, and the overwhelmingly common turn changes no mechanism
  // at all. A hook that costs a process per ledger line on every turn end is a
  // hook people switch off.
  const records = pendingCommits.length ? readRecords().filter((r) => isAncestor(r.sha, head)) : []
  for (const c of pendingCommits) {
    c.coveringRecordShas = records.filter((r) => isAncestor(c.sha, r.sha)).map((r) => r.sha)
  }

  return {
    applicable: true,
    head,
    branch,
    baseline,
    inputs: { baseline, head, pendingCommits, records },
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

    const gathered = gatherMechanismReviewInputs({ sessionId })
    if (!gathered.applicable) {
      if (status) console.log(`mechanism-review-guard stands down: ${gathered.why}`)
      process.exit(0)
    }

    const verdict = evaluateMechanismReview(gathered.inputs)

    if (status) {
      console.log(`HEAD:      ${gathered.head.slice(0, 7)} (branch ${gathered.branch})`)
      console.log(`baseline:  ${String(gathered.baseline ?? '<none — arms at this HEAD>').slice(0, 7)}`)
      const pending = gathered.inputs.pendingCommits ?? []
      console.log(`mechanism commits since the baseline: ${pending.length}`)
      for (const c of pending) {
        console.log(
          `  ${c.sha.slice(0, 7)}  ${c.files.join(', ')}\n      authored by ${c.authorModel || 'unknown'}, ` +
            `${c.coveringRecordShas.length} covering review(s)`,
        )
      }
      console.log(verdict.block ? `\n${formatMechanismReviewVerdict(verdict)}` : '\nGATE CLEAR')
      process.exit(0)
    }

    if (verdict.block) {
      process.stdout.write(
        JSON.stringify({ decision: 'block', reason: formatMechanismReviewVerdict(verdict) }),
      )
      process.exit(0)
    }
    // Clear (or bootstrapping): pin the confirmed state so the next turn starts
    // from here instead of re-walking history.
    if (gathered.head) writeBaseline(gathered.branch, gathered.head)
    process.exit(0)
  } catch (e) {
    console.error(`mechanism-review-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
