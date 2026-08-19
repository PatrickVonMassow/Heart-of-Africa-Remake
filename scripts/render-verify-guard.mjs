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
// CLI:
//   node scripts/render-verify-guard.mjs status            # inspect the gate
//   node scripts/render-verify-guard.mjs --defer "<why>"   # loud escape valve
//   node scripts/render-verify-guard.mjs --clear "<why>"   # manual baseline advance
//   node scripts/render-verify-guard.mjs --incomplete "<backend>/<suite>" --evidence "<why>"
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
  droppedLinesOf,
  runStamp,
  runIdentity,
} from './render-verify-core.mjs'
import { readTasksAll } from './tasks-source.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'

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
      // The signed-off broken RECORDINGS (point 734) — not waivers: each names
      // one run by identity and clears no backend.
      incompleteClosures: state.incompleteClosures,
    },
  }
}

/** How many signed incomplete-recording closures the state keeps. The run window
 *  itself holds 40, so a closure older than that names a run nobody can see. */
const MAX_INCOMPLETE_CLOSURES = 40

/** A run's timestamp for a human, never throwing: `toISOString()` dies on a
 *  finite but out-of-range number, and these come off disk. */
export function isoText(at) {
  try {
    return new Date(Number(at)).toISOString()
  } catch {
    return `t=${String(at)}`
  }
}

/** The recorded runs whose EFFECTIVE verdict is `incomplete` and that are NOT
 *  yet signed off. Judged by runVerdict, not by the truncation marker alone
 *  (round-5 review, 19.08.2026): a run that truncated AND crashed stays `red`
 *  (a crash outranks everything) and one that truncated on a `--section` probe
 *  stays `partial` (it blocks nobody) — offering either a closure would let the
 *  CLI report a sign-off that lifts nothing. */
export function openIncompleteRuns(state) {
  const runs = Array.isArray(state?.runs) ? state.runs : []
  return runs.filter(
    (r) =>
      isIncompleteRecording(r) &&
      runVerdict(r).status === 'incomplete' &&
      !incompleteClosureFor(r, state?.incompleteClosures),
  )
}

/**
 * THE CLOSURE A `--incomplete` INVOCATION WOULD WRITE, or the reason it writes
 * none. Pure and exported so the CLI's whole judgment is testable without a
 * state file. The closure names its run by CONTENT identity (`runIdentity`),
 * never by a stamp: the stamp route let one signature close a second, different
 * run that happened to share a millisecond, and left a record with no readable
 * timestamp closable by nothing at all (round-5 review, 19.08.2026) — content
 * identifies both. `--at` and `--run` narrow the SELECTION; the written
 * signature always binds the one record's full content.
 *
 * @returns {{ closure: object } | { error: string, choices?: object[] }}
 *   `choices` is set only where the selector matched several open runs, so the
 *   caller can print each with its own --run. Total.
 */
