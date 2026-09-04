#!/usr/bin/env node
// THE WAIT REGISTRY (point 1048, union entries U11, U12, U13) - the IO half.
//
// It owns one small file, `.claude/wait-leases.json`, and four verbs on it:
// acquire, release, list and check. Everything that decides is in
// scripts/wait-lease-core.mjs; this file only reads, probes, writes, kills and
// journals.
//
// The one behaviour worth stating here: a REPLACE retires the pids the core
// names, and it verifies each pid's start time before signalling it. The
// incident was caused by a `pgrep -f <pattern>` that matched its own command
// line; nothing in this file ever matches a process by its text.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tryWriteJsonAtomic } from './atomic-write.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { probePid } from './batch-singleton.mjs'
import { emitActivity } from './batch-activity-journal.mjs'
import { ACTIVITY_EVENTS } from './batch-activity-journal-core.mjs'
import {
  WAIT_LEASE_PATH,
  WAIT_LEASE_VERSION,
  acquireWaitLease,
  concurrentWaitAlarm,
  normaliseRegistry,
  releaseWaitLease,
  runIdFromLog,
  waitThresholds,
  waitTimeoutDecision,
} from './wait-lease-core.mjs'
import { readRecord, recordPathFor } from './verify/run-record.mjs'

/** Signalling the wrong process is the failure mode this whole point is about,
 *  so a pid is only signalled when its recorded start time still matches. The
 *  tolerance absorbs clock and jiffy resolution, nothing more. */
export const PID_START_TOLERANCE_MS = 2000

export function registryPath(repo = REPO_ROOT || process.cwd()) {
  return join(repo, WAIT_LEASE_PATH)
}

