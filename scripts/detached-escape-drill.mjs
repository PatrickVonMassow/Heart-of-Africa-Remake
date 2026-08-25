#!/usr/bin/env node
// WHY A CHILD DIES WITH THE SESSION THAT SPAWNED IT — measured, not argued.
//
// The authoring lane of 21.08.2026 died with its parent session and took ~1.5 h
// and a run's whole token spend with it. `scripts/author-sol.mjs` spawns codex
// `detached`, so the obvious explanation — the group signal reached it — is
// wrong, and a design built on that explanation would keep the defect.
//
// This drill settles it by running both shapes against the same kill:
//
//   pipes  stdio: ['ignore', 'pipe', 'pipe']  — today's lane
//   files  stdio: ['ignore', fd, fd] + unref  — the launcher's shape
//
// Both children are `detached` group leaders. The parent runs in its OWN
// session (setsid) and its whole process group is SIGKILLed, which is how a
// dying session takes its children. The child writes to stdout while it works,
// exactly as codex does, and keeps an independent file heartbeat so the drill
// can see how far it got after the kill.
//
// The observer is this process, and it is deliberately OUTSIDE the killed
// group: a harness inside the blast radius cannot report on survivors.
//
// Measured 22.08.2026 on the project's Linux container: pipes → the child died
// two beats after the kill with EPIPE; files → the child was still beating,
// reparented to pid 1. That is the whole cause, and it is why the daemon takes
// file descriptors rather than pipes (docs/handover-architecture.md, mechanism 1).
import { spawn } from 'node:child_process'
import { mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isMainModule } from './is-main.mjs'

/** The two shapes this drill compares, by the only field that differs. */
export const SHAPES = ['pipes', 'files']

/** The heartbeat period the fixture worker writes at. */
export const BEAT_MS = 200

/** The longest silence a working lane may show, in beat periods. */
export const MAX_GAP_BEATS = 3

/** Below this many beats before the kill there is no baseline to calibrate on. */
export const MIN_BASELINE_BEATS = 5

/**
 * Linux process states, split into living and dead.
 *
 * `Z` is not the only dead one: `X` and `x` are the exit states, and a table
 * entry in any of them is a corpse. Everything not named here is UNKNOWN and
 * reads as dead, because a liveness probe that guesses in the optimistic
 * direction is what produces a green run over a dead lane.
 */
export const LIVE_STATES = new Set(['R', 'S', 'D', 'T', 't', 'I', 'W', 'K', 'P'])
export const DEAD_STATES = new Set(['Z', 'X', 'x'])

/**
 * What a run's evidence MEANS — the pure half, so the reading is testable
 * without spawning anything.
 *
 * IT READS THE BEAT TIMESTAMPS, NOT A COUNT. Two earlier versions were broken
 * by a cross-vendor reading on exactly this: the first called any single
 * increase "still working", and the second let a worker produce its quota and
 * then hang for the last second of the window. A count cannot see a gap. So the
 * measure is the largest SILENCE between consecutive beats, and the silence
 * between the last beat and the end of the window — a lane that stops working
 * anywhere inside the window fails, wherever it stops.
 *
 * `alive` is a LIVENESS verdict, not a `kill(pid, 0)` result: that call answers
 * true for a corpse still in the process table. The caller resolves it; see
 * `probeAlive`.
 */
