// Stop hook (user mandate 22.07.2026): GUARANTEE that no GUI/rendering/shader
// change is committed/ticked/called done without a verify run on BOTH renderer
// backends — WebGPU (the user's real backend) AND the WebGL2 fallback — judged
// by the rendered picture. A reminder already failed (the point-210 sea-coast
// fix was "done" on WebGL2 while WebGPU still showed the staircase), so this
// BLOCKS turn-end while a committed render-path change lacks a recorded passing
// run per backend. The decision logic lives in render-verify-core.mjs (pure,
// Vitest-covered); runs are recorded mechanically from INSIDE each verify-suite
// process (render-verify-recorder.mjs, armed by scripts/verify/_browser.mjs).
// This wrapper only gathers inputs and is fail-OPEN: any internal error →
// allow, so a guard bug never traps the session.
//
// How the gate clears, mechanically:
//   VERIFY_GL=webgpu node scripts/verify/run-all.mjs <suite>   # exit 0 recorded
//   VERIFY_GL=webgl  node scripts/verify/run-all.mjs <suite>   # exit 0 recorded
// A run only counts if it finished AFTER the last edit of any changed render
// file (an earlier run cannot have seen the final code). When both backends are
// covered the guard advances the verified baseline (clearedHead) by itself —
// no manual ritual.
//
// A run counts as covering when it is CLEAN (exit 0) or ACCOUNTED FOR (point
// 550): every red in it charged to an OPEN work-order point. The clearance is
// recorded as `clearedVia: 'accounted-for'` with the charges, and said out loud
// — a suite that cannot exit 0 for another point's reasons must not force a
// hand-written --defer on every change, and it must not read as a pass either.
// A run whose result lines the capture cap TRUNCATED is not a red at all but an
// INCOMPLETE RECORDING (point 734): its red list is a fragment, so none of point
// 640's three closings can reach it, and before this it could only be waived by
// hand. It is now named as its own class and signed off per run, with evidence —
// a closure that discards the record and clears no backend.
// A run that CRASHED rather than reported is named apart the same way (sixth
// round): it judged no picture, no charge can reach it, and it is signed off
// per run with the evidence of its kept log — a disposition, never coverage.
// CLI:
//   node scripts/render-verify-guard.mjs --status          # inspect the gate (alias: status)
//   node scripts/render-verify-guard.mjs --defer "<why>"   # loud escape valve
//   node scripts/render-verify-guard.mjs --clear "<why>"   # manual baseline advance
//   node scripts/render-verify-guard.mjs --incomplete "<backend>/<suite>" --evidence "<why>"
//   node scripts/render-verify-guard.mjs --crashed "<backend>/<suite>" --evidence "<what the log shows>"
import { readFileSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  REPO_ROOT,
  RENDER_STATE_PATH,
  readRenderState,
  mergeRenderState,
} from './render-verify-state.mjs'
import {
  isRenderPath,
  evaluate,
  BACKENDS,
  coveringRun,
  baselineFor,
  chargeablePoints,
  runVerdict,
  latestRun,
  isIncompleteRecording,
  incompleteClosureFor,
  crashClosureFor,
  afterCrashClosure,
  unexplainedRuns,
  droppedLinesOf,
  runStamp,
  runIdentity,
} from './render-verify-core.mjs'
import { readTasksAll } from './tasks-source.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'
import { gatherGuardDutyContext } from './guard-duty.mjs'