export function incompleteClosureDraft(state, options) {
  const { selector = '', at = '', run = '', evidence = '' } = options ?? {}
  if (!String(evidence).trim()) {
    return {
      error:
        'render-verify-guard --incomplete: --evidence "<why this recording cannot be redone>" is required. ' +
        'The evidence is the whole difference between this and a silent waiver.',
    }
  }
  if (!String(selector).trim()) {
    return {
      error:
        'render-verify-guard --incomplete: name the run as "<backend>/<suite>" (add --at <iso|ms> or ' +
        '--run <id> when more than one is open). A closure names ONE run and can never pre-clear a ' +
        'future one.',
    }
  }
  const wanted = at ? new Date(/^\d+$/.test(at) ? Number(at) : at).getTime() : null
  if (at && !Number.isFinite(wanted)) {
    return { error: `render-verify-guard --incomplete: --at "${at}" is not a timestamp (ISO or epoch ms).` }
  }
  const wantedId = String(run).trim()
  const open = openIncompleteRuns(state).filter(
    (r) =>
      `${r.backend}/${r.suite}` === selector &&
      (wanted === null || runStamp(r) === wanted) &&
      (wantedId === '' || runIdentity(r) === wantedId),
  )
  if (open.length === 0) {
    return {
      error:
        `render-verify-guard --incomplete: no OPEN incomplete recording matches "${selector}"` +
        `${at ? ` at ${at}` : ''}${wantedId ? ` with id ${wantedId}` : ''}. Run ` +
        '`node scripts/render-verify-guard.mjs status` to see which runs are truncated.',
    }
  }
  // Several matches that are one and the same CONTENT are one identity — sign
  // it once. Distinct contents are distinct judgments: refuse, and offer each
  // by the id that separates them even where their stamps cannot.
  const distinct = new Set(open.map((r) => runIdentity(r)))
  if (distinct.size > 1) {
    return {
      error:
        `render-verify-guard --incomplete: "${selector}" matches ${open.length} open incomplete recordings. ` +
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
      droppedLines: droppedLinesOf(run_),
      evidence: String(evidence),
      closedAt: Date.now(),
    },
  }
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
//
// A run whose result lines the capture cap truncated cannot be closed by any of
// point 640's three ways — they all need to know WHAT the red was, and such a
// run never recorded it. Before this, its only exit was a hand-written --defer,
// i.e. the waiver the charge ledger exists to abolish. This signs the RECORDING
// off as broken instead — and only that: the reds the run DID record keep
// blocking and close the ordinary ways, it clears NO backend, and it names
// exactly ONE run, so two truncated runs need two signatures with two reasons.
// Ambiguity is REFUSED rather than resolved (review finding, 19.08.2026): a
// selector matching several open runs prints each with its own --at, and a
// record whose timestamp is unreadable is refused as well — a signature that can
// name no run closes none, and saying so beats reporting a success that binds
// nothing. The judgment itself is incompleteClosureDraft above, so it is
// testable without a state file.
if (arg === '--incomplete') {
  try {
    const rest = process.argv.slice(3)
    const valueOf = (flag) => {
      const i = rest.indexOf(flag)
      return i === -1 ? '' : String(rest[i + 1] ?? '').trim()
    }
    const consumed = new Set()
    for (const flag of ['--evidence', '--at', '--run']) {
      const i = rest.indexOf(flag)
      if (i !== -1) consumed.add(i).add(i + 1)
    }
    const evidence = valueOf('--evidence')
    const at = valueOf('--at')
    const runSel = valueOf('--run')
    // Positional selector = the first argument that is neither a flag nor a
    // value another flag consumed, found by INDEX: comparing by value would drop
    // the selector whenever an evidence text happened to read the same.
    const selector = rest.find((a, i) => !consumed.has(i) && !a.startsWith('--')) ?? ''
    const state = readRenderState() ?? {}
    const draft = incompleteClosureDraft(state, { selector, at, run: runSel, evidence })
    if (draft.error) {
      console.error(draft.error)
      for (const r of draft.choices ?? []) {
        console.error(
          `  --run ${runIdentity(r)}   (@${isoText(runStamp(r) ?? r.at)}, ${droppedLinesOf(r)} line(s) dropped)`,
        )
      }
      process.exit(1)
    }
    const { closure } = draft
    const closures = (Array.isArray(state.incompleteClosures) ? state.incompleteClosures : []).concat([closure])
    while (closures.length > MAX_INCOMPLETE_CLOSURES) closures.shift()
    mergeRenderState({ incompleteClosures: closures })
    console.log(
      `⚠ INCOMPLETE RECORDING SIGNED OFF: ${closure.backend}/${closure.suite} @${isoText(closure.at)} ` +
        `(${closure.droppedLines} result line(s) dropped) — "${closure.evidence}". This closes the RECORD, not the ` +
        'picture: the run still covers no backend and is never a pass, and every red it DID record still ' +
        'blocks until it is fixed, charged or filed. Re-run the suite at the first chance.',
    )
    process.exit(0)
  } catch (e) {
    console.error(`render-verify-guard --incomplete failed: ${e && e.message}`)
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
if (arg === 'status') {
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
    for (const b of BACKENDS) {
      const run = coveringRun(state.runs, b, since, { openPoints })
      const verdict = run ? runVerdict(run, { openPoints }) : null
      console.log(
        run
          ? `  ${b.padEnd(6)} covered by ${run.suite} at ${new Date(run.at).toISOString()} ` +
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
      const last = latestRun(state.runs, b, since)
      const why = last ? runVerdict(last, { openPoints }) : null
      for (const u of why?.unaccounted ?? []) {
        console.log(
          `         unaccounted red in the last ${last.suite} run: "${u.name}"` +
            (u.point === null ? ' (charged to nothing)' : ` (point ${u.point} is not open)`),
        )
      }
    }
    // Broken RECORDINGS, listed apart from the reds (point 734): they are not
    // defects to hunt, they are runs whose evidence was truncated away.
    const openIncomplete = openIncompleteRuns(state)
    for (const r of openIncomplete) {
      console.log(
        `⚠ INCOMPLETE RECORDING (not an unexplained red): ${r.backend}/${r.suite} ` +
          `@${isoText(r.at)} (id ${runIdentity(r)}) — ${droppedLinesOf(r)} result line(s) dropped by the ` +
          'capture cap. Re-run the suite, or sign it off: node scripts/render-verify-guard.mjs ' +
          `--incomplete "${r.backend}/${r.suite}" --evidence "<why>"`,
      )
    }
    for (const c of Array.isArray(state.incompleteClosures) ? state.incompleteClosures : []) {
      console.log(
        `(signed-off incomplete recording: ${c.backend}/${c.suite} @${isoText(c.at)} — "${c.evidence}")`,
      )
    }
    if (state.deferral) console.log(`⚠ active deferral @${String(state.deferral.head).slice(0, 7)}: "${state.deferral.reason}"`)
    if (state.lastDeferral) console.log(`(last consumed deferral: "${state.lastDeferral.reason}")`)
    const runs = Array.isArray(state.runs) ? state.runs.slice(-8) : []
    console.log(`recent runs (${runs.length} of ${Array.isArray(state.runs) ? state.runs.length : 0}):`)
    for (const r of runs) {
      const v = runVerdict(r, { openPoints })
      console.log(
        `  ${new Date(Number(r.at ?? 0)).toISOString()}  ${String(r.backend).padEnd(6)} ` +
          `${String(r.suite).padEnd(14)} exit ${r.exit} asserted=${r.asserted === true} ` +
          `level=${r.featureLevel ?? '-'} shots=${r.screenshotCount ?? 0} ` +
          `${v.status}${v.charges.length ? ` (${v.charges.map((c) => `→${c.point}`).join(' ')})` : ''}`,
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