export function readOutcome({
  shape,
  alive,
  unknownLiveness = false,
  beatsBefore = 0,
  beatTimes = [],
  startedObserving = null,
  killedAt = 0,
  observedUntil = 0,
  lastLine = '',
} = {}) {
  const all = beatTimes.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  const after = all.filter((t) => t > killedAt)
  const before = all.filter((t) => t <= killedAt)
  // THE TOLERANCE IS CALIBRATED BY THE RUN ITSELF. A fixed 600 ms was a guess
  // about a loaded host, and a healthy worker starved by the scheduler for
  // longer would have made the drill lie in the other direction. So the same
  // worker's OWN jitter before the kill sets the bar: twice its worst pre-kill
  // pause, never below the three-period floor.
  const gapsIn = (marks) => marks.slice(1).map((t, i) => t - marks[i])
  // THE PRE-KILL WINDOW'S EDGES COUNT TOO. Measuring only the gaps BETWEEN beats
  // missed a host that produced its first beat late or fell silent just before
  // the kill — the two shapes of starvation most likely to matter.
  // `t > 0` here dropped an observation start stamped at 0 and silently removed
  // the leading edge — the same shape of bug the marks list had. Absent means
  // null, never zero.
  const preMarks = [startedObserving, ...before, killedAt].filter((t) => t !== null && Number.isFinite(t))
  const jitter = preMarks.length > 1 ? Math.max(0, ...gapsIn(preMarks)) : 0
  const limit = Math.max(BEAT_MS * MAX_GAP_BEATS, jitter * 2)
  // The first gap is measured from the KILL, so a worker that goes quiet at the
  // moment its parent dies and only resumes later cannot hide in the average.
  // Every mark, including a kill stamped at 0: filtering on truthiness dropped
  // it and silently disabled the first-gap rule — caught by the late-start case.
  const marks = [killedAt, ...after, observedUntil].filter((t) => Number.isFinite(t))
  let maxGap = 0
  for (let i = 1; i < marks.length; i += 1) maxGap = Math.max(maxGap, marks[i] - marks[i - 1])
  const gained = after.length
  const progressed = gained > 0 && maxGap <= limit
  // A HOST TOO LOADED TO MEASURE IS NOT A RESULT. If the worker could not hold
  // its beat even BEFORE the kill, this run says nothing about what the kill did
  // — and a settling window that produced almost no beats at all is the same
  // condition, not a clean baseline. `before.length > 1` alone let exactly that
  // case through and green afterwards.
  const enoughBaseline = before.length >= MIN_BASELINE_BEATS
  const unmeasurable = !enoughBaseline || jitter > BEAT_MS * MAX_GAP_BEATS
  // A DEATH IS A DEFINITE RESULT WHATEVER THE HOST WAS DOING. Only a POSITIVE
  // verdict needs a baseline, so an unmeasurable window blocks "escaped" and
  // never overrides "died" — the reading of a corpse does not depend on jitter.
  const dead = !alive && !unknownLiveness
  // DEATH AND ITS CAUSE ARE SEPARATE FACTS. The worker's own uncaughtException
  // handler records what killed it before rethrowing; only that recorded EPIPE
  // ties the death to the pipe. A pipes worker dead of anything else — OOM, a
  // crash, an operator — is a death this run cannot attribute, and `verdict`
  // must not build "the pipe is the binding" on it.
  const pipeCause = dead && /EPIPE/i.test(lastLine)
  const escaped = Boolean(alive) && progressed && !unmeasurable && !unknownLiveness
  // ONE PRECEDENCE, NOT TWO. The reason used to encode the same order as the
  // command's labelling, independently, so the two could drift apart — and had
  // already produced a run whose label and reason disagreed. The label is chosen
  // first, here, and the reason is chosen BY it.
  const label = labelFor({ escaped, dead, unknownLiveness, unmeasurable })
  const why =
    label === 'ESCAPED'
      ? 'still running and still working after the kill'
      : label === 'DIED'
        ? /EPIPE/i.test(lastLine)
          ? 'died writing to a pipe whose reader went with the parent'
          : 'died with the parent, cause not recorded in its own log'
        : label === 'UNKNOWN'
          ? 'liveness could not be established, and an unreadable probe is not a survivor'
          : label === 'INCONCLUSIVE'
            ? enoughBaseline
              ? `the host could not hold the beat before the kill either (${jitter} ms of jitter) — this run measures nothing`
              : `only ${before.length} beat(s) before the kill, too few for a baseline — this run measures nothing`
            : gained === 0
              ? 'still running but never beat again — a survivor that stopped is not a lane'
              : `still running but silent for ${maxGap} ms inside the window, over the ${limit} ms a working lane may pause`
  return {
    label,
    shape,
    escaped,
    progressed,
    dead,
    pipeCause,
    unknownLiveness: Boolean(unknownLiveness),
    unmeasurable,
    alive: Boolean(alive),
    beatsBefore,
    beatsAfter: beatsBefore + gained,
    gained,
    maxGap,
    limit,
    jitter,
    why,
  }
}

