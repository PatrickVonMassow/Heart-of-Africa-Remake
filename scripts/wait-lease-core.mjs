// ONE WAIT PER SESSION AND RUN (point 1048, union entries U11, U12, U13) - the
// pure half.
//
// The night of 02./03.09.2026: the owning session woke roughly every ten
// minutes, spawned another background watcher, and blocked again. Ten such
// shells stood at 01:00. Nothing owned those waits, nothing deduplicated them,
// and no component could see them: the clearest evidence of the wedge was
// invisible to every monitor. This module makes a wait a LEASE, an owned,
// bounded, journalled object that a second declaration cannot silently
// duplicate.
//
// Three rules, and they are the whole module:
//   1. A lease is keyed by session AND run id. A second wait for the same run
//      ATTACHES to the first receipt; it never spawns.
//   2. A second wait for a DIFFERENT run from the same session REPLACES the
//      first and names its pid for termination: a session waits on one thing.
//   3. A wait is bounded by a deadline derived from the run's own estimate.
//      Crossing it is a journalled event; crossing 2.5 times the expectation,
//      or the lease cap, marks the run hung and asks the emergency core to act.
//
// The IO half (registry file, pid probing, killing, journal append) lives in
// scripts/wait-lease.mjs; scripts/batch-in-flight.mjs and
// scripts/verify/run-wait.mjs are its callers.

export const WAIT_LEASE_VERSION = 1
export const WAIT_LEASE_PATH = '.claude/wait-leases.json'

/** The longest any single wait may hold recovery off. Deliberately the same two
 *  hours as the emergency core's absolute deadline: a wait that outlives the
 *  deadline it is supposed to respect is not evidence of anything. */
export const WAIT_LEASE_CAP_MS = 2 * 60 * 60 * 1000

/** A run has no useful estimate until it has been measured. Below this floor a
 *  wait is not called overdue, or every unmeasured suite would report a timeout
 *  the moment it starts. */
export const WAIT_EXPECTATION_FLOOR_MS = 5 * 60 * 1000

/** Beyond this multiple of its own expectation a run is not slow, it is hung. */
export const HUNG_EXPECTATION_FACTOR = 2.5

/** A lease whose pid died is released within one probe; this grace only keeps a
 *  lease that was written moments ago from being reaped before its writer has
 *  reported its own pid as running. */
export const LEASE_SETTLE_MS = 5000

const positiveInt = (value) => (Number.isInteger(value) && value > 0 ? value : null)
const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const nonEmpty = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

/**
 * THE RUN IDENTITY A WAIT IS ABOUT (union entry U13).
 *
 * `--await` with no argument resolved "the newest live record", which can be an
 * unrelated concurrent run: a quick single-suite verify that starts while a
 * LARGE is going becomes the newest record, and the wait then belongs to the
 * wrong run. The log path is already unique and immutable, since it carries the
 * ISO start stamp and the command, so it is the token, normalised to a basename
 * so a relative and an absolute path cannot become two identities for one run.
 */
export function runIdFromLog(logPath) {
  const text = nonEmpty(logPath)
  if (!text) return null
  const base = text.split(/[\\/]/).pop() ?? ''
  const stripped = base.replace(/\.run\.json$/, '').replace(/\.log$/, '')
  return stripped === '' ? null : stripped
}

/** One lease, or null when the entry cannot be trusted. Identity is mandatory:
 *  a lease without session, run and pid can neither be attached to nor killed,
 *  so it would only be noise in the registry. */
export function normaliseLease(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const sessionId = nonEmpty(raw.sessionId)
  const runId = nonEmpty(raw.runId)
  const pid = positiveInt(raw.pid)
  const startedAt = finite(raw.startedAt)
  if (!sessionId || !runId || !pid || startedAt === null) return null
  return {
    sessionId,
    runId,
    pid,
    pidStartedAt: finite(raw.pidStartedAt),
    subject: nonEmpty(raw.subject) ?? runId,
    ownerGeneration: Number.isSafeInteger(raw.ownerGeneration) ? raw.ownerGeneration : null,
    startedAt,
    deadlineAt: finite(raw.deadlineAt),
    hungAt: finite(raw.hungAt),
    recordPath: nonEmpty(raw.recordPath),
    logPath: nonEmpty(raw.logPath),
    // Set once, by the first crossing, so a repeated read cannot re-report the
    // same timeout as new evidence.
    timeoutReportedAt: finite(raw.timeoutReportedAt),
    hungReportedAt: finite(raw.hungReportedAt),
  }
}

