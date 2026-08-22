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

/**
 * What a run's evidence MEANS — the pure half, so the reading is testable
 * without spawning anything.
 *
 * ESCAPED IS A RATE, NOT A SINGLE BEAT. The first version called any increase
 * "still working", and the cross-vendor reading broke it in one line: a worker
 * that emits one beat after the kill and then hangs for the rest of the window
 * passed. A surviving lane has to keep working, so the run must show at least
 * half the beats the observation window could hold AND a last beat that is
 * recent at the end of it.
 *
 * `alive` is a LIVENESS verdict, not a `kill(pid, 0)` result: that call answers
 * true for a zombie, which is a dead worker with an entry still in the table.
 * The caller resolves that; see `probeAlive`.
 */
export function readOutcome({
  shape,
  alive,
  beatsBefore,
  beatsAfter,
  lastBeatAt = 0,
  observedUntil = 0,
  observeMs = 0,
  lastLine = '',
} = {}) {
  const gained = Number(beatsAfter) - Number(beatsBefore)
  const expected = observeMs ? Math.floor(observeMs / BEAT_MS) : 0
  // Half of what the window could hold: enough slack for a loaded host, far
  // above the single beat a hung process can still emit.
  const kept = expected ? gained >= Math.floor(expected / 2) : gained > 0
  // …and it must still have been beating at the END of the window, so a worker
  // that ran fast and then stopped cannot pass on volume alone.
  const fresh = lastBeatAt && observedUntil ? observedUntil - lastBeatAt <= BEAT_MS * 5 : gained > 0
  const progressed = Boolean(kept && fresh)
  const escaped = Boolean(alive) && progressed
  const why = escaped
    ? 'still running and still working after the kill'
    : !alive && /EPIPE/i.test(lastLine)
      ? 'died writing to a pipe whose reader went with the parent'
      : !alive
        ? 'died with the parent, cause not recorded in its own log'
        : !kept
          ? 'still running but barely working — a lane that emits one beat and hangs is not a lane'
          : 'still running but stopped beating before the window closed'
  return { shape, escaped, progressed, alive: Boolean(alive), beatsBefore, beatsAfter, gained, why }
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
export function probeAlive(pid, { readProc = defaultReadProc, signal = defaultSignal } = {}) {
  if (!Number.isFinite(pid)) return { alive: false, how: 'no pid' }
  const stat = readProc(pid)
  if (stat != null) {
    // The state letter is the field after the ")" that closes the comm field —
    // parsed from the right, because a process name may itself contain ")".
    const state = stat.slice(stat.lastIndexOf(')') + 1).trim().charAt(0)
    if (state === 'Z') return { alive: false, how: 'zombie in /proc' }
    return { alive: state !== '', how: `/proc state ${state}` }
  }
  return { alive: signal(pid), how: 'signal probe only — a zombie reads as alive here' }
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
  try {
    process.kill(-parent.pid, 'SIGKILL')
  } catch {
    /* already gone */
  }
  await sleep(observeMs)
  const after = lines(beat)
  const observedUntil = Date.now()
  const beats = after.filter((l) => l.startsWith('beat '))
  const lastBeatAt = Number(beats.at(-1)?.slice('beat '.length)) || 0
  const outcome = readOutcome({
    shape,
    alive: probeAlive(pid).alive,
    beatsBefore,
    beatsAfter: after.length,
    lastBeatAt,
    observedUntil,
    observeMs,
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