/**
 * ONE LABELLING RULE, shared by the reading and the printing.
 *
 * The CLI used to infer its own label and disagreed with `why`: a run that was
 * both unreadable and badly baselined printed INCONCLUSIVE beside a reason that
 * said liveness was unknown. The precedence lives here now, once.
 */
export function labelFor(outcome = {}) {
  if (outcome.escaped) return 'ESCAPED'
  if (outcome.dead) return 'DIED'
  if (outcome.unknownLiveness) return 'UNKNOWN'
  if (outcome.unmeasurable) return 'INCONCLUSIVE'
  return 'STALLED'
}

/** The verdict over both shapes: the drill proves its point only if they DIFFER. */
export function verdict(outcomes) {
  const by = Object.fromEntries(outcomes.map((o) => [o.shape, o]))
  const pipes = by.pipes
  const files = by.files
  // AFFIRMATIVE ON BOTH SIDES, boolean, never undefined. The claim is "the
  // pipe is the binding", and that needs the pipes worker PROVEN DEAD — not
  // merely "not escaped": UNKNOWN, INCONCLUSIVE and a stalled-but-alive
  // survivor all fail `escaped` while proving nothing about the cause, and
  // reading any of them as the dead half would turn an unreadable probe
  // beside an escaped files worker into a passed drill.
  //
  // AND PROVEN DEAD OF THE PIPE: the worker records the exception that killed
  // it before rethrowing, so a death the pipe caused carries EPIPE in its own
  // log. A pipes worker dead of an unrelated cause beside an escaped files
  // worker is a difference this run cannot attribute to stdio — readOutcome
  // itself says "cause not recorded" — and attributing it anyway is exactly
  // the guessed explanation this drill exists to replace.
  const ok = Boolean(pipes && files && pipes.dead === true && pipes.pipeCause === true && files.escaped === true)
  return {
    ok,
    // A drill in which both shapes survive proves NOTHING about the cause, and
    // saying so is the difference between evidence and a green light.
    note: ok
      ? 'the pipe is the binding: same detachment, opposite outcome'
      : pipes?.dead === true && pipes?.pipeCause !== true && files?.escaped === true
        ? 'inconclusive — the pipes worker died without recording EPIPE, so this death cannot be attributed to the pipe'
        : 'inconclusive — both shapes behaved alike, so this run identifies no cause',
    outcomes,
  }
}

// THE WORKER DOES NOT DECIDE ITS OWN FATE. An earlier version installed an
// uncaughtException handler that exited on EPIPE, so the drill measured a policy
// it had written itself. The handler now only RECORDS the cause and rethrows, so
// what ends the process is the runtime's own default — which is what a real
// authoring tool is subject to, and which we do not control.
const WORKER = `
import { openSync, writeSync } from 'node:fs'
const fd = openSync(process.argv[2], 'a')
process.on('uncaughtException', (e) => {
  writeSync(fd, 'raised: ' + (e.code ?? e.message) + '\\n')
  throw e
})
setInterval(() => {
  process.stdout.write('work ' + Date.now() + '\\n')
  writeSync(fd, 'beat ' + Date.now() + '\\n')
}, 200)
`