export function leaseKey({ sessionId, runId } = {}) {
  return `${sessionId ?? ''}\t${runId ?? ''}`
}

export function normaliseRegistry(raw) {
  const leases = []
  const seen = new Set()
  for (const entry of Array.isArray(raw?.leases) ? raw.leases : []) {
    const lease = normaliseLease(entry)
    if (!lease) continue
    const key = leaseKey(lease)
    // The file is written atomically under one owner, but a torn merge or a
    // hand edit must not produce two leases for one identity.
    if (seen.has(key)) continue
    seen.add(key)
    leases.push(lease)
  }
  return { v: WAIT_LEASE_VERSION, leases }
}

/**
 * Is this lease still worth believing?
 *
 * Not "is it recent" - that is exactly the mistake the stale in-flight marker
 * made. A lease is live only while its writing process is alive AND the run it
 * names has not reached a terminal status. Either answer being unknown leaves
 * the lease alive, because a probe that cannot see is not evidence of death.
 */
export function leaseIsLive(lease, { now = Date.now(), probePid = () => null, runTerminal = () => false } = {}) {
  if (!lease) return { live: false, reason: 'no-lease' }
  if (runTerminal(lease) === true) return { live: false, reason: 'run-terminal' }
  const alive = probePid(lease.pid, lease)
  if (alive === false) {
    if (now - lease.startedAt < LEASE_SETTLE_MS) return { live: true, reason: 'settling' }
    return { live: false, reason: 'writer-gone' }
  }
  if (finite(lease.hungAt) !== null && now >= lease.hungAt + WAIT_LEASE_CAP_MS) {
    // A lease whose own hung mark is a whole cap old belongs to nothing that is
    // still being supervised; releasing it stops it shielding the next wedge.
    return { live: false, reason: 'past-cap' }
  }
  return { live: true, reason: alive === true ? 'writer-alive' : 'writer-unknown' }
}

/** Drop every lease that is no longer live, and say which went and why. */
export function reapWaitLeases({ registry, now = Date.now(), probePid, runTerminal } = {}) {
  const current = normaliseRegistry(registry)
  const kept = []
  const released = []
  for (const lease of current.leases) {
    const verdict = leaseIsLive(lease, { now, probePid, runTerminal })
    if (verdict.live) kept.push(lease)
    else released.push({ lease, reason: verdict.reason })
  }
  return { registry: { v: WAIT_LEASE_VERSION, leases: kept }, released }
}

/**
 * THE TWO THRESHOLDS OF A BOUNDED WAIT (union entry U12).
 *
 * `--await` used to time out by printing advice and exiting 3, which is how the
 * session learned nothing and started another waiter. A wait now carries the
 * moment it becomes overdue and the moment its run is declared hung, both
 * derived from the run's own `--plan` estimate rather than from a wall-clock
 * guess, and both capped so an absent or absurd estimate cannot buy unlimited
 * silence.
 */
export function waitThresholds({
  startedAt,
  expectedRuntimeMs = 0,
  capMs = WAIT_LEASE_CAP_MS,
  floorMs = WAIT_EXPECTATION_FLOOR_MS,
  factor = HUNG_EXPECTATION_FACTOR,
} = {}) {
  const start = finite(startedAt)
  if (start === null) return { deadlineAt: null, hungAt: null, expectationMs: null }
  const expectation = Math.max(finite(expectedRuntimeMs) ?? 0, floorMs)
  const deadlineAt = Math.min(start + expectation, start + capMs)
  const hungAt = Math.min(start + Math.round(expectation * factor), start + capMs)
  return { deadlineAt, hungAt: Math.max(hungAt, deadlineAt), expectationMs: expectation }
}

/**
 * ACQUIRE, ATTACH OR REPLACE - the decision a session makes before it waits.
 *
 * `attach` is the answer that ends the incident: the wait for this run already
 * exists, so the caller reads its receipt instead of spawning a second watcher.
 * `replace` names the pids to retire, because a session that has moved on to a
 * different run must not leave the old wait standing.
 */
