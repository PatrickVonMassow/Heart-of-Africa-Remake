#!/usr/bin/env node
// Independent last-resort lane for a total batch wedge. It is invoked hourly
// by HoA-Batch-Emergency, not by an owner, launcher, or recovery session.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import { gatherStandstillReport } from './batch-standstill-report.mjs'
import { runRecordFor } from './batch-in-flight.mjs'
import { openPointsOf, frontCandidates } from './board-queue-core.mjs'
import { gateSets } from './user-gate-core.mjs'
import {
  LOCK_PATH,
  probePid,
  readOwnerLock,
  readSessionProcesses,
  release,
  revokeWriterFence,
} from './batch-singleton.mjs'
import { EMERGENCY_THRESHOLD_MS, emergencyDecision, strikeRecord } from './batch-emergency-core.mjs'
import { EMERGENCY_INTERVAL_MINUTES, EMERGENCY_SCRIPT_PATH, EMERGENCY_TASK_NAME, PRIMARY_TASK_NAME } from './windows-task-core.mjs'

export { EMERGENCY_INTERVAL_MINUTES, EMERGENCY_SCRIPT_PATH, EMERGENCY_TASK_NAME }
export const EMERGENCY_STATE_PATH = join(REPO_ROOT, 'local', 'batch-emergency-state.json')
export const EMERGENCY_LOG_PATH = join(REPO_ROOT, 'local', 'batch-emergency-strikes.jsonl')
export const EMERGENCY_VETO_PATH = join(REPO_ROOT, 'local', 'batch-emergency-veto.json')

/** The report resolves a run's log once and hands this exact path to both the
 * progress evidence and identity probe. Only runRecordFor's positive identity
 * verdict is live; false, null and exceptions all fail closed. */
export function verificationProcessAlive(_record, _recordPath, logPath, { runRecord = runRecordFor } = {}) {
  if (typeof logPath !== 'string' || !logPath.trim()) return false
  try { return runRecord(logPath)?.alive === true } catch { return false }
}

const readJson = (path) => {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

function appendRecord(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify(value)}\n`, 'utf8')
}

function commandOutcome(name, args, { execute = execFileSync, repo = REPO_ROOT } = {}) {
  try {
    execute(process.execPath, [join(repo, 'scripts', name), ...args], {
      cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 180_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { step: `${name} ${args.join(' ')}`.trim(), ok: true }
  } catch (error) {
    return {
      step: `${name} ${args.join(' ')}`.trim(), ok: false,
      error: String(error?.stderr || error?.message || error).trim().split('\n').slice(-1)[0],
    }
  }
}

/** On Windows the emergency task runs as SYSTEM but the authenticated primary
 * runs as the interactive user. Start that task so Task Scheduler supplies the
 * right profile; spawning batch-autostart directly as SYSTEM would lose auth. */
export function restartOutcome({ execute = execFileSync, repo = REPO_ROOT, platform = process.platform } = {}) {
  if (platform !== 'win32') return commandOutcome('batch-autostart.mjs', [], { execute, repo })
  try {
    execute('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Start-ScheduledTask -TaskName '${PRIMARY_TASK_NAME}'`,
    ], { windowsHide: true, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] })
    return { step: 'start-primary-scheduled-task', ok: true }
  } catch (error) {
    return { step: 'start-primary-scheduled-task', ok: false, error: error?.message ?? String(error) }
  }
}