const PARENT = `
import { spawn } from 'node:child_process'
import { openSync } from 'node:fs'
const [, , worker, beat, log, shape] = process.argv
const out = shape === 'files' ? openSync(log, 'a') : null
const child = spawn(process.execPath, [worker, beat], {
  detached: true,
  windowsHide: true,
  stdio: shape === 'files' ? ['ignore', out, out] : ['ignore', 'pipe', 'pipe'],
})
// UNREF IN BOTH SHAPES. It was files-only once, and the cross-vendor reading was
// right that this made the comparison prove nothing: two variables moved at the
// same time. stdio is now the single difference between the two runs.
child.unref()
if (shape !== 'files') { child.stdout.on('data', () => {}); child.stderr.on('data', () => {}) }
// THE IDENTITY IS RECORDED HERE, by the process that just created the child, in
// the same tick. Reading it from the drill after the fact left a window in which
// the worker could exit and its number be reused before the read — and the drill
// would then have adopted the replacement as the spawned identity.
import { readFileSync as rf } from 'node:fs'
let ticks = 0
try {
  const stat = rf('/proc/' + child.pid + '/stat', 'utf8')
  const rest = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\\s+/)
  ticks = Number(rest[19]) || 0
} catch (e) { console.error('identity read failed: ' + (e && e.code ? e.code : e)) }
console.log(String(child.pid) + ' ' + String(ticks))
await new Promise(() => {})
`

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** A short SYNCHRONOUS pause, so the reap check can be a plain function while
 *  still giving an asynchronously delivered signal time to take effect. */
const sleepBriefly = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
/**
 * IS THAT PID A LIVE PROCESS, and not a corpse still in the table?
 *
 * `kill(pid, 0)` answers true for a ZOMBIE — an exited child whose parent has
 * not reaped it — which is exactly the state a killed worker can be left in.
 * On Linux the truth is one field of /proc/<pid>/stat, and the drill reads it.
 * Where that file does not exist the signal probe is all there is, and the
 * limitation travels with the answer rather than being silently assumed away.
 */
export function probeAlive(pid, { startedAt = 0, requireIdentity = false, readProc = defaultReadProc, signal = defaultSignal } = {}) {
  // AN UNOBSERVED WORKER IS NEVER A CORPSE. Without a captured pid there is
  // nothing to probe, and a bare `alive: false` here would flow through
  // `readOutcome` into `dead: true` — a DEFINITE death verdict for a process
  // this drill never even identified, and one half of a passed drill. Marked
  // UNKNOWN instead, which blocks every verdict. (pid 0 and negatives are the
  // same case: 0 is what a failed capture leaves behind, and `kill(0, …)`
  // would probe the caller's own group.)
  if (!Number.isFinite(pid) || pid <= 0) return { alive: false, unknown: true, how: 'UNKNOWN — no pid was captured, nothing was ever observed' }
  const stat = readProc(pid)
  if (stat != null) {
    // A BARE PID IS NOT AN IDENTITY. Between the kill and the probe the number
    // can belong to something else entirely, and an unrelated process would
    // satisfy the liveness half of the verdict. Field 22 of /proc/<pid>/stat is
    // the start time in clock ticks; captured after the spawn and compared here,
    // it tells the worker apart from its successor at the same number.
    const now = startTicksOf(stat)
    if (requireIdentity && !startedAt) {
      // A FAILED CAPTURE IS NOT A PASS. `startedAt && now && …` silently turned
      // recycling detection OFF whenever the spawn-time read had failed, which
      // is exactly when a recycled pid is most likely to slip through.
      return { alive: false, unknown: true, how: 'UNKNOWN — no spawn-time identity was captured for this pid' }
    }
    if (startedAt && !now) {
      return { alive: false, unknown: true, how: `UNKNOWN — /proc gave no start time for pid ${pid}` }
    }
    if (startedAt && now !== startedAt) {
      return { alive: false, how: `pid ${pid} was recycled — start ${now} is not the ${startedAt} we spawned` }
    }
    // The state letter is the field after the ")" that closes the comm field —
    // parsed from the right, because a process name may itself contain ")".
    const state = stat.slice(stat.lastIndexOf(')') + 1).trim().charAt(0)
    if (DEAD_STATES.has(state)) return { alive: false, how: `dead in /proc (state ${state})` }
    if (LIVE_STATES.has(state)) return { alive: true, how: `/proc state ${state}` }
    // FAIL CLOSED on a letter this list does not know. A probe that guesses
    // "alive" for an unrecognised state is the one that greens a dead lane.
    // UNKNOWN, and marked as such: reporting only `alive: false` let `reap` fall
    // through to silence for a state it HAD observed and could not classify,
    // which contradicts its own contract. The unreadable case and the
    // unrecognised case are both uncertainty; only the vanished stranger is
    // invisible.
    return { alive: false, unknown: true, how: `unrecognised /proc state ${state || '(none)'} — read as dead` }
  }
  // FAIL CLOSED WHERE /proc CANNOT BE READ. The signal probe answers true for a
  // corpse, and `verdict` consumes only the boolean — so a transient read failure
  // would have greened a dead lane. A drill that cannot see the truth reports
  // that it cannot, and `signal` is kept only to distinguish "gone" from
  // "unreadable" in the explanation.
  // ONLY ESRCH ESTABLISHES "GONE". A pid that exists but refuses the signal, or
  // an error we cannot classify, leaves the question open — and open is not an
  // escape. Only a pid nothing answers for is reported dead outright.
  //
  // "GONE" NEEDS NO SPAWN-TIME IDENTITY, deliberately — the requirement is
  // one-directional. Identity exists to stop a LIVE stranger at a recycled
  // number being read as the live worker; it can never rescue a death verdict,
  // because every way a captured pid ends up absent entails the spawned
  // process exited: either it was still that process (now dead), or the number
  // was recycled — which itself requires the original to have exited first.
  // So ESRCH at a captured pid is definite death with or without `startedAt`,
  // while "alive" without identity stays UNKNOWN above.
  const state = signal(pid)
  if (state === 'gone') return { alive: false, how: 'no such process' }
  return {
    alive: false,
    unknown: true,
    how:
      state === 'exists'
        ? 'UNKNOWN — /proc unreadable and a signal probe cannot tell a corpse apart'
        : 'UNKNOWN — /proc unreadable and the signal probe failed for an unclassified reason',
  }
}

