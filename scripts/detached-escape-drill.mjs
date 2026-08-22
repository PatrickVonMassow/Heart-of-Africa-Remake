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
  const jitter = Math.max(0, ...gapsIn(before))
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
  // its beat even BEFORE the kill, this run says nothing about what the kill did.
  const unmeasurable = before.length > 1 && jitter > BEAT_MS * MAX_GAP_BEATS
  const escaped = Boolean(alive) && progressed && !unmeasurable && !unknownLiveness
  const why = escaped
    ? 'still running and still working after the kill'
    : unmeasurable
      ? `the host could not hold the beat before the kill either (${jitter} ms of jitter) — this run measures nothing`
      : unknownLiveness
        ? 'liveness could not be established, and an unreadable probe is not a survivor'
        : !alive && /EPIPE/i.test(lastLine)
          ? 'died writing to a pipe whose reader went with the parent'
          : !alive
            ? 'died with the parent, cause not recorded in its own log'
            : gained === 0
              ? 'still running but never beat again — a survivor that stopped is not a lane'
              : `still running but silent for ${maxGap} ms inside the window, over the ${limit} ms a working lane may pause`
  return {
    shape,
    escaped,
    progressed,
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

/** The verdict over both shapes: the drill proves its point only if they DIFFER. */
export function verdict(outcomes) {
  const by = Object.fromEntries(outcomes.map((o) => [o.shape, o]))
  const pipes = by.pipes
  const files = by.files
  // Boolean, never undefined: a run missing a shape must READ as a refusal, and
  // `pipes && …` would hand a caller `undefined` for the one case where the
  // drill has the least to say.
  const ok = Boolean(pipes && files && !pipes.escaped && files.escaped)
  return {
    ok,
    // A drill in which both shapes survive proves NOTHING about the cause, and
    // saying so is the difference between evidence and a green light.
    note: ok
      ? 'the pipe is the binding: same detachment, opposite outcome'
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
console.log(String(child.pid))
await new Promise(() => {})
`

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
/**
 * IS THAT PID A LIVE PROCESS, and not a corpse still in the table?
 *
 * `kill(pid, 0)` answers true for a ZOMBIE — an exited child whose parent has
 * not reaped it — which is exactly the state a killed worker can be left in.
 * On Linux the truth is one field of /proc/<pid>/stat, and the drill reads it.
 * Where that file does not exist the signal probe is all there is, and the
 * limitation travels with the answer rather than being silently assumed away.
 */
export function probeAlive(pid, { startedAt = 0, readProc = defaultReadProc, signal = defaultSignal } = {}) {
  if (!Number.isFinite(pid)) return { alive: false, how: 'no pid' }
  const stat = readProc(pid)
  if (stat != null) {
    // A BARE PID IS NOT AN IDENTITY. Between the kill and the probe the number
    // can belong to something else entirely, and an unrelated process would
    // satisfy the liveness half of the verdict. Field 22 of /proc/<pid>/stat is
    // the start time in clock ticks; captured after the spawn and compared here,
    // it tells the worker apart from its successor at the same number.
    const now = startTicksOf(stat)
    if (startedAt && now && now !== startedAt) {
      return { alive: false, how: `pid ${pid} was recycled — start ${now} is not the ${startedAt} we spawned` }
    }
    // The state letter is the field after the ")" that closes the comm field —
    // parsed from the right, because a process name may itself contain ")".
    const state = stat.slice(stat.lastIndexOf(')') + 1).trim().charAt(0)
    if (DEAD_STATES.has(state)) return { alive: false, how: `dead in /proc (state ${state})` }
    if (LIVE_STATES.has(state)) return { alive: true, how: `/proc state ${state}` }
    // FAIL CLOSED on a letter this list does not know. A probe that guesses
    // "alive" for an unrecognised state is the one that greens a dead lane.
    return { alive: false, how: `unrecognised /proc state ${state || '(none)'} — read as dead` }
  }
  // FAIL CLOSED WHERE /proc CANNOT BE READ. The signal probe answers true for a
  // corpse, and `verdict` consumes only the boolean — so a transient read failure
  // would have greened a dead lane. A drill that cannot see the truth reports
  // that it cannot, and `signal` is kept only to distinguish "gone" from
  // "unreadable" in the explanation.
  // A pid the signal probe cannot find at all is GONE, not unknown: there is no
  // corpse for /proc to have hidden. Only a pid that still answers the signal
  // while /proc stays unreadable is genuinely undecidable here.
  if (!signal(pid)) return { alive: false, how: 'no such process' }
  return { alive: false, unknown: true, how: 'UNKNOWN — /proc unreadable and a signal probe cannot tell a corpse apart' }
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
const defaultSignal = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

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
  await sleep(settleMs)
  const lines = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean)
  const beatsBefore = lines(beat).length
  const pid = Number(readFileSync(join(dir, `start-${shape}.log`), 'utf8').trim().split('\n')[0])
  // The worker's start time, taken while it is provably still the process we
  // spawned, so a recycled pid cannot pass the liveness probe after the kill.
  const startedAt = startTicksOf(defaultReadProc(pid) ?? '')
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
  const live = probeAlive(pid, { startedAt })
  const outcome = readOutcome({
    shape,
    alive: live.alive,
    unknownLiveness: Boolean(live.unknown),
    beatsBefore,
    beatTimes,
    killedAt,
    observedUntil,
    lastLine: after.at(-1) ?? '',
  })
  if (Number.isFinite(pid)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }
  return outcome
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
    console.log(`${o.shape}: ${o.escaped ? 'ESCAPED' : 'DIED'} — ${o.why} (beats ${o.beatsBefore} → ${o.beatsAfter})`)
  }
  console.log(result.ok ? `VERDICT: ${result.note}` : `VERDICT: ${result.note}`)
  process.exit(result.ok ? 0 : 1)
}