export function acquireWaitLease({
  registry, request, now = Date.now(), probePid = () => null, runTerminal = () => false,
} = {}) {
  const wanted = normaliseLease({ ...request, startedAt: request?.startedAt ?? now })
  if (!wanted) {
    return {
      verdict: 'invalid',
      reason: 'incomplete-request',
      registry: normaliseRegistry(registry),
      terminate: [],
      released: [],
      lease: null,
    }
  }
  const reaped = reapWaitLeases({ registry, now, probePid, runTerminal })
  const live = reaped.registry.leases
  const same = live.find((lease) => leaseKey(lease) === leaseKey(wanted))
  if (same) {
    return {
      verdict: 'attach',
      reason: 'wait-already-owned',
      lease: same,
      registry: reaped.registry,
      terminate: [],
      released: reaped.released,
    }
  }
  const mine = live.filter((lease) => lease.sessionId === wanted.sessionId)
  const others = live.filter((lease) => lease.sessionId !== wanted.sessionId)
  const next = { v: WAIT_LEASE_VERSION, leases: [...others, wanted] }
  if (mine.length > 0) {
    return {
      verdict: 'replace',
      reason: 'session-moved-to-another-run',
      lease: wanted,
      registry: next,
      terminate: mine.map((lease) => ({
        pid: lease.pid,
        pidStartedAt: lease.pidStartedAt,
        runId: lease.runId,
        sessionId: lease.sessionId,
      })),
      released: reaped.released,
    }
  }
  return {
    verdict: 'acquire',
    reason: 'first-wait-for-this-run',
    lease: wanted,
    registry: next,
    terminate: [],
    released: reaped.released,
  }
}

/** A terminal run record releases its lease; so does the waiter finishing. */
export function releaseWaitLease({ registry, sessionId, runId, now = Date.now(), probePid, runTerminal } = {}) {
  const reaped = reapWaitLeases({ registry, now, probePid, runTerminal })
  const key = leaseKey({ sessionId, runId })
  const removed = reaped.registry.leases.filter((lease) => leaseKey(lease) === key)
  const kept = reaped.registry.leases.filter((lease) => leaseKey(lease) !== key)
  return {
    registry: { v: WAIT_LEASE_VERSION, leases: kept },
    removed,
    released: reaped.released,
    found: removed.length > 0,
  }
}

/**
 * TWO LIVE WAITS FROM ONE SESSION IS ITSELF AN EMERGENCY INPUT (union entry
 * U11). The incident's ten watchers were not a symptom to be read off some
 * other signal, they WERE the wedge, and this is the predicate that says so in
 * one line, for the emergency core to consume.
 */
export function concurrentWaitAlarm({ registry, now = Date.now(), probePid, runTerminal } = {}) {
  const { registry: live } = reapWaitLeases({ registry, now, probePid, runTerminal })
  const bySession = new Map()
  for (const lease of live.leases) {
    const list = bySession.get(lease.sessionId) ?? []
    list.push(lease)
    bySession.set(lease.sessionId, list)
  }
  const offenders = []
  for (const [sessionId, leases] of bySession) {
    if (leases.length < 2) continue
    offenders.push({
      sessionId,
      count: leases.length,
      runIds: leases.map((lease) => lease.runId).sort(),
      pids: leases.map((lease) => lease.pid).sort((a, b) => a - b),
    })
  }
  offenders.sort((a, b) => (b.count - a.count) || a.sessionId.localeCompare(b.sessionId))
  return { alarm: offenders.length > 0, offenders }
}

/**
 * Where one live wait stands right now, and what - exactly once - it should
 * report. `events` is empty on every read after the first crossing, so a wait
 * that is checked every two seconds still journals one overdue line and asks
 * for one recovery.
 */
export function waitTimeoutDecision({ lease, now = Date.now(), lastProgressAt = null } = {}) {
  const entry = normaliseLease(lease)
  if (!entry) return { state: 'unknown', events: [], recovery: null, lease: null }
  const events = []
  const next = { ...entry }
  let state = 'running'
  if (finite(entry.deadlineAt) !== null && now >= entry.deadlineAt) state = 'overdue'
  if (finite(entry.hungAt) !== null && now >= entry.hungAt) state = 'hung'
  const evidence = {
    runId: entry.runId,
    subject: entry.subject,
    pid: entry.pid,
    elapsedMs: Math.max(0, now - entry.startedAt),
    deadlineAt: entry.deadlineAt,
    hungAt: entry.hungAt,
    lastProgressAt: finite(lastProgressAt),
  }
  if (state !== 'running' && entry.timeoutReportedAt === null) {
    next.timeoutReportedAt = now
    events.push({ event: 'verification-wait-timeout', cause: 'wait-deadline-crossed', evidence })
  }
  let recovery = null
  if (state === 'hung' && entry.hungReportedAt === null) {
    next.hungReportedAt = now
    recovery = { reason: 'verification-wait-hung', ...evidence }
    events.push({ event: 'verification-wait-timeout', cause: 'wait-declared-hung', evidence })
  }
  return { state, events, recovery, lease: next }
}
