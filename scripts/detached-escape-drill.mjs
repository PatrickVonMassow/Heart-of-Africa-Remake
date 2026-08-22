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

/**
 * What a run's evidence MEANS — the pure half, so the reading is testable
 * without spawning anything.
 *
 * `beatsBefore`/`beatsAfter` are heartbeat counts around the kill; `alive` is a
 * post-kill liveness probe of the child pid.
 *
 * ESCAPED requires BOTH: a live process that has stopped working is not a
 * surviving lane, and beats that stopped where the kill fell are the failure
 * this drill exists to catch.
 */
export function readOutcome({ shape, alive, beatsBefore, beatsAfter, lastLine = '' } = {}) {
  const progressed = Number(beatsAfter) > Number(beatsBefore)
  const escaped = Boolean(alive) && progressed
  const why = escaped
    ? 'still running and still working after the kill'
    : !alive && /EPIPE/i.test(lastLine)
      ? 'died writing to a pipe whose reader went with the parent'
      : !alive
        ? 'died with the parent, cause not recorded in its own log'
        : 'still running but no longer working — a survivor that stopped is not a lane'
  return { shape, escaped, progressed, alive: Boolean(alive), beatsBefore, beatsAfter, why }
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

const WORKER = `
import { openSync, writeSync } from 'node:fs'
const fd = openSync(process.argv[2], 'a')
process.on('uncaughtException', (e) => { writeSync(fd, 'died: ' + (e.code ?? e.message) + '\\n'); process.exit(9) })
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
if (shape === 'files') child.unref()
else { child.stdout.on('data', () => {}); child.stderr.on('data', () => {}) }
console.log(String(child.pid))
await new Promise(() => {})
`

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const alive = (pid) => {
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
  const outcome = readOutcome({
    shape,
    alive: Number.isFinite(pid) && alive(pid),
    beatsBefore,
    beatsAfter: after.length,
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
