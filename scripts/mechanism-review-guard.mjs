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

const git = (cmd) => execSync(`git ${cmd}`, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' }).trim()

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

/**
 * Where a tree with NO baseline at all starts judging. The baseline file is
 * local bookkeeping, so a fresh clone or a fresh worktree has none — and arming
 * at HEAD would grandfather whatever mechanism work is already on the branch
 * (four-eyes review, 27.07.2026). The fork point from the integration branch is
 * the honest answer: everything on main is genuinely old, everything this branch
 * added is genuinely new. Falls back to HEAD where no such branch resolves,
 * which is the grandfathering the point asks for.
 */
export function bootstrapBase(head, revParse = (r) => git(`rev-parse ${r}`)) {
  for (const ref of ['main', 'origin/main']) {
    try {
      // The revision MUST stay quoted: execSync goes through cmd.exe on Windows,
      // where `^` is the escape character — unquoted, git received `main{commit}`
      // and the fallback to HEAD silently grandfathered the branch's own work.
      // render-verify-guard carries the same note from the same bite.
      const base = revParse(`--verify --quiet "${ref}^{commit}"`)
      if (!base) continue
      const fork = execSync(`git merge-base "${base}" "${head}"`, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' }).trim()
      if (fork) return fork
    } catch {
      /* no such branch here — try the next, then fall back to HEAD */
    }
  }
  return head
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
function mechanismCommits(base, head, files) {
  const out = git(
    `log --format="${REC}%H${FLD}%ct${FLD}%s${FLD}%(trailers:key=Co-Authored-By,valueonly,separator=;)" ` +
      `--name-only --diff-merges=cc --reverse "${base}..${head}"`,
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
  const stored = baselineFor(state, branch)
  const baseline = stored || bootstrapBase(head)

  // Diff from merge-base, never the raw baseline: on a feature branch the
  // baseline sits on main, and a two-dot diff would re-show main's own (already
  // confirmed) mechanism work as pending.
  let base = baseline
  try {
    base = git(`merge-base "${baseline}" "${head}"`)
  } catch {
    /* unrelated baseline — the raw range below decides, or re-arms us at HEAD */
  }
  let effective = baseline
  let pendingCommits = []
  if (base !== head) {
    try {
      pendingCommits = mechanismCommits(base, head, scriptFiles())
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
      base = effective
      try {
        base = git(`merge-base "${effective}" "${head}"`)
      } catch {
        /* the raw range below decides */
      }
      pendingCommits = base === head ? [] : mechanismCommits(base, head, scriptFiles())
    }
  }

  // Which recorded reviews CONTAIN each pending commit. A record only counts when
  // it is reachable from HEAD — a review recorded on an abandoned branch judged a
  // state that is not the one being shipped.
  // Nothing pending means nothing to cover, and the ancestry work below costs git
  // processes: the overwhelmingly common turn changes no mechanism at all, and a
  // hook that costs a process per ledger line on every turn end is a hook people
  // switch off.
  //
  // ONE git spawn for the whole LEDGER, not two per record (point 474, measured
  // 03.08.2026 on the Linux host). This loop had already been cut from one spawn
  // per (commit, record) PAIR to one per record after the night of 30.07.2026;
  // per record was still 83 × 2 = 166 processes here, 139 seconds, which put the
  // fast gate over its budget on EVERY feature branch that touches a mechanism
  // file. A shell spawn is simply dearer in this container than it was on the
  // Windows host, so a per-record cost no longer fits.
  //
  // The narrowing is EXACT, not an approximation. A record can only cover a
  // pending commit when that commit is reachable from the record's sha and NOT
  // from `effective` — so the record's own sha must itself lie in
  // `effective..head`. A record at or before `effective` has everything it
  // reaches already reachable from `effective`, so its `containedShas` is empty
  // by construction and it could never have covered anything. That set is also
  // reachable from head by definition, which is exactly what the old
  // per-record ancestry filter asked, so both spawn loops collapse into the one
  // `rev-list` below (the `isAncestor` helper that served the old filter went
  // with it — nothing else called it).
  const branchRange = pendingCommits.length
    ? new Set(
        git(`rev-list ${head} --not ${effective}`)
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean),
      )
    : new Set()
  const records = pendingCommits.length ? readRecords().filter((r) => branchRange.has(r.sha)) : []
  // One spawn per SURVIVING record — in practice the reviews recorded on this
  // branch, which is a handful, never the whole ledger.
  for (const r of records) {
    r.containedShas = new Set(
      git(`rev-list ${r.sha} --not ${effective}`)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    )
  }
  for (const c of pendingCommits) {
    c.coveringRecordShas = records.filter((r) => r.containedShas?.has(c.sha)).map((r) => r.sha)
  }

  return {
    applicable: true,
    head,
    branch,
    baseline: effective,
    inputs: { baseline: effective, head, pendingCommits, records },
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