/** Field 22 of /proc/<pid>/stat — start time in clock ticks since boot. The
 *  fields are counted AFTER the comm field, because a process name may contain
 *  spaces and parentheses; field 3 (state) is the first one after it. */
export function startTicksOf(stat) {
  const rest = String(stat ?? '').slice(String(stat ?? '').lastIndexOf(')') + 1).trim().split(/\s+/)
  // rest[0] is field 3 (state), so field 22 is rest[19].
  const ticks = Number(rest[19])
  return Number.isFinite(ticks) ? ticks : 0
}

const defaultReadProc = (pid) => {
  try {
    return readFileSync(`/proc/${pid}/stat`, 'utf8')
  } catch {
    return null
  }
}
/**
 * Tri-state, because `catch { return false }` reads EPERM as "gone".
 *
 * Only `ESRCH` establishes that no such process exists. `EPERM` means the
 * opposite — there IS one, we merely may not signal it — and any other error is
 * undecided. A drill that folds all three into false would report a live
 * foreign process as gone.
 */
export function signalState(pid, kill = (p) => process.kill(p, 0)) {
  try {
    kill(pid)
    return 'exists'
  } catch (err) {
    if (err?.code === 'ESRCH') return 'gone'
    if (err?.code === 'EPERM') return 'exists'
    return 'unknown'
  }
}

const defaultSignal = signalState