function git(cmd) {
  return execSync(cmd, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' }).trim()
}

/**
 * True when `sha` names no reachable commit — the one condition under which a
 * failed baseline diff may advance the gate. A git failure here answers "cannot
 * tell", which counts as PRESENT: the gate then stays where it is rather than
 * clearing itself on a question it could not answer.
 */
export function commitMissing(sha) {
  try {
    // The revision MUST stay quoted: execSync goes through cmd.exe on Windows,
    // where `^` is the escape character — unquoted, git received `<sha>{commit}`
    // and answered "Not a valid object name" for a commit that exists, so this
    // function called every baseline gone and the narrowing protected nothing.
    git(`git cat-file -e "${sha}^{commit}"`)
    return false
  } catch (e) {
    return /Not a valid object name|could not be found|bad file|unknown revision/i.test(
      String(e.stderr ?? e.message ?? e),
    )
  }
}

/** Current branch name ('HEAD' when detached) — the per-branch baseline key. */
function currentBranch() {
  try {
    return git('git rev-parse --abbrev-ref HEAD')
  } catch {
    return 'HEAD'
  }
}

/**
 * Render-set paths changed between the verified baseline and HEAD, diffed from
 * `git merge-base(baseline, HEAD)` — never the raw baseline: after a `git
 * switch` the baseline can sit on ANOTHER branch, and a plain two-dot diff
 * would then re-show that branch's (already verified) render work as pending
 * and spuriously hard-block the turn (feature-branch workflow, fix B1).
 * On linear history merge-base(baseline, HEAD) == baseline, so ordinary main
 * work behaves exactly as before. Returns { paths, base }.
 */
function changedRenderPaths(clearedHead, head) {
  if (!clearedHead || clearedHead === head) return { paths: [], base: clearedHead }
  let base = clearedHead
  try {
    base = git(`git merge-base ${clearedHead} ${head}`)
  } catch {
    /* unrelated/gc'd baseline — the raw diff below then decides (or re-baselines) */
  }
  if (base === head) return { paths: [], base }
  const out = git(`git diff --name-only ${base} ${head}`)
  return { paths: out.split('\n').filter(Boolean).filter(isRenderPath), base }
}

/** Latest change time of the changed render paths (a covering run must
 *  postdate it): the newest commit in base..HEAD touching them — COMMIT time,
 *  not file mtime, because a mere `git switch` rewrites working-tree mtimes
 *  and would demand a fresh dual-backend run after every branch hop (B1) —
 *  plus the mtime of any changed path still DIRTY in the working tree (an
 *  uncommitted edit is newer than any commit). Falls back to HEAD's commit
 *  time when nothing is datable. */
function latestChangeAt(paths, head, base) {
  let latest = 0
  const quoted = paths.map((p) => `"${p}"`).join(' ')
  try {
    const range = base && base !== head ? `${base}..${head}` : head
    const out = git(`git log -1 --format=%ct ${range} -- ${quoted}`)
    if (out) latest = Number(out) * 1000
  } catch {
    /* unlogable range — the HEAD fallback below covers it */
  }
  try {
    const dirty = git(`git status --porcelain -- ${quoted}`)
    for (const line of dirty.split('\n').filter(Boolean)) {
      const p = line.slice(3).trim().replace(/^"|"$/g, '')
      try {
        const t = statSync(resolve(REPO_ROOT, p)).mtimeMs
        if (t > latest) latest = t
      } catch {
        /* deleted while dirty — the commit/HEAD time stands */
      }
    }
  } catch {
    /* status unavailable — the commit time stands */
  }
  if (latest === 0) {
    try {
      latest = Number(git(`git show -s --format=%ct ${head}`)) * 1000
    } catch {
      /* no commit time either — evaluate() then accepts any recorded run */
    }
  }
  return latest
}

/** Advance the verified baseline for `branch`: the per-branch map entry plus
 *  the legacy scalar mirror (status display, pre-branch-workflow readers). */
function advanceBaseline(state, branch, head, extra = {}) {
  mergeRenderState({
    clearedHead: head,
    clearedHeads: { ...(state.clearedHeads ?? {}), [branch]: head },
    ...extra,
  })
}

/**
 * The ONE gather failure that may clear a pending gate: the recorded baseline no
 * longer diffs against HEAD (rebased away, gc'd, or a baseline from an unrelated
 * history). Blocking forever on a window that cannot be diffed would trap the
 * session, so that case re-baselines — fail-open ONCE, logged.
 *
 * It is a distinct type because every OTHER failure in the gathering must NOT
 * write state. A transient `git` failure (index.lock contention is real on this
 * machine) or a throwing ownership probe would otherwise permanently clear a
 * pending, unverified render gate — fail-open-once turned into fail-open-forever,
 * and a NON-owner session could overwrite the owner's baseline. Those allow the
 * stop with the state untouched, so the gate is still there on the next turn.
 */
export class BaselineDiffError extends Error {
  constructor(baseline, cause) {
    super(`diff vs ${String(baseline).slice(0, 7)} failed (${(cause && cause.message) || cause})`)
    this.name = 'BaselineDiffError'
    this.baseline = baseline
    this.cause = cause
  }
}

/**
 * Everything evaluate() needs — HEAD, the per-branch baseline, the pending render
 * paths and their latest change time — exported so the preflight (point 365 D)
 * judges the gate from the SAME gathering the Stop hook uses; a second copy of
 * this git work would drift and report a false "clean". Read-only: the baseline
 * bootstrap and its advancement stay in the main path.
 *
 * `deps` overrides the I/O sources one by one; the H4 tests use it to make each
 * source throw and pin which error re-baselines and which merely allows.
 */
export function gatherRenderVerifyInputs({ sessionId = '', deps = {} } = {}) {
  const {
    heldByOther = heldByOtherLiveOwner,
    revParseHead = () => git('git rev-parse HEAD'),
    branchOf = currentBranch,
    readState = readRenderState,
    diffRenderPaths = changedRenderPaths,
    changeTimeOf = latestChangeAt,
    baselineGone = commitMissing,
    workOrder = readTasksAll,
    guardDuty = gatherGuardDutyContext,
  } = deps
  // Hard singleton: a session that does not own the live batch lock stands down.
  if (heldByOther(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: 'not-lock-owner' }
  }
  const head = revParseHead()
  const branch = branchOf()
  const state = readState() ?? {}
  const cleared = baselineFor(state, branch)
  if (!cleared) {
    return { applicable: false, why: 'no verified baseline yet — the gate bootstraps at this HEAD', head, branch, state }
  }
  let paths
  let base
  try {
    ;({ paths, base } = diffRenderPaths(cleared, head))
  } catch (e) {
    // Typed on purpose: ONLY a baseline that is genuinely GONE may advance the
    // gate. The diff step can also fail transiently — a spawn error while the
    // machine is loaded, which is a documented reality here — and re-baselining
    // on that would clear an unverified render change for good. So confirm the
    // commit is really unreachable first; every other failure falls through to
    // the fail-open path, which allows the stop and writes NO state.
    if (baselineGone(cleared)) throw new BaselineDiffError(cleared, e)
    throw e
  }
  // WHICH POINTS A RED MAY BE CHARGED TO (point 550). Read here, so the Stop
  // hook and the preflight judge an accounted-for run against the SAME work
  // order. An unreadable work order yields an empty set, which charges nothing
  // and leaves the gate exactly as strict as it was before the accounting
  // existed — the safe direction.
  let openPoints = []
  try {
    openPoints = chargeablePoints(workOrder())
  } catch {
    /* unreadable work order — nothing is chargeable */
  }
  return {
    applicable: true,
    head,
    branch,
    state,
    cleared,
    openPoints,
    inputs: {
      head,
      clearedHead: cleared,
      changedRenderPaths: paths,
      latestChangeAt: paths.length ? changeTimeOf(paths, head, base) : 0,
      runs: state.runs,
      deferral: state.deferral,
      openPoints,
      // The signed-off broken RECORDINGS and CRASHES (point 734) — not
      // waivers: each names one run by identity and clears no backend.
      incompleteClosures: state.incompleteClosures,
      crashClosures: state.crashClosures,
      sessionId,
      fence: guardDuty({ sessionId }),
    },
  }
}

/** How many signed closures the state keeps, per family. The run window itself
 *  holds 40, so a closure older than that names a run nobody can see. */
const MAX_SIGNED_CLOSURES = 40

/**
 * WHICH SIGNED CLOSURES SURVIVE THE CAP (review finding, 28.08.2026). Dropping
 * the OLDEST-SIGNED one was the wrong order: runs are evicted in RECORDING
 * order, and the two orders are unrelated. Sign the newest of forty runs first
 * and the other thirty-nine afterwards, then record and sign a forty-first, and
 * the first eviction takes the newest run's closure — that run is still inside
 * the window, so it silently became an OPEN run again, which is a sign-off
 * undone by bookkeeping alone.
 *
 * Retention follows the RUNS instead: a closure naming a run the window still
 * holds is kept, and one naming a run nobody can see any more is what goes
 * first — it can lift nothing. Only if the closures naming live runs alone
 * exceed the cap does the oldest of THEM go, which no ordinary state reaches
 * (both lists are capped at forty). Total: unreadable runs make every closure
 * evictable, which is the old, cautious behaviour.
 */
export function retainedClosures(closures, runs, limit = MAX_SIGNED_CLOSURES) {
  const list = (Array.isArray(closures) ? closures : []).filter((c) => c && typeof c === 'object')
  if (list.length <= limit) return list
  const live = new Set()
  for (const r of Array.isArray(runs) ? runs : []) {
    const id = runIdentity(r)
    if (typeof id === 'string') live.add(id)
  }
  const keep = list.map(() => true)
  let over = list.length - limit
  // Two passes: the closures whose run has left the window, then — only if that
  // was not enough — the rest, each pass oldest-signed first.
  for (const orphansPass of [true, false]) {
    for (let i = 0; i < list.length && over > 0; i++) {
      if (!keep[i] || !live.has(list[i].run) !== orphansPass) continue
      keep[i] = false
      over--
    }
  }
  return list.filter((_, i) => keep[i])
}

/**
 * A run's timestamp for a human, never throwing: `toISOString()` dies on a
 * finite but out-of-range number, and these come off disk.
 *
 * AN UNDATED RUN READS AS UNDATED (review finding, 28.08.2026). A record with
 * no readable stamp is deliberately supported — that is why the closure binds
 * by content and not by a time — but `Number(null)` is 0, so the sign-off line
 * and `--status` printed it as `1970-01-01T00:00:00.000Z`: a time nobody ever
 * measured, stated in the same breath as the ones that were. Missing is now
 * said as missing, and an unreadable value still shows itself raw rather than
 * being rendered into a date.
 */
export function isoText(at) {
  if (at === null || at === undefined || at === '') return 'undated'
  const ms = Number(at)
  if (!Number.isFinite(ms)) return `t=${String(at)}`
  try {
    return new Date(ms).toISOString()
  } catch {
    return `t=${String(at)}`
  }
}

/** The recorded runs whose EFFECTIVE verdict is `incomplete` and that are NOT
 *  yet signed off. Judged by runVerdict, not by the truncation marker alone
 *  (round-5 review, 19.08.2026): a run that truncated AND crashed stays `red`
 *  (a crash outranks everything) and one that truncated on a `--section` probe
 *  stays `partial` (it blocks nobody) — offering either a closure would let the
 *  CLI report a sign-off that lifts nothing.
 *
 *  AND THE CRASH CLOSURE IS PART OF THAT READING (review finding, 28.08.2026).
 *  A run that crashed AND truncated was excluded here FOREVER, because the raw
 *  record still says `crashed`. Once its crash is signed off, the lost lines are
 *  all that is left of it — and they had no signing route at all, so the record
 *  was either stuck or, worse, cleared with its reds unread. */
/** Was this record's lost measurement RETAKEN — is there a later COVERING run of
 *  the same suite and backend (review finding, 28.08.2026, round 19)? Read for
 *  the status label only, never to remove a record from the sign-off list: the
 *  gate's own re-recording test additionally requires the later run to have seen
 *  code since the last render edit, so a record can be answered by this reading
 *  and still be blocking by the gate's. Withholding its signature would strand
 *  it; saying "outside the window" about it would misdescribe it. */
export function reRecordedBy(state, r, options) {
  const runs = Array.isArray(state?.runs) ? state.runs : []
  const when = runStamp(r)
  if (when === null) return null
  return (
    runs.find((later) => {
      if (!later || later === r || later.partial === true) return false
      if (later.backend !== r.backend || later.suite !== r.suite) return false
      const laterAt = runStamp(later)
      // WITH THE OPEN POINTS IN HAND (review finding, 28.08.2026, round 20):
      // without them an ACCOUNTED-FOR run — a red run whose every red is charged
      // — reads as uncovering here, while the gate counts it as coverage.
      return laterAt !== null && laterAt > when && runVerdict(later, options ?? {}).covers
    }) ?? null
  )
}

export function openIncompleteRuns(state) {
  const runs = Array.isArray(state?.runs) ? state.runs : []
  return runs.filter(
    (r) =>
      isIncompleteRecording(r) &&
      runVerdict(afterCrashClosure(r, state?.crashClosures)).status === 'incomplete' &&
      !incompleteClosureFor(r, state?.incompleteClosures),
  )
}

/** The recorded runs that CRASHED, are judged as such (a `--section` probe
 *  stays `partial` and blocks nobody), and are not yet signed off. What the
 *  `--crashed` sign-off may see — same discipline as openIncompleteRuns: the
 *  CLI can only ever name a run that is really recorded and still blocking. */
/** WHAT ONE OPEN RECORD IS CALLED in the status report — the same three classes
 *  the gate blocks with, never "unaccounted red" for all of them (review
 *  finding, 28.08.2026, round 17). */
function classOf(entry) {
  if (entry?.status === 'incomplete') return 'INCOMPLETE RECORDING (not an unexplained red)'
  if (entry?.status === 'crashed') return 'CRASHED RUN (not an unexplained red)'
  if (entry?.status === 'suspect') return 'SUSPECT run — it passed only on the retry'
  return 'unaccounted red'
}

export function openCrashedRuns(state) {
  const runs = Array.isArray(state?.runs) ? state.runs : []
  return runs.filter(
    (r) => r?.crashed === true && runVerdict(r).status === 'red' && !crashClosureFor(r, state?.crashClosures),
  )
}

/**
 * THE CLOSURE A `--incomplete` OR `--crashed` INVOCATION WOULD WRITE, or the
 * reason it writes none. Pure and exported so the CLI's whole judgment is
 * testable without a state file. The closure names its run by CONTENT identity
 * (`runIdentity`), never by a stamp: the stamp route let one signature close a
 * second, different run that happened to share a millisecond, and left a record
 * with no readable timestamp closable by nothing at all (round-5 review,
 * 19.08.2026) — content identifies both. `--at` and `--run` narrow the
 * SELECTION; the written signature always binds the one record's full content.
 *
 * ONE judgment, TWO families: the selection and binding rules are deliberately
 * shared (a divergence here is how one family's signature would start serving
 * the other), while each family keeps its own open set, its own evidence
 * question and its own wording.
 *
 * @returns {{ closure: object } | { error: string, choices?: object[] }}
 *   `choices` is set only where the selector matched several open runs, so the
 *   caller can print each with its own --run. Total.
 */
function signedClosureDraft(state, options, family) {
  const { flag, what, whats, evidenceAsk, openRuns, extras } = family
  const { selector = '', at = '', run = '', evidence = '' } = options ?? {}
  if (!String(evidence).trim()) {
    return {
      error:
        `render-verify-guard ${flag}: --evidence "<${evidenceAsk}>" is required. ` +
        'The evidence is the whole difference between this and a silent waiver.',
    }
  }
  if (!String(selector).trim()) {
    return {
      error:
        `render-verify-guard ${flag}: name the run as "<backend>/<suite>" (add --at <iso|ms> or ` +
        '--run <id> when more than one is open). A closure names ONE run and can never pre-clear a ' +
        'future one.',
    }
  }
  const wanted = at ? new Date(/^\d+$/.test(at) ? Number(at) : at).getTime() : null
  if (at && !Number.isFinite(wanted)) {
    return { error: `render-verify-guard ${flag}: --at "${at}" is not a timestamp (ISO or epoch ms).` }
  }
  const wantedId = String(run).trim()
  const open = openRuns(state).filter(
    (r) =>
      `${r.backend}/${r.suite}` === selector &&
      (wanted === null || runStamp(r) === wanted) &&
      (wantedId === '' || runIdentity(r) === wantedId),
  )
  if (open.length === 0) {
    return {
      error:
        `render-verify-guard ${flag}: no OPEN ${what} matches "${selector}"` +
        `${at ? ` at ${at}` : ''}${wantedId ? ` with id ${wantedId}` : ''}. Run ` +
        `\`node scripts/render-verify-guard.mjs --status\` to see which runs still block.`,
    }
  }
  // Several matches that are one and the same CONTENT are one identity — sign
  // it once. Distinct contents are distinct judgments: refuse, and offer each
  // by the id that separates them even where their stamps cannot.
  //
  // "ONE SIGNATURE PER RUN" IS THEREFORE ONE SIGNATURE PER RECORDED CONTENT,
  // and the two coincide for anything a real lane can produce (review question,
  // 28.08.2026): `runIdentity` hashes the WHOLE record canonically — both
  // stamps, the exit, the screenshot count, every red — so two runs that really
  // happened differ in it, barring the hash collision named below. Records that
  // do NOT differ are the same measurement written twice, about which nobody
  // could say two different things, and one disposition is the honest answer
  // rather than a demand for two identical sentences. Pinned in
  // render-verify-guard.test.mjs.
  //
  // DECIDED, NOT ARGUED (review finding, 28.08.2026, which refused the argument
  // above and asked for a mechanism). The mechanism that would decide it is a
  // unique id WRITTEN AT RECORD TIME; it is not adopted here, for three
  // measured reasons, and the residual is named rather than hidden:
  //   - it reaches no record already on disk, so the content reading would have
  //     to stay as the fallback — and TWO identities for one run is exactly the
  //     defect the round-5 review fixed, where a signature closed a record the
  //     other reading did not name;
  //   - the two families this draft serves are RARE: a crash, and a recording
  //     that hit one of the recorder's stated budgets — MAX_RED_IDENTITIES,
  //     MAX_CAPTURE_CHARS or MAX_LINE_CHARS, each set far above anything this
  //     project has produced (rounds 14 and 15; before them, the class was
  //     legacy outright);
  //   - and the collision costs no coverage in either direction — a signature
  //     never makes a run cover a backend, so the worst case is one evidence
  //     sentence disposing of two byte-identical records of the same
  //     measurement.
  // WHAT REMAINS TRUE, PLAINLY — two residuals, not one:
  //   - two runs that really happened, in the same millisecond on both stamps
  //     and identical in every other field, are one identity here;
  //   - `runIdentity` is a 128-bit truncated SHA-256 over the record's canonical
  //     text (round 13, which replaced 64 bits of FNV). Two DIFFERENT records
  //     colliding is therefore not reachable by accident and not steerable on
  //     purpose, which is what hash equality authorising a signature requires.
  // The first case remains: one signature closes both such records. It is filed
  // as POINT 991 — a record-time `runId` the identity prefers, with the content
  // hash kept for every record already on disk — rather than settled here.
  const distinct = new Set(open.map((r) => runIdentity(r)))
  if (distinct.size > 1) {
    return {
      error:
        `render-verify-guard ${flag}: "${selector}" matches ${open.length} open ${whats}. ` +
        'A closure signs for ONE run, so name it — each is its own judgment and its own reason:',
      choices: open,
    }
  }
  const [run_] = open
  return {
    closure: {
      // The binding identity; everything after it is for the human reader.
      run: runIdentity(run_),
      backend: run_.backend,
      suite: run_.suite,
      at: runStamp(run_),
      ...extras(run_),
      evidence: String(evidence),
      closedAt: Date.now(),
    },
  }
}

export function incompleteClosureDraft(state, options) {
  return signedClosureDraft(state, options, {
    flag: '--incomplete',
    what: 'incomplete recording',
    whats: 'incomplete recordings',
    evidenceAsk: 'why this recording cannot be redone',
    openRuns: openIncompleteRuns,
    extras: (run_) => ({ droppedLines: droppedLinesOf(run_) }),
  })
}

export function crashClosureDraft(state, options) {
  return signedClosureDraft(state, options, {
    flag: '--crashed',
    what: 'crashed run',
    whats: 'crashed runs',
    // "We looked, and there is nothing to read" is only a disposition when the
    // looking really happened — the evidence names what the kept log showed.
    evidenceAsk: 'what the kept log (local/verify-logs/) shows — the death, and that no report exists',
    openRuns: openCrashedRuns,
    extras: () => ({}),
  })
}

const arg = isMainModule(import.meta.url) ? process.argv[2] : '__imported__'

// --defer "<reason>": the LOUD escape valve for the honest case where one
// backend genuinely cannot be judged headless. Covers the CURRENT head only —
// any further commit reopens the gate. Logged in the state file, echoed here.
if (arg === '--defer') {
  const reason = process.argv[3]
  if (!reason) {
    console.error('render-verify-guard --defer: a reason is required (quote it)')
    process.exit(1)
  }
  try {
    const head = git('git rev-parse HEAD')
    mergeRenderState({ deferral: { head, reason, at: Date.now() } })
    console.log(
      `⚠ RENDER-VERIFY DEFERRED at HEAD ${head.slice(0, 7)}: "${reason}". This is a logged ` +
        'exception, not a pass — the picture on the deferred backend is UNCONFIRMED. Say so in ' +
        'any report, and re-verify at the first chance. The next commit re-arms the gate.',
    )
    process.exit(0)
  } catch (e) {
    console.error(`render-verify-guard --defer failed: ${e && e.message}`)
    process.exit(1)
  }
}

// --incomplete "<backend>/<suite>" [--at <iso|ms>] --evidence "<why>":
// THE NAMED WAY OUT OF A BROKEN RECORDING (point 734).
// --crashed "<backend>/<suite>" [--at <iso|ms>] --evidence "<what the log shows>":
// THE SAME NAMED WAY OUT FOR A RUN THAT DIED RATHER THAN REPORTED (sixth round).
//
// Neither run can be closed by any of point 640's three ways — they all need to
// know WHAT the red was, and a truncated run never recorded it while a crashed
// run reported nothing at all. Before this, the only exit was a hand-written
// --defer, i.e. the waiver the charge ledger exists to abolish. This signs the
// RECORD off instead — and only that: it clears NO backend, and it names
// exactly ONE run, so two broken runs need two signatures with two reasons.
// EACH SIGNATURE CLOSES ITS OWN SENTENCE AND NOTHING ELSE: the reds a run did
// record keep blocking and close the ordinary ways in BOTH families, and a run
// that crashed AND truncated needs both signatures. The two live in separate
// lists precisely so neither can ever serve the other (round-5 order: a crash
// outranks the truncation, so the crash is signed first).
// Ambiguity is REFUSED rather than resolved (review finding, 19.08.2026): a
// selector matching several open runs prints each with its own --run, and
// saying so beats reporting a success that binds nothing. A record whose
// timestamp is unreadable is NOT refused — it is named by its `--run` identity
// or by being the only open one of its suite and backend, which is the whole
// reason the closure binds by content rather than by a stamp (round 14; this
// note still described the pre-identity behaviour). The judgment itself is the
// draft pair above, so it is testable without a state file.
/**
 * THE SIGN-OFF'S ARGUMENTS, read from the raw argv tail. Pure and exported for
 * the same reason the drafts are: the CLI's whole judgment has to be testable,
 * and this half was not — every case called the draft with a ready string, so
 * the parser was the one door no test went through (review finding,
 * 28.08.2026).
 *
 * A FLAG IS NOT A VALUE. `--evidence --run <id>` used to yield the literal
 * "--run" as the written evidence, and the draft, handed a non-empty string,
 * signed the record on it: a sign-off with no reason at all. A flag following
 * `--evidence` now leaves it EMPTY, which the draft refuses, and the flag stays
 * visible to itself and to the positional selector. Total.
 */
export function closureArgs(rest) {
  const argv = (Array.isArray(rest) ? rest : []).map((a) => String(a ?? ''))
  const valueOf = (flag) => {
    const i = argv.indexOf(flag)
    if (i === -1) return ''
    const next = String(argv[i + 1] ?? '').trim()
    return next.startsWith('--') ? '' : next
  }
  const consumed = new Set()
  for (const flag of ['--evidence', '--at', '--run']) {
    const i = argv.indexOf(flag)
    if (i === -1) continue
    consumed.add(i)
    // Only a real value is consumed; a following FLAG belongs to itself, and
    // marking it consumed would also hide it from the positional selector.
    const next = argv[i + 1]
    if (typeof next === 'string' && !next.startsWith('--')) consumed.add(i + 1)
  }
  return {
    evidence: valueOf('--evidence'),
    at: valueOf('--at'),
    run: valueOf('--run'),
    // Positional selector = the first argument that is neither a flag nor a
    // value another flag consumed, found by INDEX: comparing by value would drop
    // the selector whenever an evidence text happened to read the same.
    selector: argv.find((a, i) => !consumed.has(i) && !a.startsWith('--')) ?? '',
  }
}

if (arg === '--incomplete' || arg === '--crashed') {
  try {
    const { evidence, at, run: runSel, selector } = closureArgs(process.argv.slice(3))
    const state = readRenderState() ?? {}
    const crashed = arg === '--crashed'
    const draft = (crashed ? crashClosureDraft : incompleteClosureDraft)(state, { selector, at, run: runSel, evidence })
    if (draft.error) {
      console.error(draft.error)
      for (const r of draft.choices ?? []) {
        console.error(
          `  --run ${runIdentity(r)}   (@${isoText(runStamp(r) ?? r.at)}${crashed ? '' : `, ${droppedLinesOf(r)} line(s) dropped`})`,
        )
      }
      process.exit(1)
    }
    const { closure } = draft
    const key = crashed ? 'crashClosures' : 'incompleteClosures'
    const closures = retainedClosures((Array.isArray(state[key]) ? state[key] : []).concat([closure]), state.runs)
    mergeRenderState({ [key]: closures })
    console.log(
      crashed
        ? `⚠ CRASHED RUN SIGNED OFF: ${closure.backend}/${closure.suite} @${isoText(closure.at)} — ` +
            `"${closure.evidence}". This closes the CRASH, not the picture and not what the run did ` +
            'record: any red it printed before it died still blocks until it is fixed, charged or ' +
            'filed, and a recording it also lost still needs --incomplete. The run covers no backend ' +
            'and is never a pass. Re-run the suite at the first chance.'
        : `⚠ INCOMPLETE RECORDING SIGNED OFF: ${closure.backend}/${closure.suite} @${isoText(closure.at)} ` +
            `(${closure.droppedLines} result line(s) dropped) — "${closure.evidence}". This closes the RECORD, not the ` +
            'picture: the run still covers no backend and is never a pass, and every red it DID record still ' +
            'blocks until it is fixed, charged or filed. Re-run the suite at the first chance.',
    )
    process.exit(0)
  } catch (e) {
    console.error(`render-verify-guard ${arg} failed: ${e && e.message}`)
    process.exit(1)
  }
}

// --clear "<reason>": manual baseline advance (a judgment override, e.g. after
// verifying on real hardware outside the recorded suites). Loud, reason required.
if (arg === '--clear') {
  const reason = process.argv[3]
  if (!reason) {
    console.error('render-verify-guard --clear: a reason is required (quote it)')
    process.exit(1)
  }
  try {
    const head = git('git rev-parse HEAD')
    const branch = currentBranch()
    advanceBaseline(readRenderState() ?? {}, branch, head, {
      clearedAt: Date.now(),
      clearedBy: `manual: ${reason}`,
      deferral: undefined,
    })
    console.log(
      `render-verify baseline advanced to ${head.slice(0, 7)} on ${branch} (manual: "${reason}")`,
    )
    process.exit(0)
  } catch (e) {
    console.error(`render-verify-guard --clear failed: ${e && e.message}`)
    process.exit(1)
  }
}

// status: inspect the gate — pending render paths, per-backend coverage, runs.
// `--status` is the same command: every other guard here spells it that way,
// the docs quote it that way — and unrecognised, it fell through to Stop-hook
// mode, where an inspection could WRITE state (sixth round, hostile re-check).
if (arg === 'status' || arg === '--status') {
  try {
    const state = readRenderState() ?? {}
    const head = git('git rev-parse HEAD')
    const branch = currentBranch()
    const cleared = baselineFor(state, branch)
    console.log(`state file:    ${RENDER_STATE_PATH}`)
    console.log(`HEAD:          ${head.slice(0, 7)} (branch ${branch})`)
    console.log(`baseline:      ${String(cleared ?? '<none — bootstraps on first Stop>').slice(0, 7)}`)
    const { paths, base } = cleared ? changedRenderPaths(cleared, head) : { paths: [], base: cleared }
    console.log(`pending render paths: ${paths.length ? paths.join(', ') : '(none)'}`)
    const since = paths.length ? latestChangeAt(paths, head, base) : 0
    const openPoints = chargeablePoints(readTasksAll())
    const openRecords = unexplainedRuns(state.runs, since, {
      openPoints,
      incompleteClosures: state.incompleteClosures,
      crashClosures: state.crashClosures,
    })
    for (const b of BACKENDS) {
      const run = coveringRun(state.runs, b, since, { openPoints })
      const verdict = run ? runVerdict(run, { openPoints }) : null
      console.log(
        run
          ? `  ${b.padEnd(6)} covered by ${run.suite} at ${isoText(runStamp(run) ?? run.at)} ` +
              `(${
                verdict.status === 'accounted'
                  ? `ACCOUNTED FOR, not clean: exit ${run.exit}, ` +
                    verdict.charges.map((c) => `"${c.name}" → point ${c.point}`).join('; ')
                  : 'exit 0'
              }, asserted=${run.asserted === true}, level=${run.featureLevel ?? 'unrecorded'}, ` +
              `${run.screenshotCount ?? 0} screenshots)`
          : `  ${b.padEnd(6)} NOT covered since the last render edit`,
      )
      if (run) continue
      // THE STATUS LINE READS THE CLASSIFICATION THE GATE READS (review finding,
      // 28.08.2026, round 17). It used to call every unaccounted entry of the
      // last run an "unaccounted red" — the crash sentence and the
      // lost-recording sentence included, the two classes this point exists to
      // tell apart — and it consulted no signature, so a record already signed
      // off was still reported as an open red. Both readings now come from
      // `unexplainedRuns`, which is what actually blocks.
      const last = latestRun(state.runs, b, since)
      if (!last) continue
      const entry = openRecords.find((u) => u.id === runIdentity(last))
      if (!entry) continue
      for (const u of entry.unaccounted) {
        console.log(
          `         ${classOf(entry)} in the last ${last.suite} run: "${u.name}"` +
            (entry.status !== 'red'
              ? ''
              : u.point === null
                ? ' (charged to nothing)'
                : ` (point ${u.point} is not open)`),
        )
      }
    }
    // EVERY OPEN RECORD IS NAMED, not only the one standing behind an uncovered
    // backend (review finding, 28.08.2026, round 18). The per-backend line above
    // is skipped the moment a LATER run covers that backend — while `evaluate`
    // keeps blocking on the earlier record all the same, so the inspection said
    // "covered" about a gate that was shut. The reds and suspects are listed
    // here; the two record classes have their own sections below.
    for (const u of openRecords) {
      if (u.status !== 'red' && u.status !== 'suspect') continue
      console.log(
        `⚠ ${classOf(u)}: ${u.backend}/${u.suite} @${isoText(u.at)} (id ${u.id}) — ` +
          u.unaccounted.map((x) => `"${x.name}"${x.point === null ? '' : ` (point ${x.point} is not open)`}`).join('; '),
      )
    }
    // Broken RECORDINGS, listed apart from the reds (point 734): they are not
    // defects to hunt, they are runs whose evidence was truncated away.
    //
    // DELIBERATELY WINDOW-FREE (review finding, 28.08.2026, round 18, which read
    // it as staleness). `openIncompleteRuns` and `openCrashedRuns` ignore
    // `since` on purpose: point 734 says a record that has left the guard's
    // window has lost its BLOCKAGE and not its obligation, and the sign-off CLI
    // reads the same two functions — window-scoping them would make an older
    // record unsignable, which is the trap this point exists to end. What each
    // line owes the reader instead is whether it blocks right now, and that is
    // what `blocksNow` says.
    // WHETHER THE GATE IS ARMED AT ALL DECIDES WHETHER ANYTHING BLOCKS (review
    // finding, 28.08.2026, round 20). With no pending render path `since` is 0,
    // so every historical record enters the open list — and calling each of them
    // "BLOCKING NOW" while the gate has nothing to block was the opposite of the
    // truth. An active deferral at this HEAD says the same for the other reason.
    const deferred = Boolean(state.deferral && state.deferral.head === head)
    const armed = paths.length > 0 && !deferred
    const blockingIds = new Set(armed ? openRecords.map((u) => u.id) : [])
    const blocksNow = (r) => {
      if (blockingIds.has(runIdentity(r))) return 'BLOCKING NOW'
      // A RECORD WHOSE LOST MEASUREMENT WAS RETAKEN IS ANSWERED, not merely old
      // (round 19), and that is true of the record whatever the gate is doing —
      // so it is said before the gate's own two reasons.
      //
      // OF A TRUNCATION ONLY (review finding, 28.08.2026, round 21). A lost
      // MEASUREMENT is answered by taking it again; a CRASH is not, and the
      // guard says so everywhere else — "a re-run judges the picture but does
      // NOT remove this record". Reading the same sentence over a crashed record
      // contradicted the paragraph directly above it.
      const retaken = r?.crashed === true ? null : reRecordedBy(state, r, { openPoints })
      if (retaken) {
        return `already answered by the later covering ${retaken.suite} run @${isoText(runStamp(retaken) ?? retaken.at)} — signing it changes nothing`
      }
      if (deferred) return 'not blocking — an active deferral covers this HEAD'
      if (paths.length === 0) return 'not blocking — no render path is pending at this HEAD'
      return 'outside the current window — owed, not blocking'
    }
    const openIncomplete = openIncompleteRuns(state)
    for (const r of openIncomplete) {
      console.log(
        `⚠ INCOMPLETE RECORDING (not an unexplained red): ${r.backend}/${r.suite} ` +
          `@${isoText(runStamp(r) ?? r.at)} (id ${runIdentity(r)}, ${blocksNow(r)}) — ${droppedLinesOf(r)} result line(s) dropped by the ` +
          'capture cap. Re-run the suite, or sign it off: node scripts/render-verify-guard.mjs ' +
          `--incomplete "${r.backend}/${r.suite}" --evidence "<why>"`,
      )
    }
    for (const c of Array.isArray(state.incompleteClosures) ? state.incompleteClosures : []) {
      console.log(
        `(signed-off incomplete recording: ${c.backend}/${c.suite} @${isoText(c.at)} — "${c.evidence}")`,
      )
    }
    // Crashed runs, listed apart for the same reason (sixth round): there is no
    // defect to hunt in the crash itself and no red to charge — a run that died
    // judged no picture. Its way out is the fixed CAUSE or the signed closure;
    // a bare re-run is a judgment of the picture and leaves this record standing
    // (review finding, 28.08.2026, where the message said otherwise).
    for (const r of openCrashedRuns(state)) {
      console.log(
        `⚠ CRASHED RUN (not an unexplained red): ${r.backend}/${r.suite} @${isoText(runStamp(r) ?? r.at)} ` +
          `(id ${runIdentity(r)}, ${blocksNow(r)}) — the run died rather than reported. THE CRASH ITSELF carries no ` +
          'red anybody can own, so the three closings of point 640 cannot reach it — but a red the ' +
          'run PRINTED BEFORE it died was really observed and still closes those three ordinary ' +
          'ways (review finding, 28.08.2026, round 17: this line used to say nothing in the run ' +
          'could be explained or charged, which the sign-off message directly contradicts). A ' +
          're-run judges the picture but does NOT remove this record: fix the CAUSE (the render ' +
          'edit moves the window past it), or read its kept log (local/verify-logs/) and sign the ' +
          'CRASH off: node scripts/render-verify-guard.mjs ' +
          `--crashed "${r.backend}/${r.suite}" --evidence "<what the log shows>"`,
      )
    }
    for (const c of Array.isArray(state.crashClosures) ? state.crashClosures : []) {
      console.log(`(signed-off crashed run: ${c.backend}/${c.suite} @${isoText(c.at)} — "${c.evidence}")`)
    }
    if (state.deferral) console.log(`⚠ active deferral @${String(state.deferral.head).slice(0, 7)}: "${state.deferral.reason}"`)
    if (state.lastDeferral) console.log(`(last consumed deferral: "${state.lastDeferral.reason}")`)
    const runs = Array.isArray(state.runs) ? state.runs.slice(-8) : []
    console.log(`recent runs (${runs.length} of ${Array.isArray(state.runs) ? state.runs.length : 0}):`)
    for (const r of runs) {
      const v = runVerdict(r, { openPoints })
      console.log(
        `  ${isoText(runStamp(r) ?? r.at)}  ${String(r.backend).padEnd(6)} ` +
          `${String(r.suite).padEnd(14)} exit ${r.exit} asserted=${r.asserted === true} ` +
          `level=${r.featureLevel ?? '-'} shots=${r.screenshotCount ?? 0} ` +
          // THE RECORD'S OWN CLASS, not the raw verdict (review finding,
          // 28.08.2026, round 20): `runVerdict` answers `red` for a crashed
          // record, and printing that here contradicted the CRASHED RUN
          // paragraph three lines up in the same report.
          `${r.crashed === true && v.status === 'red' ? 'crashed' : v.status}` +
          `${v.charges.length ? ` (${v.charges.map((c) => `→${c.point}`).join(' ')})` : ''}`,
      )
    }
    process.exit(0)
  } catch (e) {
    console.error(`render-verify-guard status failed: ${e && e.message}`)
    process.exit(1)
  }
}

// Stop-hook mode.
if (isMainModule(import.meta.url)) {
  try {
    let sessionId = ''
    try {
      sessionId = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      /* no/non-JSON stdin (manual run) — the gate is global truth, not session-local */
    }

    let gathered
    try {
      gathered = gatherRenderVerifyInputs({ sessionId })
    } catch (e) {
      // ONLY an undiffable baseline re-baselines (see BaselineDiffError). Any
      // other gather failure — a transient git error, a throwing ownership probe
      // — falls through to the outer catch, which allows the stop and leaves the
      // state ALONE, so a pending gate survives to the next turn.
      if (!(e instanceof BaselineDiffError)) throw e
      console.error(`render-verify-guard: ${e.message} — re-baselining`)
      advanceBaseline(readRenderState() ?? {}, currentBranch(), git('git rev-parse HEAD'), {
        clearedAt: Date.now(),
        clearedBy: 'rebaseline',
      })
      process.exit(0)
    }

    // A non-owner session stands down; a gate without a baseline bootstraps at
    // the current HEAD (it audits work from now on, not history).
    if (!gathered.applicable) {
      if (gathered.head) {
        advanceBaseline(gathered.state, gathered.branch, gathered.head, {
          clearedAt: Date.now(),
          clearedBy: sessionId || 'bootstrap',
        })
      }
      process.exit(0)
    }

    const { head, branch, state, cleared } = gathered
    const result = evaluate(gathered.inputs)

    if (result.decision === 'block') {
      process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
      process.exit(0)
    }
    if (result.decision === 'defer') {
      // No baseline advance: the pending diff is the successor's durable inbox.
      process.stdout.write(JSON.stringify({ systemMessage: result.reason }))
      process.exit(0)
    }
    if (result.clear && head !== cleared) {
      const extra = { clearedAt: Date.now(), clearedBy: sessionId || 'stop-hook' }
      // An ACCOUNTED-FOR clearance is written as such and never as a clean pass
      // (point 550): the record keeps which red was charged to which point, and
      // the console says it out loud, because a run that is red for someone
      // else's reasons is an exception — a quiet one is how a gate becomes a
      // formality. `clearedVia` is set on EVERY clearance, so a stale
      // accounted-for entry can never linger behind a later clean one.
      const accounted = Array.isArray(result.accounted) ? result.accounted : []
      extra.clearedVia = accounted.length > 0 ? 'accounted-for' : 'clean'
      extra.accountedFor = accounted.length > 0 ? accounted : undefined
      for (const a of accounted) {
        console.error(
          `⚠ RENDER-VERIFY CLEARED ON ACCOUNTED-FOR REDS (${a.backend}, ${a.suite}): ` +
            a.charges.map((c) => `"${c.name}" → point ${c.point}`).join('; ') +
            '. This is NOT a clean pass — the picture was judged with those reds standing, ' +
            'each owned by an open point. Say so in any report.',
        )
      }
      if (result.deferred) {
        // Consume the deferral but keep it visible (status shows lastDeferral).
        extra.lastDeferral = state.deferral
        extra.deferral = undefined
        // WHAT THE DEFERRAL WAVED THROUGH (point 640): a deferral is the one way
        // past an unexplained red, so the reds it carried are written into the
        // record and said out loud. A bypass whose cost is invisible is one
        // nobody weighs.
        const waved = Array.isArray(result.waved) ? result.waved : []
        const wavedCount = Number.isInteger(result.wavedCount) ? result.wavedCount : waved.length
        if (wavedCount > 0) {
          // The COUNT is the real one even where the list is capped: a record
          // that showed the cap would understate what was waved.
          extra.lastDeferral = { ...state.deferral, waved, wavedCount }
          console.error(
            `⚠ RENDER-VERIFY DEFERRAL WAVED ${wavedCount} UNEXPLAINED RED(S)` +
              (wavedCount > waved.length ? ` (the first ${waved.length} named)` : '') +
              ': ' +
              waved.map((w) => `${w.backend}/${w.suite} (${w.status}) "${w.name}"`).join('; ') +
              '. The deferral REASON is now the only record of why — make it name the cause.',
          )
        }
      }
      advanceBaseline(state, branch, head, extra)
    }
    process.exit(0)
  } catch (e) {
    console.error(`render-verify-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
