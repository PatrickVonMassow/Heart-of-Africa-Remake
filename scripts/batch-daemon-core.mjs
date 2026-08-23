// THE DAEMON'S DECISION CORE — step 3 of the "Ordered work" in
// docs/handover-architecture.md (work-order point 834, the front stage of 676).
//
// Pure: the daemon process (scripts/batch-daemon.mjs) owns sockets, spawns and
// files, and every decision it enforces is decided here from arguments. The
// mutation gate itself — (sessionId, fence) against the live lock — is step 1's
// validateMutation and is not repeated; this module owns what step 3 adds:
// the global cap, the worker spawn plans, retention, drain, authorization and
// the daemon's own identity record.
import { randomBytes } from 'node:crypto'
import { DAEMON_RECORD_FIELDS, SCHEMA_VERSION, sameProcess } from './batch-schema-core.mjs'

// ---------------------------------------------------------------------------
// 1. THE GLOBAL CAP (union M9)
// ---------------------------------------------------------------------------

/** Three active authoring processes, enforced IN THE DAEMON and nowhere else, so
 *  overlapping coordinator epochs cannot temporarily create six workers. Mirrors
 *  POOL_CAP in scripts/batch-in-flight-core.mjs; a test asserts the two agree. */
export const DAEMON_POOL_CAP = 3

/** The states that occupy a slot: a checkpointing worker is still a live process,
 *  a stalled one may come back (M38 frees no ambiguous lease), so both count.
 *  Only terminal states and queued free the slot. */
export const SLOT_OCCUPYING_STATES = Object.freeze(['running', 'checkpointing', 'stalled'])

export function activeAttemptCount(attempts = []) {
  return attempts.filter((a) => SLOT_OCCUPYING_STATES.includes(a?.state?.state)).length
}

export function mayStartAttempt({ attempts = [], cap = DAEMON_POOL_CAP } = {}) {
  const active = activeAttemptCount(attempts)
  if (active >= cap) {
    return { ok: false, reason: `the global cap holds: ${active} of ${cap} slots are occupied, stalled workers included` }
  }
  return { ok: true, active }
}

// ---------------------------------------------------------------------------
// 2. WORKER SPAWN PLANS — commands come from this table, never from a request
// ---------------------------------------------------------------------------

/** The adapters a daemon may run. The COMMAND is decided here from the adapter
 *  name; a request supplies data (point, branch, worktree, paths) and that data
 *  is validated as DATA — it becomes argv values, never argv structure, and
 *  nothing derived from worker output ever reaches an exec path ("Additional
 *  omissions": daemon authorization). `sol` wraps the proven author-sol.mjs in
 *  the detached-agent contract rather than changing its authoring behavior
 *  (union M5); `stub` is the hermetic worker the drills use. */
export const WORKER_ADAPTERS = Object.freeze({
  sol: Object.freeze({ runner: 'author-sol' }),
  stub: Object.freeze({ runner: 'stub' }),
})

const plainId = (v) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v)
const plainBranch = (v) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/.test(v) && !v.includes('..') && !v.endsWith('/')
const absDir = (v) => typeof v === 'string' && v.startsWith('/') && !v.includes('\0')

export function workerSpawnPlan({ adapter, pointId, branch, worktree, attemptDir, leaseId } = {}) {
  const spec = WORKER_ADAPTERS[adapter]
  if (!spec) return { ok: false, reason: `unknown adapter: ${String(adapter)}; commands come from the adapter table, never from a request` }
  if (!plainId(pointId)) return { ok: false, reason: 'pointId must be a plain identifier' }
  if (!plainBranch(branch)) return { ok: false, reason: 'branch must be a plain ref name' }
  if (!absDir(worktree) || !absDir(attemptDir)) return { ok: false, reason: 'worktree and attemptDir must be absolute paths' }
  if (!plainId(leaseId)) return { ok: false, reason: 'leaseId must be a plain identifier' }
  const args = [
    'scripts/detached-agent.mjs',
    '--runner', spec.runner,
    '--point', pointId,
    '--branch', branch,
    '--worktree', worktree,
    '--attempt-dir', attemptDir,
    '--lease-id', leaseId,
  ]
  return { ok: true, cmd: process.execPath, args, logPath: `${attemptDir}/worker.log`, heartbeatPath: `${attemptDir}/heartbeat` }
}

// ---------------------------------------------------------------------------
// 3. RETENTION ("Additional omissions": preserve audit, eventually prune bulk)
// ---------------------------------------------------------------------------

/** Records are audit and are never pruned; logs and worktrees are bulk and are
 *  pruned once a TERMINAL landed or cancelled attempt has aged past retention.
 *  Failed attempts keep everything: they are evidence someone has not read yet. */