/** Run ONE shape end to end and return its evidence. */
async function runShape(dir, shape, { settleMs = 2000, observeMs = 3000 } = {}) {
  const beat = join(dir, `beat-${shape}.log`)
  const log = join(dir, `parent-${shape}.log`)
  writeFileSync(beat, '')
  writeFileSync(log, '')
  const startFd = openSync(join(dir, `start-${shape}.log`), 'a')
  // THE PARENT IS ITS OWN GROUP LEADER (`detached`), so killing that group is a
  // signal this drill process never receives — the observer stays outside the
  // blast radius. An earlier version wrapped the parent in `setsid`, which
  // silently defeated the drill: `setsid(2)` fails for a process that is already
  // a group leader, so util-linux forks, the real parent lands in a THIRD group,
  // and the kill hit an empty wrapper. Both shapes then "escaped" and the run
  // proved nothing — which is what the inconclusive verdict below is for.
  const parent = spawn(process.execPath, [join(dir, 'parent.mjs'), join(dir, 'worker.mjs'), beat, log, shape], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', startFd, startFd],
  })
  parent.unref()
  // The parent writes "<pid> <startTicks>" as one line, taken in the tick it
  // spawned the child, so the identity cannot belong to a replacement.
  let pid = 0
  let startedAt = 0
  for (let tries = 0; tries < 100 && !pid; tries += 1) {
    const line = readFileSync(join(dir, `start-${shape}.log`), 'utf8').trim().split('\n')[0] ?? ''
    const [seenPid, seenTicks] = line.split(/\s+/).map(Number)
    if (Number.isFinite(seenPid) && seenPid > 0) {
      pid = seenPid
      startedAt = Number.isFinite(seenTicks) ? seenTicks : 0
    }
    if (!pid) await sleep(20)
  }
  const startedObserving = Date.now()
  await sleep(settleMs)
  const lines = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean)
  const beatsBefore = lines(beat).length
  let killedAt = 0
  try {
    process.kill(-parent.pid, 'SIGKILL')
  } catch {
    /* already gone */
  } finally {
    killedAt = Date.now()
  }
  await sleep(observeMs)
  const after = lines(beat)
  const observedUntil = Date.now()
  const beatTimes = after.filter((l) => l.startsWith('beat ')).map((l) => Number(l.slice('beat '.length)))
  const live = probeAlive(pid, { startedAt, requireIdentity: true })
  const outcome = readOutcome({
    shape,
    alive: live.alive,
    unknownLiveness: Boolean(live.unknown),
    beatsBefore,
    beatTimes,
    startedObserving,
    killedAt,
    observedUntil,
    lastLine: after.at(-1) ?? '',
  })
  // CLEANUP MAY ONLY KILL WHAT THIS DRILL SPAWNED. `Number.isFinite(pid)` was
  // true for the zero this function starts with, and `process.kill(0, …)`
  // signals the CALLER'S OWN PROCESS GROUP — the batch session running the
  // drill. And even a real pid may have been recycled by now, in which case the
  // signal would hit a stranger. So the identity is re-checked at the moment of
  // the kill, and anything it cannot vouch for is left alone and reported.
  outcome.leftAlone = reap(pid, startedAt)
  // The capture itself is evidence: a run whose pid or spawn-time identity was
  // never read is one probeAlive answered UNKNOWN for, and the integration
  // test asserts the capture rather than trusting the label alone.
  outcome.pid = pid
  outcome.identityCaptured = startedAt > 0
  return outcome
}

/**
 * KILL ONLY WHAT THIS DRILL SPAWNED, AND SAY SO WHEN IT CANNOT.
 *
 * WHAT THE RETURN VALUE MEANS, exactly, because the first contract was false.
 * A SENTENCE is anything this function could observe and wants on the record:
 * it refused to signal, the signal failed, the process is still running, its
 * state could not be read, or its identity changed under the signal. UNDEFINED
 * means only "nothing left to report" — the worker was gone, or it disappeared
 * after being signalled. It is NOT a proof that the process this drill spawned
 * is the one that died: the vanished-stranger case below is indistinguishable
 * from a clean reap and also returns undefined. That is residual 4 in
 * docs/handover-architecture.md, and it is why the architecture no longer says
 * this function reports every cleanup it cannot establish.
 *
 * Two hazards, treated differently because only one of them can be prevented:
 *
 * PREVENTABLE — a pid of 0 or 1, or a number whose identity does not match the
 * one captured at spawn. `Number.isFinite(0)` is true and `process.kill(0, …)`
 * signals the CALLER'S OWN PROCESS GROUP, which here is the batch session; a
 * mismatched identity is a stranger. Neither is ever signalled.
 *
 * NOT PREVENTABLE — the interval between reading /proc and sending the signal.
 * The worker can exit and its number be reused inside it, and Node exposes no
 * pidfd to close that. It is detected where it CAN be: the identity is read
 * again after the signal and a change is reported. Where the stranger vanishes
 * before that read, the answer is indistinguishable from a clean reap, so the
 * detection is best-effort and is recorded as such rather than promised.
 */
