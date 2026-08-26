#!/usr/bin/env node
// Chaos drill: run the real emergency orchestrator through soft failure and a
// hard strike, with an actual wedged child process as the owner. All files and
// command effects stay inside a temporary fixture.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ACTIVITY_CLASSES } from './batch-standstill-core.mjs'
import { EMERGENCY_COOLDOWN_MS, EMERGENCY_THRESHOLD_MS } from './batch-emergency-core.mjs'
import { probePid } from './batch-singleton.mjs'
import { runEmergency } from './batch-emergency.mjs'

const dir = mkdtempSync(join(tmpdir(), 'hoa-emergency-drill-'))
const statePath = join(dir, 'state.json')
const logPath = join(dir, 'strikes.jsonl')
const now = Date.now()
const progressAt = now - 2 * EMERGENCY_THRESHOLD_MS
const sleeper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })

const reportAt = (end) => ({
  window: { start: progressAt - 1, end },
  timeline: [
    { start: progressAt - 1, end: progressAt, className: ACTIVITY_CLASSES.FOREGROUND },
    { start: progressAt, end, className: ACTIVITY_CLASSES.IDLE_OWNER },
  ],
})
const commands = []
const execute = (_exe, args) => { commands.push(args.join(' ')); return '' }

try {
  const identity = probePid(sleeper.pid)
  if (!identity.exists || !Number.isFinite(identity.startedAt)) throw new Error('could not prove the chaos owner process')
  const lock = { sessionId: 'chaos-wedged-owner', pid: sleeper.pid, pidStartedAt: identity.startedAt, fence: 3 }
  const common = { statePath, logPath, execute, getLock: () => lock, getProcesses: () => ({}), revoke: () => ({ revoked: true, reason: 'drill-revoked' }), releaseLock: () => true }
  const soft = runEmergency({
    ...common,
    now,
    inputs: { workablePoints: [947], paused: false, veto: null, state: {}, report: reportAt(now) },
  })
  const persisted = JSON.parse(readFileSync(statePath, 'utf8'))
  const hardAt = now + EMERGENCY_COOLDOWN_MS + 1
  const hard = runEmergency({
    ...common,
    now: hardAt,
    inputs: { workablePoints: [947], paused: false, veto: null, state: persisted, report: reportAt(hardAt) },
  })
  await new Promise((resolve) => {
    if (sleeper.exitCode !== null || sleeper.signalCode !== null) return resolve()
    const timer = setTimeout(resolve, 2000)
    sleeper.once('exit', () => { clearTimeout(timer); resolve() })
  })
  const dead = !probePid(sleeper.pid).exists
  const rows = readFileSync(logPath, 'utf8').trim().split('\n').map(JSON.parse)
  const result = {
    softAction: soft.decision.action,
    hardAction: hard.decision.action,
    ownerTerminated: dead,
    restartAttempts: commands.filter((line) => /batch-autostart\.mjs/.test(line)).length,
    strikeRecords: rows.length,
    restoredWithoutHuman: hard.restored && dead,
    measuredMs: Date.now() - now,
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (!result.restoredWithoutHuman || result.softAction !== 'soft-recover' || result.hardAction !== 'hard-recover' || result.strikeRecords !== 4) {
    process.exitCode = 1
  }
} catch (error) {
  process.stderr.write(`batch-emergency-drill: ${error?.message ?? error}\n`)
  process.exitCode = 1
} finally {
  try { process.kill(sleeper.pid, 'SIGKILL') } catch { /* already ended by the real strike */ }
  rmSync(dir, { recursive: true, force: true })
}