export const RETAIN_BULK_MS = 14 * 24 * 60 * 60 * 1000

export function retentionDecision({ attempt = {}, now = 0, retainMs = RETAIN_BULK_MS } = {}) {
  const state = attempt?.state?.state
  const keepAll = { keepRecord: true, pruneLog: false, pruneWorktree: false }
  if (!['landed', 'cancelled'].includes(state)) return keepAll
  const at = attempt?.state?.at
  if (!Number.isFinite(at) || now - at < retainMs) return keepAll
  return { keepRecord: true, pruneLog: true, pruneWorktree: true }
}

// ---------------------------------------------------------------------------
// 4. CONTROL AUTHORIZATION
// ---------------------------------------------------------------------------

/** The control socket lives in the owner-only state directory, which is the
 *  operating system's enforcement; this is the daemon's own second look at the
 *  peer's credentials, and it accepts only the exact uid the daemon runs as. */
export function controlAuthorized({ peerUid = null, daemonUid = null } = {}) {
  if (!Number.isInteger(peerUid) || !Number.isInteger(daemonUid)) {
    return { ok: false, reason: 'peer credentials could not be established; a control request without them is refused' }
  }
  if (peerUid !== daemonUid) return { ok: false, reason: `foreign uid ${peerUid}; the daemon answers only its owner` }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 5. THE DAEMON'S OWN IDENTITY RECORD
// ---------------------------------------------------------------------------

export function mintLaunchNonce() {
  return randomBytes(16).toString('hex')
}

/** The record `start` waits for and every later session reads. Field set is
 *  step 1's DAEMON_RECORD_FIELDS, exactly — a record with more is not refused,
 *  but one with less is not a record. */
export function buildDaemonRecord({ pid, pidStartedAt, generation, fence, launchNonce, startedAt } = {}) {
  const record = { v: SCHEMA_VERSION, pid, pidStartedAt, generation, fence, launchNonce, startedAt }
  const missing = DAEMON_RECORD_FIELDS.filter((f) => record[f] === undefined || record[f] === null)
  if (missing.length) return { ok: false, reason: `a daemon record misses: ${missing.join(', ')}` }
  if (!Number.isInteger(pid) || pid < 1 || !Number.isFinite(pidStartedAt)) {
    return { ok: false, reason: 'a daemon record names its process identity: pid and pid start time' }
  }
  if (typeof generation !== 'string' || generation.length < 8) return { ok: false, reason: 'a daemon record names its generation' }
  if (!Number.isInteger(fence) || fence < 1) return { ok: false, reason: 'a daemon record names the fence it serves' }
  return { ok: true, record: Object.freeze(record) }
}

/** The wait after spawn ends only on a record carrying THE nonce this launch
 *  minted: a leftover record from a dead launch carries another one and does not
 *  satisfy the wait (mechanism 1). */
export function readinessSatisfied({ record = null, expectedNonce = null } = {}) {
  if (typeof expectedNonce !== 'string' || !expectedNonce) return { ok: false, reason: 'no nonce to wait for' }
  if (!record) return { ok: false, reason: 'no record yet' }
  if (record.launchNonce !== expectedNonce) return { ok: false, reason: "a previous daemon's record; not this launch" }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 6. DRAIN — rollback is a single operation with nothing to interleave
// ---------------------------------------------------------------------------

/** The ordered drain of mechanism 2: refuse new mutations, finish the at most one
 *  in flight, cancel workers preserving branches and pushed SHAs, seal the
 *  snapshot, release the identity record, exit. Returned as data so the process
 *  half executes exactly this and the test asserts exactly this. */
export const DRAIN_STEPS = Object.freeze([
  'refuse-new-mutations',
  'finish-in-flight-mutation',
  'cancel-workers-preserving-branches',
  'seal-snapshot',
  'release-identity-record',
  'exit',
])

/** Where a start must be refused although flag and interlock said yes: the same
 *  exclusive-create identity test used everywhere. A live record means a daemon
 *  exists; a dead one is a cold record the caller must reconcile (step 8), never
 *  silently overwrite. */
export function mayCreateDaemonRecord({ existing = null, probe = null } = {}) {
  if (!existing) return { ok: true }
  // The identity is pid AND pid start time: a recycled pid under another start
  // time is a stranger, and the record beside it is cold, not alive.
  const live = probe?.live === true && sameProcess(existing, { pid: probe.pid, pidStartedAt: probe.startedAt })
  if (live) return { ok: false, reason: `a live daemon exists under pid ${existing.pid}; there is at most one` }
  return { ok: false, reason: 'a cold daemon record stands; reconcile it (step 8) before starting a new daemon', cold: true }
}