export function reap(
  pid,
  startedAt,
  { probe = probeAlive, kill = process.kill.bind(process), attempts = 5, settle = sleepBriefly } = {},
) {
  if (!(pid > 1)) return `no worker pid was captured, so nothing was signalled`
  const before = probe(pid, { startedAt, requireIdentity: true })
  // A worker that is simply GONE is the expected end of one of the two shapes,
  // not a refusal to clean up — there is nothing left to signal.
  if (/no such process/.test(before.how ?? '')) return undefined
  if (!before.alive) return `pid ${pid} not reaped: ${before.how}`
  try {
    kill(pid, 'SIGKILL')
  } catch (err) {
    // NOT EVERY FAILURE IS A CLEAN EXIT. Swallowing all of them reported EPERM
    // and unclassified errors as successful cleanup, so a worker this drill left
    // running looked reaped. Only ESRCH means it went away by itself.
    if (err?.code === 'ESRCH') return undefined
    return `pid ${pid} was NOT signalled: ${err?.code ?? err}`
  }
  // ONLY AN IDENTITY CHANGE IS REPORTED. A process still running an instant after
  // SIGKILL is ordinary — signal delivery is asynchronous — and reporting that as
  // a recycled pid was a false alarm on every healthy run.
  // SIGNAL DELIVERY IS ASYNCHRONOUS, so one read proves nothing about a process
  // that is still there. It is re-read a bounded number of times, and whatever
  // is still true at the end is REPORTED — silence used to cover both a live
  // survivor and an unreadable probe, which is the opposite of what residual 4
  // claims for this function.
  let after = probe(pid, { startedAt, requireIdentity: true })
  for (let tries = 1; tries < attempts && (after.alive || after.unknown); tries += 1) {
    settle()
    after = probe(pid, { startedAt, requireIdentity: true })
  }
  if (/recycled/.test(after.how ?? '')) {
    return `pid ${pid} was recycled between the check and the signal: ${after.how}`
  }
  if (after.alive) return `pid ${pid} was signalled but is still running: ${after.how}`
  if (after.unknown) return `pid ${pid} was signalled but its state could not be read: ${after.how}`
  // AND THE BRANCH NOTHING HERE CAN SEE: if the original exited, its number was
  // reused, the stranger was signalled and the stranger then vanished, this
  // answers exactly what a clean reap answers. Residual 4 records that.
  return undefined
}

export async function runDrill(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-escape-'))
  try {
    writeFileSync(join(dir, 'worker.mjs'), WORKER)
    writeFileSync(join(dir, 'parent.mjs'), PARENT)
    const outcomes = []
    for (const shape of SHAPES) outcomes.push(await runShape(dir, shape, opts))
    return verdict(outcomes)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

if (isMainModule(import.meta.url)) {
  const result = await runDrill()
  for (const o of result.outcomes) {
    // FIVE OUTCOMES, NOT TWO, and the same precedence the reading used.
    console.log(`${o.shape}: ${labelFor(o)} — ${o.why} (beats ${o.beatsBefore} → ${o.beatsAfter})`)
    if (o.leftAlone) console.log(`  ${o.leftAlone}`)
  }
  console.log(result.ok ? `VERDICT: ${result.note}` : `VERDICT: ${result.note}`)
  process.exit(result.ok ? 0 : 1)
}