/** Terminate only the exact process incarnation named by the owner lock. */
export function terminateLockedOwner(lock, { execute = execFileSync, kill = process.kill, probe = probePid } = {}) {
  if (!lock || !Number.isInteger(lock.pid) || lock.pid <= 0) return { step: 'terminate-owner', ok: true, skipped: 'no-owner-pid' }
  const observed = probe(lock.pid)
  if (!observed.exists) return { step: 'terminate-owner', ok: true, skipped: 'owner-already-dead', pid: lock.pid }
  if (!Number.isFinite(lock.pidStartedAt) || !Number.isFinite(observed.startedAt) || Math.abs(lock.pidStartedAt - observed.startedAt) > 2000) {
    return { step: 'terminate-owner', ok: false, error: 'owner pid incarnation is not proven', pid: lock.pid }
  }
  try {
    if (process.platform === 'win32') {
      execute('taskkill.exe', ['/PID', String(lock.pid), '/T', '/F'], { windowsHide: true, timeout: 30_000, stdio: 'ignore' })
    } else {
      // Deliberately exact-pid only. POSIX descendant termination needs a
      // separately proved process tree; see docs/batch-autonomy.md. The
      // verification lease still has a two-hour aggregate ceiling, but a
      // living orphan wrapper can satisfy identity until then.
      kill(lock.pid, 'SIGTERM')
    }
    return { step: 'terminate-owner', ok: true, pid: lock.pid }
  } catch (error) {
    if (error?.code === 'ESRCH') return { step: 'terminate-owner', ok: true, pid: lock.pid, skipped: 'owner-already-dead' }
    return { step: 'terminate-owner', ok: false, pid: lock.pid, error: error?.message ?? String(error) }
  }
}

export function defaultInputs({
  repo, now, thresholdMs, gather = gatherStandstillReport, runRecord = runRecordFor,
}) {
  const tasksText = readFileSync(join(repo, 'TASKS.md'), 'utf8')
  const open = openPointsOf(tasksText)
  const workablePoints = frontCandidates({ open, gates: gateSets(tasksText), inFlight: [], count: open.length })
  return {
    workablePoints,
    paused: existsSync(join(repo, '.claude', 'batch-paused')),
    veto: readJson(join(repo, 'local', 'batch-emergency-veto.json')),
    state: readJson(join(repo, 'local', 'batch-emergency-state.json')) ?? {},
    report: gather({
      repo, ref: 'main', start: now - 4 * thresholdMs, end: now, thresholdMs,
      verificationProcessAlive: (record, recordPath, logPath) =>
        verificationProcessAlive(record, recordPath, logPath, { runRecord }),
    }),
  }
}

/** The real strike path, dependency-injected only so the chaos drill can run it
 * without touching the live batch. The intent is atomic before any repair act. */