export function readRegistry(path = registryPath()) {
  try {
    return normaliseRegistry(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return { v: WAIT_LEASE_VERSION, leases: [] }
  }
}

export function writeRegistry(registry, path = registryPath()) {
  return tryWriteJsonAtomic(path, normaliseRegistry(registry)).ok
}

/** A run whose record says finished, failed or absent releases its lease: the
 *  wait is over whether or not the waiter noticed. An unreadable record is NOT
 *  terminal, because "cannot see" is not "is over". */
export function runTerminalFor(lease) {
  const path = lease?.recordPath
  if (typeof path !== 'string' || path.trim() === '') return false
  const full = path.startsWith('/') ? path : join(REPO_ROOT || process.cwd(), path)
  if (!existsSync(full)) return false
  const record = readRecord(full)
  if (!record) return false
  return record.status !== 'running'
}

const liveProbe = (pid) => probePid(pid).exists

function journal(event, { lease, cause, evidence = {}, at = Date.now(), journalPath = null } = {}) {
  try {
    emitActivity({
      event,
      at,
      session: lease?.sessionId ?? null,
      pid: lease?.pid ?? null,
      pidStartedAt: lease?.pidStartedAt ?? null,
      cause,
      evidence: { runId: lease?.runId ?? null, subject: lease?.subject ?? null, ...evidence },
    }, journalPath ? { path: journalPath } : {})
  } catch {
    // Bookkeeping must never take a wait down with it.
  }
  return true
}

/**
 * Retire the waits a replace has orphaned. Start time first, then TERM, then
 * KILL on the next call if it is still there: an unrelated process that merely
 * inherited the pid keeps running, which is the whole point of the check.
 */
export function retireWaiters(entries = [], { kill = process.kill.bind(process), now = Date.now() } = {}) {
  const outcomes = []
  for (const entry of entries) {
    const probe = probePid(entry.pid)
    if (!probe.exists) {
      outcomes.push({ pid: entry.pid, outcome: 'already-gone' })
      continue
    }
    if (
      typeof entry.pidStartedAt === 'number' && typeof probe.startedAt === 'number' &&
      Math.abs(probe.startedAt - entry.pidStartedAt) > PID_START_TOLERANCE_MS
    ) {
      outcomes.push({ pid: entry.pid, outcome: 'pid-reused-left-alone' })
      continue
    }
    try {
      kill(entry.pid, 'SIGTERM')
      outcomes.push({ pid: entry.pid, outcome: 'terminated', at: now })
    } catch (error) {
      outcomes.push({ pid: entry.pid, outcome: 'signal-failed', error: String(error?.code ?? error) })
    }
  }
  return outcomes
}

/**
 * Claim the wait for one run. Returns the core's verdict plus what was actually
 * done, so the caller can print one honest line: `attach` means do not spawn.
 */
export function claimWait({
  sessionId, runId, logPath = null, recordPath = null, pid = process.pid, subject = null,
  ownerGeneration = null, expectedRuntimeMs = 0, now = Date.now(), path = registryPath(), kill,
  journalPath = null,
} = {}) {
  const id = runId ?? runIdFromLog(logPath)
  if (!id) return { verdict: 'invalid', reason: 'no-run-id', lease: null, terminated: [] }
  const { deadlineAt, hungAt } = waitThresholds({ startedAt: now, expectedRuntimeMs })
  const request = {
    sessionId,
    runId: id,
    pid,
    pidStartedAt: probePid(pid).startedAt,
    subject: subject ?? id,
    ownerGeneration,
    startedAt: now,
    deadlineAt,
    hungAt,
    recordPath: recordPath ?? (logPath ? recordPathFor(logPath) : null),
    logPath,
  }
  const decision = acquireWaitLease({
    registry: readRegistry(path), request, now, probePid: liveProbe, runTerminal: runTerminalFor,
  })
  if (decision.verdict === 'invalid') return { ...decision, terminated: [] }
  const terminated = decision.terminate.length ? retireWaiters(decision.terminate, { kill, now }) : []
  writeRegistry(decision.registry, path)
  for (const { lease, reason } of decision.released) {
    journal(ACTIVITY_EVENTS.WAIT_LEASE_RELEASE, { lease, cause: reason, at: now, journalPath })
  }
  const event = decision.verdict === 'attach'
    ? ACTIVITY_EVENTS.WAIT_LEASE_ATTACH
    : decision.verdict === 'replace' ? ACTIVITY_EVENTS.WAIT_LEASE_REPLACE : ACTIVITY_EVENTS.WAIT_LEASE_ACQUIRE
  journal(event, { lease: decision.lease, cause: decision.reason, at: now, evidence: { terminated }, journalPath })
  return { ...decision, terminated }
}

export function finishWait({
  sessionId, runId, logPath = null, now = Date.now(), path = registryPath(), cause = 'wait-finished', journalPath = null,
} = {}) {
  const id = runId ?? runIdFromLog(logPath)
  if (!id) return { found: false, reason: 'no-run-id' }
  const result = releaseWaitLease({
    registry: readRegistry(path), sessionId, runId: id, now, probePid: liveProbe, runTerminal: runTerminalFor,
  })
  writeRegistry(result.registry, path)
  for (const lease of result.removed) journal(ACTIVITY_EVENTS.WAIT_LEASE_RELEASE, { lease, cause, at: now, journalPath })
  return result
}

/**
 * Where every live wait stands. This is what the launcher, the emergency core
 * and a human all read: the overdue and hung marks per lease, and the alarm
 * that two live waits from one session raises on its own.
 */
export function waitStatus({ now = Date.now(), path = registryPath(), lastProgressAt = null, journalPath = null } = {}) {
  const registry = readRegistry(path)
  const alarm = concurrentWaitAlarm({ registry, now, probePid: liveProbe, runTerminal: runTerminalFor })
  const leases = []
  let changed = false
  const next = []
  for (const lease of registry.leases) {
    const decision = waitTimeoutDecision({ lease, now, lastProgressAt })
    for (const event of decision.events) {
      journal(ACTIVITY_EVENTS.VERIFICATION_WAIT_TIMEOUT, { lease, cause: event.cause, evidence: event.evidence, at: now, journalPath })
      changed = true
    }
    leases.push({ ...lease, state: decision.state, recovery: decision.recovery })
    next.push(decision.lease ?? lease)
  }
  if (changed) writeRegistry({ v: WAIT_LEASE_VERSION, leases: next }, path)
  const hung = leases.filter((lease) => lease.state === 'hung')
  return {
    leases,
    alarm,
    hung,
    // The single line the emergency core consumes: a session whose waits can
    // never return, expressed without reference to any process name.
    recoveryRequested: hung.length > 0 || alarm.alarm,
  }
}

const USAGE = [
  'usage:',
  '  node scripts/wait-lease.mjs --claim --session <id> --run <id>|--log <path> [--expect-ms <n>] [--subject <text>]',
  '  node scripts/wait-lease.mjs --release --session <id> --run <id>|--log <path>',
  '  node scripts/wait-lease.mjs --status [--json]',
].join('\n')

function arg(argv, name) {
  const at = argv.indexOf(name)
  return at >= 0 && argv[at + 1] && !argv[at + 1].startsWith('--') ? argv[at + 1] : null
}

function main(argv) {
  if (argv.includes('--claim')) {
    const result = claimWait({
      sessionId: arg(argv, '--session') ?? process.env.CLAUDE_SESSION_ID ?? 'unknown',
      runId: arg(argv, '--run'),
      logPath: arg(argv, '--log'),
      subject: arg(argv, '--subject'),
      expectedRuntimeMs: Number(arg(argv, '--expect-ms')) || 0,
    })
    console.log(JSON.stringify(result, null, 2))
    return result.verdict === 'invalid' ? 2 : 0
  }
  if (argv.includes('--release')) {
    const result = finishWait({
      sessionId: arg(argv, '--session') ?? process.env.CLAUDE_SESSION_ID ?? 'unknown',
      runId: arg(argv, '--run'),
      logPath: arg(argv, '--log'),
    })
    console.log(JSON.stringify(result, null, 2))
    return 0
  }
  if (argv.includes('--status')) {
    const status = waitStatus({})
    if (argv.includes('--json')) {
      console.log(JSON.stringify(status, null, 2))
      return 0
    }
    if (!status.leases.length) {
      console.log('no wait lease held.')
      return 0
    }
    for (const lease of status.leases) {
      console.log(`${lease.state.padEnd(8)} ${lease.sessionId} pid ${lease.pid} — ${lease.subject}`)
    }
    if (status.alarm.alarm) {
      for (const offender of status.alarm.offenders) {
        console.log(`ALARM: session ${offender.sessionId} holds ${offender.count} live waits (${offender.runIds.join(', ')})`)
      }
    }
    return status.recoveryRequested ? 1 : 0
  }
  console.log(USAGE)
  return 2
}

if (process.argv[1] && process.argv[1].endsWith('wait-lease.mjs')) {
  process.exitCode = main(process.argv.slice(2))
}