export function runEmergency({
  repo = REPO_ROOT, now = Date.now(), thresholdMs = EMERGENCY_THRESHOLD_MS,
  dryRun = false, inputs = null, statePath = join(repo, 'local', 'batch-emergency-state.json'),
  logPath = join(repo, 'local', 'batch-emergency-strikes.jsonl'), execute = execFileSync,
  getLock = () => readOwnerLock(LOCK_PATH), revoke = revokeWriterFence,
  getProcesses = () => readSessionProcesses(), terminate = terminateLockedOwner, releaseLock = release,
} = {}) {
  const observed = inputs ?? defaultInputs({ repo, now, thresholdMs })
  const decision = emergencyDecision({ now, thresholdMs, ...observed })
  if (!decision.strike || dryRun) return { decision, outcomes: [], restored: false, dryRun }

  const id = `emergency-${now}-${randomUUID()}`
  const intent = strikeRecord({ id, decision, at: now, phase: 'intent' })
  writeJsonAtomic(statePath, { ...observed.state, lastStrikeAt: now, lastStrikeProgressAt: decision.progressAt, lastStrikeId: id, pending: intent })
  appendRecord(logPath, intent)

  const outcomes = []
  let mayRepair = true
  if (decision.action === 'hard-recover') {
    const lock = getLock()
    if (lock && Number.isSafeInteger(lock.fence)) {
      const revoked = revoke(lock.sessionId, lock.fence, { reason: 'emergency-total-wedge' })
      outcomes.push({ step: 'revoke-writer-fence', ok: revoked?.revoked === true, detail: revoked?.reason ?? 'no verdict' })
    } else {
      outcomes.push({ step: 'revoke-writer-fence', ok: true, skipped: 'no-fenced-owner' })
    }
    const targets = [
      ...(lock ? [{ sessionId: lock.sessionId, pid: lock.pid, pidStartedAt: lock.pidStartedAt }] : []),
      ...Object.entries(getProcesses() ?? {}).map(([sessionId, process]) => ({ sessionId, pid: process?.pid, pidStartedAt: process?.startedAt })),
    ].filter((target, index, all) => Number.isInteger(target.pid) && target.pid > 0 && all.findIndex((x) => x.pid === target.pid) === index)
    if (!targets.length) outcomes.push({ step: 'terminate-batch-processes', ok: true, skipped: 'no-recorded-process' })
    for (const target of targets) {
      const ended = terminate(target)
      outcomes.push({ ...ended, sessionId: target.sessionId })
      if (!ended.ok) mayRepair = false
    }
    if (mayRepair && lock?.sessionId) outcomes.push({ step: 'release-owner-lock', ok: releaseLock(lock.sessionId) === true })
  }
  // Doctor may write only after every recorded live process was terminated with
  // exact pid-incarnation proof. A failed kill leaves it diagnostic-only.
  outcomes.push(commandOutcome('batch-doctor.mjs', mayRepair ? ['--repair'] : [], { execute, repo }))
  outcomes.push(restartOutcome({ execute, repo }))
  const restored = outcomes.at(-1)?.ok === true
  const outcome = strikeRecord({ id, decision, at: Date.now(), phase: 'outcome', outcomes })
  writeJsonAtomic(statePath, {
    ...observed.state,
    lastStrikeAt: now,
    lastStrikeProgressAt: decision.progressAt,
    lastStrikeId: id,
    lastOutcome: outcome,
  })
  appendRecord(logPath, outcome)
  return { decision, outcomes, restored, dryRun: false }
}

export const usage = () => [
  'usage: node scripts/batch-emergency.mjs [--dry-run|--status]',
  '       node scripts/batch-emergency.mjs --veto "<reason>" --until <ISO>',
  '       node scripts/batch-emergency.mjs --clear-veto',
  '',
  'The hourly SYSTEM task runs the first form. Every strike is recorded under local/.',
  'A batch pause always wins; a veto must be reasoned and clocked.',
].join('\n')

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  try {
    if (argv.includes('--help') || argv.includes('-h')) {
      process.stdout.write(`${usage()}\n`)
    } else if (argv.includes('--status')) {
      process.stdout.write(`${JSON.stringify({ state: readJson(EMERGENCY_STATE_PATH), veto: readJson(EMERGENCY_VETO_PATH) }, null, 2)}\n`)
    } else if (argv.includes('--clear-veto')) {
      writeJsonAtomic(EMERGENCY_VETO_PATH, { clearedAt: Date.now(), cleared: true })
      process.stdout.write('batch-emergency: veto cleared\n')
    } else if (argv.includes('--veto')) {
      const reason = argv[argv.indexOf('--veto') + 1]
      const untilText = argv[argv.indexOf('--until') + 1]
      const until = Date.parse(untilText)
      if (!reason || !Number.isFinite(until) || until <= Date.now()) throw new Error('--veto needs a reason and a future --until ISO timestamp')
      writeJsonAtomic(EMERGENCY_VETO_PATH, { v: 1, reason, until, writtenAt: Date.now() })
      process.stdout.write(`batch-emergency: vetoed until ${new Date(until).toISOString()} — ${reason}\n`)
    } else {
      const result = runEmergency({ dryRun: argv.includes('--dry-run') })
      process.stdout.write(`${JSON.stringify(result)}\n`)
      if (result.decision.strike && !result.restored && !result.dryRun) process.exitCode = 1
    }
  } catch (error) {
    process.stderr.write(`batch-emergency: ${error?.message ?? error}\n`)
    process.exitCode = 1
  }
}
