// HARD batch singleton (user mandate 24.07.2026, after the e9407cae incident:
// two live sessions drove the batch and committed to main concurrently).
// This module is the ONE authority on "who may drive the batch":
//
//   1. A single OWNER LOCK (.claude/batch-lock.json) held as a LEASE: session id,
//      the owning claude process's OS PID and start time, a heartbeat timestamp,
//      and `leaseUntil` — the moment ownership ENDS unless it is renewed. The pid
//      makes liveness REAL: a session mid-40-minute tool call writes no
//      heartbeat, but its process is provably alive — the old claimedAt-age-only
//      check declared exactly such a session dead and double-spawned (the
//      incident's root cause). The LEASE answers the opposite question, the one
//      the night of 29./30.07.2026 lost seven hours to: a process that is alive
//      but no longer working keeps nothing. Renewal is PreToolUse and expiry is
//      pure arithmetic — there is no probe, no verdict and no condition at the
//      acquire door (docs/batch-resilience.md §3, layer 1;
//      scripts/batch-lease-core.mjs).
//   1a. A FENCE (.claude/batch-fence.json), monotonic and never deleted: every
//      acquisition takes a number, so a session that was dispossessed can be told
//      apart from the one that holds the batch now. It cannot live in the lock
//      file — `acquire` deletes that — and it is enforced at ONE PreToolUse
//      chokepoint (scripts/board-first-guard.mjs) for the four paths that have no
//      guard of their own: the work-order tick, `git merge`/`push`, the board
//      publish and `dashboard-state.json`.
//   2. ATOMIC acquisition (test-and-set, never check-then-set): first claim via
//      exclusive file create ('wx'); takeover of a dead lock via a reap MUTEX
//      directory (mkdirSync is atomic) so two racing starters can never both
//      win, and a racer can never clobber a freshly re-claimed live lock.
//   3. STAND-DOWN: every guard/hook asks this module before pushing a session
//      to work. A session that does not hold the live lock is treated as
//      paused — it refuses to drive the batch even if it exists by mistake.
//   4. An ACTIVE parallel-session DETECTOR: every top-level session start and
//      every tool call is recorded per session id; a second top-level session
//      with fresh tool activity in THIS repo is flagged, the owner is told to
//      verify repo consistency (scripts/batch-doctor.mjs), and the autostart
//      launcher kills a rogue spawn of its own making.
//
// Legacy compatibility: the lock file keeps the old `sessionId`/`claimedAt`
// fields (claimedAt doubles as the heartbeat), so a not-yet-updated reader
// still sees a fresh lock as "held". Pure decision logic is dependency-injected
// and Vitest-covered in scripts/batch-singleton-core.test.mjs.
import {
  appendFileSync,
  readFileSync,
  existsSync,
  openSync,
  closeSync,
  writeSync,
  rmSync,
  mkdirSync,
  rmdirSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { repoPath } from './repo-paths.mjs'
import { writeJsonAtomic, tryWriteJsonAtomic } from './atomic-write.mjs'
import {
  LEASE_MS,
  leaseExpired,
  renewedLock,
  renewalDecision,
  nextFence,
  grantedFenceState,
  normaliseFence,
} from './batch-lease-core.mjs'

// --- Constants (exported for tests and callers) -------------------------------

/** A heartbeat younger than this proves life outright — no pid probe needed,
 *  and a dead-looking pid within this grace is still treated as alive (the
 *  owner may be mid-acquisition or the probe raced a restart). */
export const DEAD_CONFIRM_MS = 5 * 60 * 1000
/** Legacy locks (no pid recorded) fall back to age-only liveness with this
 *  generous bound (the old STALE_MS). */
export const LEGACY_STALE_MS = 45 * 60 * 1000
/** One tick of the HoA-Batch-Autostart scheduled task. */
export const LAUNCHER_TICK_MS = 15 * 60 * 1000
/** A pending-spawn lock (launcher claimed, claude -p still booting) older than
 *  this with a dead child pid is reapable. */
export const PENDING_STALE_MS = 10 * 60 * 1000
/** After a HANDOVER (point 388) whose owning process is still ALIVE, the lock
 *  stays "alive" this long before the successor may take it. A headless `claude
 *  -p` — the batch's normal mode — exits at the boundary and is taken over at
 *  once by the dead-pid path, so this window only ever costs an interactive
 *  window something. It is one full launcher tick wide on purpose (four-eyes
 *  review, finding 1): the handover is withdrawn by the session's next tool
 *  call, and a session that neither ends nor calls a tool for a quarter of an
 *  hour does not exist. */
export const HANDOVER_GRACE_MS = 15 * 60 * 1000
/** Tool activity younger than this counts a session as "live" for the
 *  parallel-session detector. */
export const PARALLEL_FRESH_MS = 10 * 60 * 1000
/** A reap-mutex directory older than this belongs to a crashed reaper and may
 *  be cleared. */
export const REAP_MUTEX_STALE_MS = 60 * 1000
/** Start times within this tolerance count as the same process (pid reuse
 *  detection). */
export const PID_START_TOLERANCE_MS = 2000
/** How closely a live process's start time must match the moment the launcher
 *  recorded spawning it before it counts as THAT spawn (point 402, four-eyes
 *  finding 1.3). Windows recycles pids aggressively, and `lastPid` persists
 *  indefinitely: pid equality alone would let a days-old, long-exited spawn number
 *  be inherited by an INTERACTIVE window that the launcher would then kill. */
export const SPAWN_IDENTITY_TOLERANCE_MS = 60 * 1000

/**
 * EVERY state file this module writes, derived from ONE lock path. PURE.
 *
 * A caller that redirects the lock — a test into a temp directory, a sandbox —
 * redirects the whole family with it, and can therefore never reach into the
 * repository's live `.claude/`. That is not a nicety: on 28.07.2026 the unit
 * suite was found writing `WITHDRAWN point 388 by s1` into the REAL
 * `.claude/boundary.log`, because `withdrawHandover` defaulted its log path to
 * the repo while the test had redirected only the lock. The pre-push gate runs
 * that suite on every push, so a test run could withdraw a boundary a live
 * session had taken.
 */
export function statePathsFor(lockPath) {
  const dir = dirname(lockPath)
  return {
    lockPath,
    boundaryLogPath: join(dir, 'boundary.log'),
    boundaryPath: join(dir, 'batch-boundary.json'),
    inFlightPath: join(dir, 'batch-in-flight.json'),
    fencePath: join(dir, 'batch-fence.json'),
    claimPath: join(dir, 'batch-claim.json'),
    sessionsSeenPath: join(dir, 'sessions-seen.json'),
    activityPath: join(dir, 'session-activity.json'),
    alertPath: join(dir, 'parallel-alert.json'),
    doctorStatePath: join(dir, 'doctor-state.json'),
    ancestorCachePath: join(dir, 'session-process.json'),
  }
}

export const LOCK_PATH = repoPath('.claude/batch-lock.json')
const DEFAULT_PATHS = statePathsFor(LOCK_PATH)
export const SESSIONS_SEEN_PATH = DEFAULT_PATHS.sessionsSeenPath
export const SESSION_ACTIVITY_PATH = DEFAULT_PATHS.activityPath
export const PARALLEL_ALERT_PATH = DEFAULT_PATHS.alertPath
export const DOCTOR_STATE_PATH = DEFAULT_PATHS.doctorStatePath
export const BOUNDARY_LOG_PATH = DEFAULT_PATHS.boundaryLogPath
export const BOUNDARY_MARKER_PATH = DEFAULT_PATHS.boundaryPath
export const IN_FLIGHT_PATH = DEFAULT_PATHS.inFlightPath
export const CLAIM_PATH = DEFAULT_PATHS.claimPath
/** The fence's own file. NEVER deleted — not by a release, not by a takeover, not
 *  by the doctor. It is the only record that survives `acquire` unlinking the
 *  lock, and losing it is what would let a dispossessed session's writes back in. */
export const FENCE_PATH = DEFAULT_PATHS.fencePath
export const ANCESTOR_CACHE_PATH = DEFAULT_PATHS.ancestorCachePath

// --- Small IO helpers ----------------------------------------------------------

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}
// The atomic write RETRIES a Windows EPERM/EBUSY (scripts/atomic-write.mjs).
//
// THE MEASURED FAILURE (28.07.2026, five times in .claude/boundary.log, three of
// them at a boundary stop): `EPERM: operation not permitted, rename
// batch-lock.json.tmp-9904 -> batch-lock.json`. The rename that makes a lock
// update atomic is NOT atomic against another process holding the TARGET — and
// something reliably does, because the Stop chain rewrote this one small file
// three times within milliseconds (acquire's heartbeat, the guard's explicit
// heartbeat, then markHandover) and a real-time scanner opens each freshly
// renamed file to inspect it. The third write is the one that failed, and it was
// the handover.
//
// Two defences, and NOT a third: write the lock LESS (the redundant heartbeat is
// gone) and RETRY over the scanner's window. The write stays ATOMIC — tmp plus
// rename, never an in-place truncate — so a concurrent reader can never see half
// a lock (point 340). Where every attempt fails the tmp is removed and the error
// PROPAGATES: a heartbeat that did not land must never read as one that did,
// because `assessOwner` decides liveness on exactly that timestamp, and a run of
// silently swallowed failures would age a LIVE session toward "provably dead".
// The one caller that must not be taken down by the throw — the boundary branch
// of the Stop guard — converts it to data in `markHandover` instead.
//
// The litter of that failure mode is swept up too: fourteen orphaned
// `.claude/batch-lock.json.tmp-<pid>` files accreted in 76 minutes on
// 25.07.2026, one per failed write. `sweepableTmpFiles` below decides which may
// go — only those whose owning pid is provably dead and which have settled.

// --- Pure decision logic (dependency-injected, Vitest-covered) -----------------

/**
 * Assess whether the owner recorded in `lock` is alive. Conservative: only a
 * PROVABLY dead owner frees the lock. Inputs:
 *   lock  — parsed lock file ({ sessionId, claimedAt, pid?, pidStartedAt?, kind? })
 *   now   — epoch ms
 *   bootTime — epoch ms this machine booted (claude never survives a reboot)
 *   probe — { exists: boolean, startedAt: number|null } for lock.pid
 *           (pass null when no pid is recorded)
 * Returns { alive, reason }.
 *
 * ONE VERDICT, NOT THREE (point 434, docs/batch-resilience.md §6). This function
 * used to answer "is the owner alive" three ways at once: the pid probe, a
 * declared-work stall bound (`WORK_STALL_*`) and a heartbeat-age valve
 * (`WEDGED_MS`), each with its own threshold and its own review. All three tried
 * to INFER from silence what only the owner can state, and on the night of
 * 29./30.07.2026 all three read a seven-hour standstill as "owner alive". They
 * are gone. What replaces them is the LEASE: the owner says how long it means to
 * keep the batch by writing `leaseUntil` BEFORE each call, and this function only
 * compares that number to the clock. No probing, no evidence, no judgement — a
 * lease that ran out is over even if the process is still breathing (it keeps
 * running; it merely stops owning the batch, and learns that at its next hook).
 *
 * A LOCK WITHOUT `leaseUntil` IS NOT A SPECIAL CASE and needs no migration: it
 * reads as an implicit lease of `claimedAt + LEASE_MS` (`leaseUntilOf`), which is
 * the same shape the demolished age valve had. The live owner across this change
 * keeps working and writes a real lease at its next tool call.
 *
 * HANDOVER (point 388): a lock the owner itself marked handed-over at a VALID
 * point boundary reads NOT alive, even while its process still runs. That is the
 * one place where a live pid does not mean a live owner — and it is not a
 * heuristic like the age window that caused the e9407cae incident, but the
 * owner's own statement, written only after the Stop hook confirmed a fresh
 * session-bound marker, a verifiably closed point and an armed launcher. Two
 * conditions keep it honest:
 *   - `claimedAt <= handedOverAt`: the PostToolUse heartbeat stamps claimedAt on
 *     EVERY tool call, so a session that did NOT actually stop (a later Stop hook
 *     in the chain blocked the turn end) withdraws its own handover at its next
 *     tool call. No mutation, just a comparison.
 *   - while the pid is still alive the successor waits HANDOVER_GRACE_MS, so a
 *     session mid-shutdown is never raced.
 */
export function assessOwner(lock, { now, bootTime, probe, leaseMs = LEASE_MS } = {}) {
  if (!lock || typeof lock.claimedAt !== 'number') {
    return { alive: false, reason: 'no-lock' }
  }
  if (lock.handedOver === true && typeof lock.handedOverAt === 'number' && lock.claimedAt <= lock.handedOverAt) {
    const pidGone = probe ? probe.exists !== true : false
    if (pidGone || now - lock.handedOverAt >= HANDOVER_GRACE_MS) {
      return { alive: false, reason: 'handed-over' }
    }
    return { alive: true, reason: 'handover-grace' }
  }
  const age = now - lock.claimedAt
  // Fresh heartbeat proves life — REBOOT IS NOT SUFFICIENT to declare death
  // when a fresh heartbeat exists (a re-claimed post-boot session writes one).
  if (age < DEAD_CONFIRM_MS) return { alive: true, reason: 'fresh-heartbeat' }
  // A heartbeat from BEFORE this boot cannot have a living writer: no claude
  // process survives a reboot. (A live re-claimed session would have written a
  // post-boot heartbeat, caught above.)
  if (typeof bootTime === 'number' && lock.claimedAt < bootTime) {
    return { alive: false, reason: 'heartbeat-predates-boot' }
  }
  // THE LEASE, and it outranks the pid: a live process whose lease ran out no
  // longer owns the batch. This is the whole of point 434's layer 1 — nothing is
  // inferred from the silence, the owner simply stopped saying it was still
  // there. Nothing is killed here or anywhere else.
  if (leaseExpired(lock, { now, leaseMs })) return { alive: false, reason: 'lease-expired' }
  const kind = lock.kind === 'pending-spawn' ? 'pending-spawn' : 'session'
  const pid = typeof lock.pid === 'number' && lock.pid > 0 ? lock.pid : null
  if (pid === null) {
    // Legacy lock (claimed before pids were recorded) — the lease above is the
    // only bound it has, and this shorter one applies to a launcher's pending
    // spawn that never came up.
    const stale = kind === 'pending-spawn' ? PENDING_STALE_MS : LEGACY_STALE_MS
    return age <= stale ? { alive: true, reason: 'legacy-fresh' } : { alive: false, reason: 'legacy-stale' }
  }
  if (!probe || probe.exists !== true) {
    // The owning process no longer exists → provably dead (past the grace).
    return { alive: false, reason: 'pid-dead' }
  }
  if (
    typeof lock.pidStartedAt === 'number' &&
    typeof probe.startedAt === 'number' &&
    Math.abs(probe.startedAt - lock.pidStartedAt) > PID_START_TOLERANCE_MS
  ) {
    // A pid exists but it is a DIFFERENT process (pid reuse) → owner dead.
    return { alive: false, reason: 'pid-reused' }
  }
  // Pid alive, the same process, and the lease still runs: ALIVE, no matter how
  // old the heartbeat — a long tool call starves the heartbeat but not the
  // process. This is the exact fix for the 24.07 incident (heartbeat 24 min
  // stale, session mid-turn, launcher double-spawned), and the lease above is
  // what keeps it from meaning "alive forever".
  return { alive: true, reason: 'pid-alive' }
}

/**
 * DOES THIS LOCK BELONG TO THE PROCESS WE RUN UNDER? PURE.
 *
 * The session id is not a stable identity: a context compaction mints a new one
 * while the lock keeps the old, and every ownership-gated guard would then read
 * the owner as foreign and stand down. The PROCESS is stable — a compaction
 * happens inside one `claude.exe` — and the lock already records `pid` and
 * `pidStartedAt`, so it can answer the question the id cannot.
 *
 * This must NEVER widen into "any live process owns it": a genuinely second
 * window is exactly what the singleton exists to detect, and it has its own
 * claude process. So ownership by process requires the recorded pid to be OUR
 * OWN ancestor AND its start time to match — a reused pid is a different
 * process. Where the platform cannot tell us (no ancestor resolvable, no start
 * time recorded), the answer is NO and the session id decides exactly as before.
 * Being wrong toward "not mine" costs a stand-down; being wrong the other way
 * costs the incident this module was written for.
 *
 * Returns { mine, via, restamp }.
 */
export function resolveOwnership({ lock, sessionId, ancestor, tolerance = PID_START_TOLERANCE_MS }) {
  const no = (via) => ({ mine: false, via, restamp: false })
  if (!lock || typeof lock.sessionId !== 'string') return no('no-lock')
  // A PROBE IS NEVER MINE (point 434 (8)). This is the door the false alarm came
  // through: five registered gathers ask `heldByOtherLiveOwner('preflight-test')`,
  // and when the BATCH OWNER runs the unit suite in its own tree, the Vitest
  // process's claude ancestor IS the lock's pid — so ownership resolved `via:
  // 'process'` and the restamp below rewrote the LIVE lock's sessionId to
  // `preflight-test`. The launcher then read `owner=preflight-test` beside the
  // real session and reported a parallel batch. Refused here, in the pure
  // resolver, so every door that asks — ownsLock, heldByOtherLiveOwner, acquire —
  // gets the same answer.
  if (isProbeSessionId(sessionId)) return no('probe-id')
  if (sessionId && lock.sessionId === sessionId) return { mine: true, via: 'session-id', restamp: false }
  if (!sessionId) return no('no-session-id')
  // A launcher's pending-spawn lock names a process that is not this session's
  // to claim; convertPendingSpawn is the only door into it.
  if (lock.kind === 'pending-spawn') return no('pending-spawn')
  if (typeof lock.pid !== 'number' || lock.pid <= 0) return no('lock-without-pid')
  if (!ancestor || typeof ancestor.pid !== 'number' || ancestor.pid <= 0) return no('process-unknown')
  if (ancestor.pid !== lock.pid) return no('other-process')
  if (typeof lock.pidStartedAt !== 'number' || typeof ancestor.startedAt !== 'number') {
    return no('start-time-unknown')
  }
  if (Math.abs(ancestor.startedAt - lock.pidStartedAt) > tolerance) return no('pid-reused')
  return { mine: true, via: 'process', restamp: true }
}

/**
 * WHICH ORPHANED TMP FILES MAY BE SWEPT (point 340 (b)). PURE.
 *
 * Fourteen `.claude/batch-lock.json.tmp-<pid>` files accreted between 19:36 and
 * 20:52 on 25.07.2026 — one per rename that lost to a sharing violation. The
 * litter is harmless in itself; sweeping it wrongly is not, so two conditions
 * must BOTH hold: the pid encoded in the name is provably dead, and the file has
 * settled (the reap-mutex age gate). A live process mid-write must never have its
 * tmp taken from under it.
 *
 * Inputs are plain data:
 *   entries  — [{ name, mtimeMs }] of the lock's directory
 *   lockName — basename of the lock file
 *   now, staleMs
 *   probe    — (pid) => { exists }
 */
export function sweepableTmpFiles({ entries, lockName, now, probe, staleMs = REAP_MUTEX_STALE_MS }) {
  // Both shapes the writer has produced: `<lock>.tmp-<pid>` and, since the retry
  // gives every attempt its own name, `<lock>.tmp-<pid>-<attempt>`.
  const re = new RegExp(`^${String(lockName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.tmp-(\\d+)(?:-\\d+)?$`)
  const out = []
  for (const entry of entries ?? []) {
    const m = String(entry?.name ?? '').match(re)
    if (!m) continue
    if (!(typeof entry.mtimeMs === 'number' && now - entry.mtimeMs > staleMs)) continue
    if (probe(Number(m[1]))?.exists === true) continue
    out.push(entry.name)
  }
  return out
}

/**
 * Launcher decision: may the autostart spawn a takeover session?
 * Returns 'spawn' | 'skip-alive'.
 *
 * THE THIRD OUTCOME IS GONE (point 434). 'skip-wedged' named a session that was
 * alive AND stuck, and everything downstream of it — `wedgeAction`,
 * `wedgeTakeover`, `takeWedged`, the two-stage silence report — existed to decide
 * what to do about a state the launcher could describe but not resolve. An
 * expired lease is not a third state: it is simply not alive, and the ordinary
 * takeover this function has always licensed handles it.
 */
export function spawnDecision(assessment) {
  return assessment.alive ? 'skip-alive' : 'spawn'
}

/**
 * IS THIS LIVE PROCESS THE SPAWN THE LAUNCHER RECORDED? PURE.
 *
 * A PID IS NOT AN IDENTITY (four-eyes review 28.07.2026, finding 1.3). The
 * launcher's `state.lastPid` persists indefinitely and carries no start time, and
 * Windows recycles pids aggressively: a days-old spawn exits, an INTERACTIVE
 * window later inherits that number and takes the batch lock, and every "we may
 * reap our own spawn" path would then kill the user's own window — the one thing
 * this module exists to make impossible. So the pid must be matched by the pid AND
 * by the process start time against the moment the spawn was recorded, exactly the
 * way `assessOwner` already matches `lock.pidStartedAt`.
 *
 * Inputs: the live process's { exists, startedAt } probe, the pid on the lock (or
 * whichever pid is being considered), and the launcher's recorded lastSpawnPid /
 * lastSpawnAt. A start time that cannot be established answers NO — an
 * unverifiable identity is never a licence to kill.
 */
export function isOwnSpawn({
  pid,
  probe,
  lastSpawnPid,
  lastSpawnAt,
  toleranceMs = SPAWN_IDENTITY_TOLERANCE_MS,
} = {}) {
  if (!(typeof pid === 'number' && pid > 0)) return false
  if (!(typeof lastSpawnPid === 'number' && lastSpawnPid > 0)) return false
  if (pid !== lastSpawnPid) return false
  if (!(typeof lastSpawnAt === 'number' && lastSpawnAt > 0)) return false
  if (!probe || probe.exists !== true) return false
  if (typeof probe.startedAt !== 'number') return false
  return Math.abs(probe.startedAt - lastSpawnAt) <= toleranceMs
}

/** After how many IDENTICAL consecutive verdicts the repetition itself is the
 *  signal (point 433 (c)). Two, i.e. the second identical tick — 30 minutes at the
 *  launcher's cadence — because eight identical lines is what the incident cost. */
export const VERDICT_REPEAT_ESCALATE_AT = 2

/**
 * REPETITION IS THE SIGNAL (point 433 (c)). PURE.
 *
 * What reads identically eight times is not truer the ninth, only dearer. Given
 * the verdict's key, the key last seen and how often it had repeated, this decides
 * whether to escalate (exactly once, at the Nth identical reading) and whether the
 * plain line may still be logged.
 *
 * IT SURVIVED THE DEMOLITION of the wedge ladder (point 434) because the failure it
 * answers is not the wedge but the REPORT: a launcher that reads the same thing
 * every tick and keeps saying it. Its input is now the ordinary liveness verdict —
 * a takeover that does not take, tick after tick, is exactly what a person needs
 * to hear about.
 *
 * Returns { key, repeats, escalate, suppressLog }.
 */
export function verdictRepeat({ key, lastKey, repeats = 0, escalateAt = VERDICT_REPEAT_ESCALATE_AT } = {}) {
  const k = typeof key === 'string' ? key : ''
  if (!k) return { key: '', repeats: 0, escalate: false, suppressLog: false }
  if (k !== lastKey) return { key: k, repeats: 1, escalate: false, suppressLog: false }
  const n = (Number.isFinite(repeats) && repeats > 0 ? repeats : 0) + 1
  return { key: k, repeats: n, escalate: n === escalateAt, suppressLog: n > escalateAt }
}

/**
 * The identity of ONE owner at ONE heartbeat: owner + pid + the moment it last
 * moved. Keying a report on this states it exactly once per genuine episode — the
 * key holds still across the launcher's 15-minute ticks (claimedAt does not move
 * while nobody works), and a later episode of the same session gets a new key.
 */
export function ownerStateKey(lock, suffix = '') {
  if (!lock || !lock.sessionId || typeof lock.claimedAt !== 'number') return ''
  return `${lock.sessionId}#${lock.pid ?? 'nopid'}#${lock.claimedAt}${suffix ? `#${suffix}` : ''}`
}


/**
 * A SESSION ID THIS REPOSITORY'S OWN PROBES USE, never a real session. PURE.
 *
 * THE ALARM IT CAUSED (point 434 (8), root-caused 30.07.2026 and CORRECTED by the
 * four-eyes review): the guard preflight's real-repo test runs every registered
 * guard's `gather()` under the synthetic id `preflight-test`, and five of those
 * gathers ask `heldByOtherLiveOwner('preflight-test')`. When the session that OWNS
 * the batch runs the unit suite in its own tree — the fast gate after every merge —
 * the Vitest process's claude ancestor is exactly the lock's pid, so ownership
 * resolved `via: 'process'` and `ownsLock` RESTAMPED the live lock's sessionId to
 * `preflight-test`. The launcher then read `owner=preflight-test` beside the real
 * session and logged `PARALLEL SESSIONS DETECTED`, sixteen times across four nights.
 * That alert is one of the few that mean "stop everything", so a probe of our own
 * must not be able to raise it.
 *
 * (The first reading of this — that `acquire` handed a probe the free lock from a
 * guard's gather — was WRONG: `batch-progress-guard` is not a registered preflight
 * guard and its `acquire` is on its own Stop path. The restamp above is the path
 * that exists, and it needs no free lock, which fits the frequency far better.)
 *
 * A real session id is a UUID and can never carry this prefix, so the namespace is
 * reserved rather than shared. Three consequences: `resolveOwnership` never answers
 * "mine" for a probe (so nothing restamps a lock to one), `acquire` refuses it the
 * lock outright, and the classifier below is blind to one on either side.
 */
export const PROBE_SESSION_PREFIX = 'preflight-'

export function isProbeSessionId(sid) {
  return typeof sid === 'string' && sid.trim().toLowerCase().startsWith(PROBE_SESSION_PREFIX)
}

/**
 * Parallel-session classifier. A parallel session is a sid that
 *   - started as a TOP-LEVEL session (recorded by the SessionStart hook —
 *     subagents/worktree agents never fire SessionStart, so they can never be
 *     flagged),
 *   - is not the owner,
 *   - has tool activity fresher than PARALLEL_FRESH_MS.
 * Inputs are plain maps: sessionsSeen { sid: firstSeenAt },
 * activity { sid: lastToolAt }.
 *
 * `exclude` names sessions that are second by DESIGN rather than by accident —
 * today exactly one: the window that has CLAIMED the batch through the sanctioned
 * channel (point 395). It is a live top-level session with fresh tool activity, so
 * it matches this classifier exactly, and flagging it would raise a
 * parallel-session alert that blocks the owner's turn end — and the block demands
 * the doctor, which is the one thing the handover then never gets past. A session
 * that announced itself in the open is not the covert second driver this detector
 * was written for.
 */
export function classifyParallel({ sessionsSeen, activity, ownerSid, now, exclude = [] }) {
  const out = []
  const skip = new Set((exclude ?? []).filter(Boolean))
  // A PROBE OWNER MEANS THE REAL OWNER IS UNKNOWN (point 434 (8)): every genuine
  // session would then read as the second driver, which is the false alarm itself.
  if (isProbeSessionId(ownerSid)) return out
  for (const [sid, lastToolAt] of Object.entries(activity ?? {})) {
    if (!sid || sid === ownerSid || skip.has(sid) || isProbeSessionId(sid)) continue
    if (!(sessionsSeen && Object.prototype.hasOwnProperty.call(sessionsSeen, sid))) continue
    if (typeof lastToolAt !== 'number' || now - lastToolAt > PARALLEL_FRESH_MS) continue
    out.push({ sid, lastToolAt })
  }
  return out
}

/**
 * The batch-progress-guard's decision, pure. Returns one of:
 *   'allow'            — paused / batch complete / nothing to enforce
 *   'stand-down'       — this session must NOT drive the batch (not the owner)
 *   'block-remediate'  — owner + parallel session detected → verify first
 *   'allow-boundary'   — owner at a POINT BOUNDARY with an ARMED launcher: ending
 *                        here is the intended behaviour (point 373), not an idle
 *                        stop — the OS task brings up a fresh session
 *   'block-launcher'   — a boundary was claimed but the launcher is not armed, so
 *                        nothing would restart the batch: keep working
 *   'block-take-boundary' — owner, a point closed IN THIS SESSION and no marker:
 *                        the boundary is DUE and must be TAKEN, not offered
 *                        (point 388) — block, naming the one command
 *   'allow-release'    — owner with an honoured CLAIM at a CLEAN moment (point
 *                        395): the user took the batch back into the window they
 *                        are sitting at. Release the lock and end here
 *   'allow-in-flight'  — owner WAITING on work it has declared and that is
 *                        provably still running (point 388, fifth live finding):
 *                        the turn may end, the lock stays held, nothing is handed
 *                        over. The session is waiting, not idling
 *   'block-continue'   — owner + open points → keep working
 *   'block-format'     — TASKS.md unparseable → warn, never read as complete
 *
 * `boundary`/`launcher` come from scripts/batch-boundary-core.mjs
 * (`assessBoundary`, `classifyLauncherState`); `inFlight` from
 * scripts/batch-in-flight-core.mjs (`assessInFlight`). Omitting any of them keeps
 * the old behaviour exactly, which is what every ordinary turn end wants.
 */
export function progressGuardDecision({
  sid,
  paused,
  openCount,
  formatSuspect,
  ownership, // 'mine' | 'held' | 'acquired' | 'lost-race' | 'none'
  unhandledAlert,
  boundary = null, // { valid, point, reason } | null
  launcher = 'unknown', // 'armed' | 'disabled' | 'unknown'
  boundaryDue = null, // point number closed in THIS session without a marker | null
  inFlight = false, // declared work PROVEN still running (assessInFlight().live)
  slotsNeedReason = false, // free pool slots + an independent queued point + no reason (point 427)
  claim = 'none', // 'none' | 'wait' | 'release' from batch-claim-core's releaseDecision
}) {
  if (paused) return 'allow'
  if (formatSuspect) return 'block-format'
  if (openCount === 0) return 'allow'
  // No sid → ownership unprovable → never conscript this session. The OS
  // launcher is the backstop that guarantees batch progress, so erring toward
  // stand-down is safe; erring toward blocking conscripted second sessions
  // (that was one of the incident's advisory holes).
  if (!sid) return 'stand-down'
  if (ownership !== 'mine' && ownership !== 'acquired') return 'stand-down'
  if (unhandledAlert) return 'block-remediate'
  // THE USER TOOK THE BATCH BACK (point 395). Ahead of the boundary on purpose:
  // where both apply the session is finished either way, and handing the batch to
  // the window the user is sitting at beats handing it to the launcher. The
  // 'wait' verdict deliberately falls through to the ordinary decisions — a
  // release is only ever offered at a moment `releaseDecision` has judged CLEAN,
  // so a merge, a building agent or a running verification is never cut in half.
  if (claim === 'release') return 'allow-release'
  // The point boundary (point 373). A valid boundary is only ever honoured with
  // an armed launcher — an unarmed one would turn "end the session" into "end the
  // batch", so it blocks instead. An INVALID claim falls through to the ordinary
  // block: the work order, not the marker, decides whether a point is closed.
  if (boundary && boundary.valid) return launcher === 'armed' ? 'allow-boundary' : 'block-launcher'
  // A DUE boundary without a marker (point 388): the permission of point 373 was
  // never taken up, and the session simply sat there holding the lock. Both
  // verdicts block, so a false positive costs a wrong message and nothing more —
  // but a true one now names the single command that hands the batch over.
  // WAITING IS NOT IDLING (fifth live finding). The two blocks below both tell
  // the session to do something it may be unable to do — continue the next queue
  // item while the agent pool is at its cap, or take a boundary while delegated
  // agents are still building (ending would throw their work away). A DECLARED
  // wait whose evidence a probe still confirms therefore passes both, and only
  // those two: a parallel-session alert still blocks (remediation cannot wait),
  // an unarmed launcher still blocks, and a VALID boundary still hands over —
  // there the session already decided it is finished.
  //
  // The declaration cannot become a way to switch the block off: it is bounded by
  // its own expiry and by evidence that has to keep checking out (assessInFlight),
  // and the lock stays HELD, so no successor is spawned beside a waiting session.
  //
  // …BUT THE CAP IS ALSO A TARGET (point 427). A session that commissions ONE point
  // and then declares a wait breaks no rule — the cap is an upper bound and nothing
  // checked the lower one — so one agent built while two slots stood empty for ninety
  // minutes with a queue full of independent points. The wait is therefore allowed
  // only once the idle slots are accounted for: either the pool is at its cap, the
  // queue's remaining points all touch the running branch, the batch is paused, a
  // closing freeze is recorded, or the declaration carries a written reason.
  if (inFlight === true) return slotsNeedReason === true ? 'block-slots-free' : 'allow-in-flight'
  if (Number.isInteger(boundaryDue) && boundaryDue > 0) return 'block-take-boundary'
  return 'block-continue'
}

// --- OS probes -----------------------------------------------------------------

export function bootTimeMs() {
  return Date.now() - Math.round(os.uptime() * 1000)
}

/** Does `pid` exist, and when did it start? startedAt is best-effort (null when
 *  the OS query fails); exists is from a real signal-0 probe. */
export function probePid(pid) {
  if (typeof pid !== 'number' || pid <= 0) return { exists: false, startedAt: null }
  let exists
  try {
    process.kill(pid, 0)
    exists = true
  } catch (e) {
    exists = !!(e && e.code === 'EPERM') // EPERM = exists, no permission
  }
  if (!exists) return { exists: false, startedAt: null }
  return { exists: true, startedAt: processStartTime(pid) }
}

/** Cheap existence-only probe (no OS start-time query) for hot paths like the
 *  per-turn guard gate: an alive pid counts as alive (no pid-reuse check —
 *  conservative toward stand-down, which is the safe direction for guards). */
export function cheapProbePid(pid) {
  if (typeof pid !== 'number' || pid <= 0) return { exists: false, startedAt: null }
  try {
    process.kill(pid, 0)
    return { exists: true, startedAt: null }
  } catch (e) {
    return { exists: !!(e && e.code === 'EPERM'), startedAt: null }
  }
}

/** Epoch ms the process started, or null. Windows: PowerShell FileTime. */
export function processStartTime(pid) {
  if (process.platform !== 'win32') {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
      const startJiffies = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19])
      const uptimeS = Number(readFileSync('/proc/uptime', 'utf8').split(' ')[0])
      const hz = 100
      return Date.now() - Math.round((uptimeS - startJiffies / hz) * 1000)
    } catch {
      return null
    }
  }
  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `(Get-Process -Id ${Number(pid)}).StartTime.ToFileTimeUtc()`],
      { windowsHide: true, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    const ft = Number(out)
    if (!Number.isFinite(ft) || ft <= 0) return null
    return Math.round((ft - 116444736000000000) / 10000)
  } catch {
    return null
  }
}

/** Find the claude process that owns this hook invocation: walk the parent
 *  chain (hook = node, spawned by a shell, spawned by claude). Returns
 *  { pid, startedAt } or null. Called at ACQUISITION only (one PowerShell
 *  round-trip), never on the per-tool-call heartbeat path. */
export function findClaudeAncestor() {
  if (process.platform !== 'win32') {
    try {
      let pid = process.ppid
      for (let i = 0; i < 10 && pid > 1; i++) {
        const comm = readFileSync(`/proc/${pid}/comm`, 'utf8').trim()
        if (/claude/i.test(comm)) return { pid, startedAt: processStartTime(pid) }
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
        pid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
      }
    } catch {
      /* fall through */
    }
    return null
  }
  try {
    const script =
      `$id=${Number(process.ppid)};` +
      `for($i=0;$i -lt 10 -and $id -gt 0;$i++){` +
      `$p=Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue;` +
      `if(-not $p){break};` +
      `if($p.Name -match 'claude'){Write-Output ("$($p.ProcessId)|$($p.CreationDate.ToFileTimeUtc())");break};` +
      `$id=$p.ParentProcessId}`
    const out = execFileSync('powershell', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const m = out.match(/^(\d+)\|(\d+)$/m)
    if (!m) return null
    return { pid: Number(m[1]), startedAt: Math.round((Number(m[2]) - 116444736000000000) / 10000) }
  } catch {
    return null
  }
}

// --- The lock ------------------------------------------------------------------

export function readOwnerLock(lockPath = LOCK_PATH) {
  const lock = readJson(lockPath)
  if (lock && typeof lock.claimedAt === 'number' && typeof lock.sessionId === 'string') return lock
  return null
}

function tryExclusiveCreate(lockPath, payload) {
  try {
    const fd = openSync(lockPath, 'wx')
    writeSync(fd, JSON.stringify(payload, null, 2))
    closeSync(fd)
    return true
  } catch {
    return false
  }
}

/**
 * Remove the tmp files a failed rename left behind (point 340 (b)). Best effort
 * and never throws: it is housekeeping, and the acquire it rides along with must
 * not fail over litter. Returns the names removed.
 */
export function sweepOrphanTmp(lockPath, opts = {}) {
  try {
    const dir = dirname(lockPath)
    const lockName = lockPath.slice(dir.length + 1)
    const entries = (opts.readDir ?? defaultReadDir)(dir)
    const doomed = sweepableTmpFiles({
      entries,
      lockName,
      now: opts.now ?? Date.now(),
      probe: opts.probePidFn ?? cheapProbePid,
      staleMs: opts.staleMs ?? REAP_MUTEX_STALE_MS,
    })
    const removed = []
    for (const name of doomed) {
      try {
        ;(opts.remove ?? rmSync)(join(dir, name), { force: true })
        removed.push(name)
      } catch {
        /* someone else got there first, or it is held — try again next time */
      }
    }
    return removed
  } catch {
    return []
  }
}

const defaultReadDir = (dir) =>
  readdirSync(dir).map((name) => {
    let mtimeMs = 0
    try {
      mtimeMs = statSync(join(dir, name)).mtimeMs
    } catch {
      mtimeMs = Date.now() // vanished mid-scan → treat as fresh, i.e. spare it
    }
    return { name, mtimeMs }
  })

function enterReapMutex(mutexPath) {
  try {
    mkdirSync(mutexPath)
    return true
  } catch {
    // Held by another reaper. If it is stale (crashed reaper), clear and retry
    // ONCE — mkdir stays the atomic point, so two clearers still race to one
    // winner.
    try {
      const st = statSync(mutexPath)
      if (Date.now() - st.mtimeMs > REAP_MUTEX_STALE_MS) {
        rmdirSync(mutexPath)
        mkdirSync(mutexPath)
        return true
      }
    } catch {
      // raced away — one more direct attempt
      try {
        mkdirSync(mutexPath)
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

function exitReapMutex(mutexPath) {
  try {
    rmdirSync(mutexPath)
  } catch {
    /* already gone */
  }
}

/**
 * ATOMIC acquisition. Returns 'acquired' | 'mine' | 'held' | 'lost-race'.
 *   - 'acquired'  — this session now owns the batch.
 *   - 'mine'      — it already did (heartbeat refreshed).
 *   - 'held'      — a (provably or possibly) live other owner exists. STAND DOWN.
 *   - 'lost-race' — a concurrent starter won. STAND DOWN.
 * Options: { kind, pid, pidStartedAt, now, deps } — deps override probes for tests.
 *
 * THERE IS NO `takeWedged` ANY MORE (point 434). A wedged owner used to be a case
 * the caller had to ASK for, having first proved it with a second mechanism; an
 * owner whose lease ran out is simply not alive, so the ordinary door lets the
 * successor in. Everything about the atomicity is unchanged — the takeover runs
 * through the SAME reap mutex and re-reads the lock INSIDE it, so two starters can
 * never both win and a lock that came back to life in the race window (a renewal
 * landed) keeps its owner. Nothing is killed here; the dispossessed process keeps
 * running and stands down at its next hook.
 *
 * EVERY SUCCESSFUL ACQUISITION TAKES A FENCE NUMBER, granted under that same
 * mutex where the takeover path holds it. The number goes into the never-deleted
 * fence file AND onto the lock, which is what lets the mark be re-seeded upward
 * if the fence file is ever lost.
 */
export function acquire(sessionId, opts = {}) {
  if (!sessionId) return 'held'
  // A PROBE IS NOT A SESSION (point 434 (8)): it may never own the batch. See
  // `isProbeSessionId` for the four nights of false alarms this cost.
  if (isProbeSessionId(sessionId)) return 'probe'
  const lockPath = opts.lockPath ?? LOCK_PATH
  const mutexPath = `${lockPath}.reaping`
  const now = opts.now ?? Date.now()
  const deps = {
    bootTime: opts.bootTime ?? bootTimeMs(),
    probePid: opts.probePidFn ?? probePid,
    findAncestor: opts.findAncestorFn ?? findClaudeAncestor,
  }
  const fencePath = opts.fencePath ?? statePathsFor(lockPath).fencePath
  // The fence the OUTGOING lock carried, if any: the seed that keeps the mark from
  // falling if the fence file was lost (see `nextFence`). Read before the create,
  // because the create is what replaces the lock it comes from.
  let priorFence = null
  const identity = (fence) => {
    // Resolve the owning claude process once, at acquisition.
    const anc = opts.pid ? { pid: opts.pid, startedAt: opts.pidStartedAt ?? null } : deps.findAncestor()
    return {
      v: 2,
      sessionId,
      kind: opts.kind ?? 'session',
      startedAt: now,
      claimedAt: now, // legacy heartbeat field
      acquiredAt: now,
      // The lease starts full: the acquiring session owns the batch for one whole
      // window before it has to say anything, which is what a booting session
      // needs before its first PreToolUse call.
      leaseUntil: now + (opts.leaseMs ?? LEASE_MS),
      fence,
      pid: anc ? anc.pid : null,
      pidStartedAt: anc ? anc.startedAt : null,
      ...(opts.extra ?? {}),
    }
  }
  /**
   * Win the lock, THEN take the fence number. The order is the whole safety
   * argument: two starters race here (a launcher and a session do so routinely),
   * and a LOSER that had already granted itself a higher number would fence the
   * true owner out of its own batch — the exact inversion this mechanism exists
   * to prevent. So only the winner of the exclusive create ever grants, and it
   * pays for a second write of the lock to stamp the number on it.
   *
   * A fence file that cannot be written does NOT cost the acquisition: the lock is
   * the authority on ownership, the fence only on supersession, and a fence
   * nobody could record simply blocks nobody (fail-open, as everywhere here).
   */
  const claim = () => {
    if (!tryExclusiveCreate(lockPath, identity(null))) return false
    try {
      const fence = grantFence(sessionId, { fencePath, priorFence, now })
      const fresh = readOwnerLock(lockPath)
      if (fence !== null && fresh && fresh.sessionId === sessionId) {
        writeJsonAtomic(lockPath, { ...fresh, fence }, opts)
      }
    } catch {
      /* see above — an unrecordable fence never fails an acquisition */
    }
    return true
  }

  // Sweep the litter of past failed writes (point 340 (b)) — only tmp files
  // whose owning pid is provably dead and which have settled. Best effort, and
  // deliberately here: acquisition is the one moment that is already doing lock
  // housekeeping, and it is not on the per-tool-call hot path.
  if (opts.sweep !== false) sweepOrphanTmp(lockPath, opts)

  // Fast path: no lock → exclusive create (test-and-set; one winner).
  if (!existsSync(lockPath)) {
    if (claim()) return 'acquired'
  }

  const lock = readOwnerLock(lockPath)
  if (lock && typeof lock.fence === 'number') priorFence = lock.fence
  // Ours by id, or ours by PROCESS under a session id a compaction renamed. The
  // restamp inside ownsLock puts the current id back on the lock, so this is the
  // one place that pays for the ancestor walk.
  if (lock && ownsLock(sessionId, { ...opts, lockPath, lock, now }).mine) {
    heartbeat(sessionId, { lockPath, now })
    return 'mine'
  }
  if (lock) {
    const probe = lock.pid ? deps.probePid(lock.pid) : null
    if (assessOwner(lock, { now, bootTime: deps.bootTime, probe, leaseMs: opts.leaseMs }).alive) return 'held'
  } else {
    // Unreadable/corrupt lock file: reap only if it has settled (not mid-write).
    try {
      const st = statSync(lockPath)
      if (now - st.mtimeMs < REAP_MUTEX_STALE_MS) return 'held'
    } catch {
      // vanished between the existsSync and here — retry the fast path once
      if (claim()) return 'acquired'
      return 'lost-race'
    }
  }

  // Not alive (dead pid, predates the boot, or the LEASE ran out) → takeover under
  // the reap mutex (atomic mkdir): only ONE process at a time may unlink+recreate,
  // and it re-reads the lock inside the mutex so it can never clobber a lock that
  // came back to life in the race window — a lease renewal that landed a moment
  // ago reads alive here and keeps its owner.
  if (!enterReapMutex(mutexPath)) return 'held'
  try {
    const recheck = readOwnerLock(lockPath)
    if (recheck) {
      if (recheck.sessionId === sessionId) {
        heartbeat(sessionId, { lockPath, now })
        return 'mine'
      }
      const probe = recheck.pid ? deps.probePid(recheck.pid) : null
      if (assessOwner(recheck, { now, bootTime: deps.bootTime, probe, leaseMs: opts.leaseMs }).alive) return 'held'
      if (typeof recheck.fence === 'number') priorFence = recheck.fence
    }
    try {
      rmSync(lockPath, { force: true })
    } catch {
      return 'lost-race'
    }
    if (claim()) return 'acquired'
    return 'lost-race'
  } finally {
    exitReapMutex(mutexPath)
  }
}

// --- The fence -----------------------------------------------------------------

/**
 * Read the fence file. Never throws: a missing or torn file reads as "nothing
 * known" (fence 0, no holders), which blocks nobody — the deliberate fail-open
 * direction, because over-blocking a session costs a block-loop and under-blocking
 * costs at worst a stale board.
 */
export function readFence(opts = {}) {
  return normaliseFence(readJson(opts.fencePath ?? FENCE_PATH))
}

/**
 * Grant the next fence number to `sessionId`. Returns the number, or null when it
 * could not be recorded.
 *
 * Called ONLY from `acquire`/`convertPendingSpawn`, and there only by the winner
 * of the exclusive create — which is what serialises it: at most one process at a
 * time holds the lock this grant belongs to, and the takeover path additionally
 * holds the reap mutex. Monotonic and max-wins (`nextFence`, `grantedFenceState`),
 * seeded from the outgoing lock's own copy so that losing the file cannot walk the
 * mark backwards.
 *
 * THE FILE IS NEVER DELETED — not by `release`, not by a takeover, not by the
 * doctor. It is the one record that outlives `acquire` unlinking the lock.
 */
export function grantFence(sessionId, opts = {}) {
  try {
    const fencePath = opts.fencePath ?? FENCE_PATH
    const now = opts.now ?? Date.now()
    const state = normaliseFence(readJson(fencePath))
    const fence = nextFence({ fenceState: state, priorFence: opts.priorFence })
    writeJsonAtomic(fencePath, grantedFenceState({ fenceState: state, sessionId, fence, now }), opts)
    return fence
  } catch {
    return null
  }
}

// --- The lease -----------------------------------------------------------------

/**
 * RENEW THIS SESSION'S LEASE. Called from the PreToolUse chokepoint — BEFORE the
 * call, never after it (docs/batch-resilience.md §3, layer 1): the PostToolUse
 * heartbeat fires when a call RETURNS, so a lease renewed there would have to
 * outlive the longest single call, and this repository legitimately runs 30-40
 * minute suites. Renewing first is what keeps a running verification from ever
 * being shot in the back.
 *
 * Owner-guarded exactly like `heartbeat`, refused under a stale fence, and rate-
 * limited to one write per `LEASE_RENEW_INTERVAL_MS` — this file is on the
 * per-tool-call path and has a measured history of losing renames when it is
 * written too often (see the note above `readJson`).
 *
 * Returns { renewed, reason, leaseUntil }. Never throws.
 */
export function renewLease(sessionId, opts = {}) {
  try {
    const lockPath = opts.lockPath ?? LOCK_PATH
    const now = opts.now ?? Date.now()
    const lock = readOwnerLock(lockPath)
    const decision = renewalDecision({
      lock,
      sessionId,
      fenceState: readFence({ fencePath: opts.fencePath ?? statePathsFor(lockPath).fencePath }),
      now,
      leaseMs: opts.leaseMs,
      renewIntervalMs: opts.renewIntervalMs,
    })
    if (!decision.renew) {
      return { renewed: false, reason: decision.reason, leaseUntil: lock?.leaseUntil ?? null }
    }
    const next = renewedLock(lock, { now, leaseMs: opts.leaseMs })
    writeJsonAtomic(lockPath, next, opts)
    return { renewed: true, reason: 'renewed', leaseUntil: next.leaseUntil }
  } catch {
    // A lease we could not write is not this hook's problem to escalate: the
    // owner keeps the lock until the window runs out, and the launcher's takeover
    // is the backstop. Never throw on the per-call path.
    return { renewed: false, reason: 'error', leaseUntil: null }
  }
}

/**
 * EXTEND the lease beyond the ordinary window, for work that is declared to take
 * longer than one. This is the ONLY way a long wait may keep the batch: the reader
 * side compares numbers and asks no questions, so work that needs more time says
 * so IN ADVANCE by writing a later `leaseUntil` (docs/batch-resilience.md §3 —
 * "declared work extends the lease by writing a longer leaseUntil when it is
 * declared, and the acquirer only compares numbers").
 *
 * Owner-guarded, and it only ever moves the lease FORWARD.
 */
export function extendLease(sessionId, untilMs, opts = {}) {
  try {
    const lockPath = opts.lockPath ?? LOCK_PATH
    const lock = readOwnerLock(lockPath)
    if (!lock || lock.sessionId !== sessionId) return false
    if (!(typeof untilMs === 'number' && Number.isFinite(untilMs))) return false
    const current = typeof lock.leaseUntil === 'number' ? lock.leaseUntil : 0
    if (untilMs <= current) return false
    writeJsonAtomic(lockPath, { ...lock, leaseUntil: untilMs }, opts)
    return true
  } catch {
    return false
  }
}

/** Refresh the heartbeat — ONLY if this session owns the lock. Never claims.
 *  Backfills the pid identity once for a lock claimed before the pid existed.
 *  It does NOT touch `leaseUntil`: renewal is PreToolUse by design, and a
 *  PostToolUse renewal here would reintroduce exactly the window the lease was
 *  built to remove. */
export function heartbeat(sessionId, opts = {}) {
  const lockPath = opts.lockPath ?? LOCK_PATH
  const lock = readOwnerLock(lockPath)
  if (!lock || lock.sessionId !== sessionId) return false
  const now = opts.now ?? Date.now()
  // A heartbeat is proof the session is WORKING, so it withdraws a handover
  // outright rather than only outdating it. The comparison in assessOwner would
  // do the same, but an explicit delete also survives a clock stepped backwards
  // (four-eyes review, finding 1) and leaves an honest lock file behind.
  //
  // …UNLESS the work was part of ENDING (live finding 2, 28.07.2026): the Stop
  // chain routinely sends a session back for a timestamp, a review record or a
  // dashboard republish AFTER the boundary was taken, and each of those rounds
  // silently un-took the handover — `HANDOVER point 378` at 08:56:12, `WITHDRAWN
  // point 378` at 08:56:16. The caller decides (handoverSurvivesCall in
  // batch-boundary-core.mjs); here the handover is carried forward by moving
  // handedOverAt WITH claimedAt, so `claimedAt <= handedOverAt` still holds and
  // nothing else in assessOwner needs to know about the exception.
  //
  // …AND UNLESS THE CALL PREDATES THE HANDOVER (point 396, measured in
  // `.claude/boundary.log`): the Stop chain writes the handover while the
  // PostToolUse heartbeat of the turn's LAST tool call is still in flight, so two
  // of ten attempts one morning were cancelled 117 ms and 154 ms after being
  // written. That is not a session working again — it is a late hook. The handover
  // survives untouched; `withdrawalIsCausal` decides, honestly rather than by
  // ignoring withdrawals.
  const next = { ...lock, v: 2, claimedAt: now }
  if (next.handedOver !== undefined || next.handedOverAt !== undefined) {
    const causal = withdrawalIsCausal({
      handedOverAt: next.handedOverAt,
      callAt: opts.callAt,
      now,
      settleMs: opts.settleMs,
    })
    if (opts.preserveHandover === true && next.handedOver === true) {
      next.handedOverAt = now
    } else if (causal) {
      delete next.handedOver
      delete next.handedOverAt
      delete next.handoverPoint
    }
    // …else: leave the handover exactly as it stands. NOT touched forward either —
    // moving handedOverAt here would let a stream of late hooks keep it alive.
  }
  // Backfill the pid identity ONCE for a lock claimed before pids were
  // recorded — and never retry a failed walk on the hot per-tool-call path.
  if (next.pid == null && !next.pidBackfillFailed && opts.skipBackfill !== true) {
    const anc = (opts.findAncestorFn ?? findClaudeAncestor)()
    if (anc) {
      next.pid = anc.pid
      next.pidStartedAt = anc.startedAt
    } else {
      next.pidBackfillFailed = true
    }
  }
  writeJsonAtomic(lockPath, next, opts)
  return true
}

/** Owner-guarded lock update (e.g. the launcher rebinding its pending-spawn
 *  lock to the just-spawned child pid). No-op unless `sessionId` owns the lock. */
export function updateOwnLock(sessionId, patch, lockPath = LOCK_PATH) {
  const lock = readOwnerLock(lockPath)
  if (!lock || lock.sessionId !== sessionId) return false
  writeJsonAtomic(lockPath, { ...lock, ...patch, sessionId, claimedAt: Date.now() })
  return true
}

/** A failed ancestor walk is remembered this long before it is retried — the
 *  walk costs a PowerShell round trip and a session's ancestry does not change,
 *  so asking once per session id is the whole budget. */
export const ANCESTOR_RETRY_MS = 10 * 60 * 1000

/**
 * The claude process THIS session runs under, memoised per session id. The walk
 * itself is one PowerShell round trip; without the memo it would sit in front of
 * every guard call of every non-owner session, which is most tool calls in the
 * repository. A cached pid is re-validated by a cheap liveness probe, so a stale
 * entry can never answer for a process that is gone.
 */
export function ourClaudeProcess(sessionId, opts = {}) {
  if (!sessionId) return null
  const path = opts.ancestorCachePath ?? statePathsFor(opts.lockPath ?? LOCK_PATH).ancestorCachePath
  const now = opts.now ?? Date.now()
  let cache = null
  try {
    cache = readJson(path) ?? {}
    const hit = cache[sessionId]
    if (hit && typeof hit.at === 'number') {
      if (hit.pid == null) {
        if (now - hit.at < (opts.retryMs ?? ANCESTOR_RETRY_MS)) return null
      } else if ((opts.probePidFn ?? cheapProbePid)(hit.pid).exists) {
        return { pid: hit.pid, startedAt: typeof hit.startedAt === 'number' ? hit.startedAt : null }
      }
    }
  } catch {
    cache = null // unreadable cache → walk, but do not try to write it back
  }
  const anc = (opts.findAncestorFn ?? findClaudeAncestor)()
  // A probe gets the same ANSWER and leaves no record (point 434 (8)): a synthetic
  // id must not accrete in the repository's real state under a session's name.
  if (cache && !isProbeSessionId(sessionId)) {
    try {
      const next = { ...cache, [sessionId]: { pid: anc?.pid ?? null, startedAt: anc?.startedAt ?? null, at: now } }
      for (const [k, v] of Object.entries(next)) if (now - (v?.at ?? 0) > 24 * 3600 * 1000) delete next[k]
      writeJsonAtomic(path, next)
    } catch {
      /* best effort — the answer above is what matters */
    }
  }
  return anc
}

/**
 * Ownership, by session id first and by PROCESS second. Returns
 * `{ mine, via, lock }`. On a process match the lock is RE-STAMPED with the
 * current session id, so every later check is the cheap string compare again and
 * the state file stops lying about who holds it.
 *
 * `processIdentity: false` keeps the old id-only behaviour for a caller that
 * wants it; `restamp: false` asks the same question without writing.
 */
export function ownsLock(sessionId, opts = {}) {
  const lockPath = opts.lockPath ?? LOCK_PATH
  const lock = opts.lock !== undefined ? opts.lock : readOwnerLock(lockPath)
  if (!lock) return { mine: false, via: 'no-lock', lock: null }
  // The id shortcut below is this function's OWN — it does not pass through
  // `resolveOwnership`, so the probe rule has to be repeated here or a lock left
  // NAMING a probe would be ownable by that probe (four-eyes re-check, the nit).
  // Symmetry with `heldByOtherLiveOwner`, which already answers false for one.
  if (isProbeSessionId(sessionId)) return { mine: false, via: 'probe-id', lock }
  if (sessionId && lock.sessionId === sessionId) return { mine: true, via: 'session-id', lock }
  if (opts.processIdentity === false || !sessionId) return { mine: false, via: 'session-id-mismatch', lock }
  // Cheap necessary conditions BEFORE the expensive walk: a lock with no pid, or
  // one whose pid is not even alive, cannot name the process we are running in.
  if (typeof lock.pid !== 'number' || lock.pid <= 0) return { mine: false, via: 'lock-without-pid', lock }
  if ((opts.probePidFn ?? cheapProbePid)(lock.pid).exists !== true) {
    return { mine: false, via: 'lock-pid-dead', lock }
  }
  // Deliberately NOT `opts.pid`: that is the identity a caller wants RECORDED,
  // not one it has verified it runs under, and trusting it would let any caller
  // name itself the owner. Ancestry is established or it is not.
  const ancestor = opts.ancestor !== undefined ? opts.ancestor : ourClaudeProcess(sessionId, opts)
  const verdict = resolveOwnership({ lock, sessionId, ancestor })
  if (verdict.mine && verdict.restamp && opts.restamp !== false) {
    try {
      // Only the id moves. claimedAt is NOT bumped (that would count as work and
      // silently withdraw a handover) and no other field is touched.
      writeJsonAtomic(lockPath, {
        ...lock,
        sessionId,
        sessionIdBefore: lock.sessionId,
        sessionIdRestampedAt: opts.now ?? Date.now(),
      })
    } catch {
      /* the verdict stands; the next call simply pays for the walk again */
    }
  }
  return { mine: verdict.mine, via: verdict.via, lock }
}

export function isOwner(sessionId, lockPath = LOCK_PATH) {
  if (!sessionId) return false
  const lock = readOwnerLock(lockPath)
  return !!lock && lock.sessionId === sessionId
}

/**
 * The guards' stand-down predicate: true when ANOTHER session owns a live
 * lock — then this session must not be pushed to (or allowed to) drive the
 * batch. False when the lock is free/dead/mine (the progress-guard may then
 * acquire). Conservative on errors: an unreadable state reads as held.
 */
export function heldByOtherLiveOwner(sessionId, opts = {}) {
  try {
    const lockPath = opts.lockPath ?? LOCK_PATH
    const lock = readOwnerLock(lockPath)
    if (!lock) return false
    // Ours by id, or ours by process (the compaction case) — a session must not
    // stand down against its own lock just because its id was renamed under it.
    if (ownsLock(sessionId, { ...opts, lockPath, lock }).mine) return false
    const probe = lock.pid ? (opts.probePidFn ?? cheapProbePid)(lock.pid) : null
    const a = assessOwner(lock, {
      now: opts.now ?? Date.now(),
      bootTime: opts.bootTime ?? bootTimeMs(),
      probe,
    })
    return a.alive
  } catch {
    return true // fail toward stand-down: never conscript on an error
  }
}

/** Release the lock if this session owns it (no-op otherwise). */
export function release(sessionId, lockPath = LOCK_PATH) {
  const lock = readOwnerLock(lockPath)
  if (lock && lock.sessionId === sessionId) {
    try {
      rmSync(lockPath, { force: true })
    } catch {
      /* already gone */
    }
    return true
  }
  return false
}

/**
 * HAND THE BATCH OVER (point 388). Marks the lock "the owner is finished" so the
 * launcher's next tick spawns the successor instead of reading a live owner — the
 * decoupling that cost five and a half idle hours on the night of 28.07.2026,
 * when a session ended its TURN at a permitted boundary but kept its PROCESS (and
 * therefore the lock) alive.
 *
 * It is deliberately NOT a release: the lock keeps naming this session and pid, so
 * the state stays inspectable and `heartbeat()` still belongs to this session
 * alone. `claimedAt` is NOT bumped — the comparison in assessOwner is what lets a
 * session that keeps working withdraw its own handover.
 *
 * Owner-guarded and no-op otherwise, and it must only ever be called where a
 * VALID boundary has been established (scripts/batch-progress-guard.mjs).
 *
 * It REPORTS rather than throws — `{ handed, reason, attempts, error }` — and
 * that is the whole point of the shape (live finding 1, 28.07.2026). It used to
 * throw an EPERM straight through the guard into its fail-open catch, so the stop
 * proceeded, the marker had already been consumed and nothing recorded that the
 * batch had NOT been passed on. This is the ONE place where the propagating write
 * of point 340 is converted to data, because its single caller must allow the
 * stop while telling the session the truth about it.
 */
export function markHandover(sessionId, opts = {}) {
  const lockPath = opts.lockPath ?? LOCK_PATH
  const lock = readOwnerLock(lockPath)
  if (!lock || lock.sessionId !== sessionId) {
    return { handed: false, reason: lock ? 'not-owner' : 'no-lock', attempts: 0, error: null }
  }
  const now = opts.now ?? Date.now()
  const res = tryWriteJsonAtomic(
    lockPath,
    { ...lock, handedOver: true, handedOverAt: now, handoverPoint: opts.point ?? null },
    opts,
  )
  return {
    handed: res.ok,
    reason: res.ok ? 'ok' : 'write-failed',
    attempts: res.attempts,
    error: res.error,
  }
}

/**
 * A handover younger than this is never withdrawn (point 396). Calibratable via
 * HOA_HANDOVER_SETTLE_MS.
 *
 * ONE SECOND, because the thing being excluded is not a fast session but a LATE
 * HOOK. Two of the ten boundary attempts on the morning of 28.07.2026 were
 * cancelled 117 ms and 154 ms after they were written — `HANDOVER point 338` at
 * 11:42:00.469Z, `WITHDRAWN point 338` at 11:42:00.586Z, and the same shape ten
 * minutes later. A withdrawal means "the session is working again", and no session
 * works again within 117 ms: a continuation needs a model round trip. What actually
 * happened is that the Stop chain wrote the handover while the PostToolUse
 * heartbeat of the turn's LAST tool call was still in flight, delayed by the very
 * file contention that produced that morning's EPERM retries.
 */
export const HANDOVER_SETTLE_MS = (() => {
  const env = Number(process.env.HOA_HANDOVER_SETTLE_MS)
  return Number.isFinite(env) && env >= 0 ? env : 1000
})()

/**
 * MAY THIS CALL WITHDRAW THE HANDOVER? PURE.
 *
 * A withdrawal may only ever be caused by work that happened AFTER the handover was
 * written. Where the hook payload carries the call's own timestamp, that answers it
 * outright; where it does not, the settle window does the same job.
 *
 * THIS IS NOT "ignore withdrawals". A session that genuinely carries on working must
 * still withdraw its boundary, or the five-and-a-half-hour standstill of 28.07.2026
 * comes back. The rule stays "work after the handover withdraws it" — only measured
 * honestly.
 */
export function withdrawalIsCausal({
  handedOverAt,
  callAt = null,
  now = Date.now(),
  settleMs = HANDOVER_SETTLE_MS,
} = {}) {
  if (!(typeof handedOverAt === 'number' && handedOverAt > 0)) return true
  if (typeof callAt === 'number' && callAt > 0) return callAt > handedOverAt
  return now - handedOverAt >= settleMs
}

/**
 * WITHDRAW a handover — the session is demonstrably still working after all.
 * Owner-guarded, so it is a no-op once a successor has claimed the lock (by then
 * the old session is stood down by ownership anyway).
 *
 * This exists because the Stop chain does not end at batch-progress-guard:
 * sixteen guards run after it and several can block, and the session's first act
 * after such a block may be a single 40-minute tool call, during which no
 * heartbeat lands (four-eyes review, finding 1). Calling this from a PreToolUse
 * hook closes that window BEFORE the long call starts.
 */
export function withdrawHandover(sessionId, opts = {}) {
  const lockPath = opts.lockPath ?? LOCK_PATH
  const lock = readOwnerLock(lockPath)
  if (!lock || lock.sessionId !== sessionId) return false
  // THE MARKER GOES WITH THE FLAG (live finding 2). The marker used to be
  // consumed by the stop it authorised, so a Stop guard that sent the session
  // back to work left it with no marker and the next turn was met with "TAKE THE
  // POINT BOUNDARY" again — a loop. It now survives its own use, which makes
  // THIS the one place a boundary ends: real work withdraws it, closing work
  // does not. Removed even when no handover flag is set, so a marker recorded
  // and then followed by real work is withdrawn just the same.
  const boundaryPath = opts.boundaryPath ?? statePathsFor(lockPath).boundaryPath
  const now = opts.now ?? Date.now()
  // A WITHDRAWAL MUST BE CAUSED BY WORK AFTER THE HANDOVER (point 396). The MARKER
  // is protected by the same test as the flag — deleting it is what forces the
  // re-take, and that re-take loop is what point 388 was opened on.
  const marker = readJson(boundaryPath)
  const writtenAt = Math.max(
    typeof lock.handedOverAt === 'number' ? lock.handedOverAt : 0,
    typeof marker?.at === 'number' ? marker.at : 0,
  )
  if (writtenAt > 0 && !withdrawalIsCausal({ handedOverAt: writtenAt, callAt: opts.callAt, now, settleMs: opts.settleMs })) {
    return false
  }
  // SAY IT (point 426 (b)). The marker removal used to be silent: a pager on a
  // closing line deleted it, the next Stop hook demanded the boundary again, and no
  // record anywhere named the cause. Every removal of a TAKEN boundary is now
  // appended to the boundary log with the triggering call.
  try {
    ;(opts.remove ?? rmSync)(boundaryPath, { force: true })
  } catch {
    /* best effort — a marker we cannot delete is caught by its own freshness */
  }
  if (marker) {
    try {
      appendFileSync(
        opts.logPath ?? statePathsFor(lockPath).boundaryLogPath,
        `[${new Date(now).toISOString()}] MARKER WITHDRAWN for point ${marker.point ?? '?'} ` +
          `by ${sessionId} — triggered by ${opts.trigger ?? 'an unrecorded call'}\n`,
      )
    } catch {
      /* best effort — a log we cannot write may never break a tool call */
    }
  }
  if (lock.handedOver !== true) return false
  const next = { ...lock, claimedAt: now }
  delete next.handedOver
  delete next.handedOverAt
  delete next.handoverPoint
  writeJsonAtomic(lockPath, next, opts)
  // Recorded beside the handover it cancels: without this line, a launcher tick
  // that finds a live owner past the grace cannot be told apart from one whose
  // handover was legitimately taken back, and the acceptance evidence would be
  // ambiguous exactly where it matters (four-eyes review). The log is a SIBLING
  // of the lock, never the repo default, so a redirected lock redirects it too.
  try {
    const log = opts.logPath ?? statePathsFor(lockPath).boundaryLogPath
    appendFileSync(
      log,
      `[${new Date().toISOString()}] WITHDRAWN point ${lock.handoverPoint ?? '?'} by ${sessionId} — ` +
        'the session is working again; the lock stays held.\n',
    )
  } catch {
    /* best effort — the withdrawal itself has already landed */
  }
  return true
}

/**
 * Drop a boundary marker THIS session left behind (SessionEnd). Now that the
 * marker survives the stop it authorised, the session's own end is what retires
 * it — otherwise a successor would meet a foreign marker and be told a boundary
 * was "claimed but REFUSED" for a point it had nothing to do with.
 */
export function clearOwnBoundary(sessionId, opts = {}) {
  try {
    const path = opts.boundaryPath ?? statePathsFor(opts.lockPath ?? LOCK_PATH).boundaryPath
    const marker = readJson(path)
    if (!marker || !sessionId || marker.sessionId !== sessionId) return false
    ;(opts.remove ?? rmSync)(path, { force: true })
    return true
  } catch {
    return false
  }
}

/** How stale a handover may get before a closing-set tool call refreshes it.
 *  Throttles the write: the boundary's grace is a quarter of an hour wide, so
 *  moving the stamp once a minute is ample, and every avoided write is one fewer
 *  chance for the rename to lose (points 340/388). */
export const HANDOVER_TOUCH_MS = 60 * 1000

/**
 * CARRY a handover forward across work that is part of ENDING the batch (live
 * finding 2). Owner-guarded, a no-op unless the lock really is handed over, and
 * throttled — it only rewrites the lock when the stamp has gone stale.
 *
 * It exists for the window `heartbeat` cannot cover: a PreToolUse hook runs
 * BEFORE the call, and a closing-set call could otherwise sit through the whole
 * grace with an ageing stamp before its PostToolUse heartbeat refreshes it.
 */
export function touchHandover(sessionId, opts = {}) {
  const lockPath = opts.lockPath ?? LOCK_PATH
  const lock = readOwnerLock(lockPath)
  if (!lock || lock.sessionId !== sessionId || lock.handedOver !== true) return false
  const now = opts.now ?? Date.now()
  if (typeof lock.handedOverAt === 'number' && now - lock.handedOverAt < (opts.touchMs ?? HANDOVER_TOUCH_MS)) {
    return false
  }
  writeJsonAtomic(lockPath, { ...lock, handedOverAt: now }, opts)
  return true
}

/**
 * Convert a launcher 'pending-spawn' lock to this (just-spawned) session.
 * Succeeds only when the lock is pending AND names this session's claude
 * process (spawnedPid == our claude ancestor) or a fresh one-shot authorization
 * exists. Atomic via the same reap mutex. Returns true on success.
 */
export function convertPendingSpawn(sessionId, opts = {}) {
  const lockPath = opts.lockPath ?? LOCK_PATH
  const mutexPath = `${lockPath}.reaping`
  const now = opts.now ?? Date.now()
  const lock = readOwnerLock(lockPath)
  if (!lock || lock.kind !== 'pending-spawn') return false
  const anc = opts.pid
    ? { pid: opts.pid, startedAt: opts.pidStartedAt ?? null }
    : (opts.findAncestorFn ?? findClaudeAncestor)()
  const pidMatches = anc && typeof lock.spawnedPid === 'number' && anc.pid === lock.spawnedPid
  if (!pidMatches && !opts.authorized) return false
  if (!enterReapMutex(mutexPath)) return false
  try {
    const recheck = readOwnerLock(lockPath)
    if (!recheck || recheck.kind !== 'pending-spawn' || recheck.spawnedPid !== lock.spawnedPid) return false
    // THE FENCE FOLLOWS THE BATCH, and a conversion is a real change of holder:
    // the launcher won a pending lock, the spawned session now owns it, so the
    // session takes the next number and becomes the recorded holder. The
    // launcher's own grant is thereby superseded, which is simply true — and
    // harmless, because everything it still does (release, updateOwnLock) is
    // sessionId-guarded and touches none of the four fenced paths.
    const fence = grantFence(sessionId, {
      fencePath: opts.fencePath ?? statePathsFor(lockPath).fencePath,
      priorFence: typeof recheck.fence === 'number' ? recheck.fence : null,
      now,
    })
    writeJsonAtomic(lockPath, {
      v: 2,
      sessionId,
      kind: 'session',
      startedAt: now,
      claimedAt: now,
      acquiredAt: now,
      leaseUntil: now + (opts.leaseMs ?? LEASE_MS),
      fence: fence ?? recheck.fence ?? null,
      pid: anc ? anc.pid : (recheck.spawnedPid ?? null),
      pidStartedAt: anc ? anc.startedAt : null,
    })
    return true
  } finally {
    exitReapMutex(mutexPath)
  }
}

// --- Parallel-session presence + detection -------------------------------------

/** Record a TOP-LEVEL session start (SessionStart hook only — subagents never
 *  fire it, which is what makes the classifier subagent-safe). */
export function noteTopLevelSession(sid, opts = {}) {
  if (!sid) return
  try {
    const path = opts.path ?? SESSIONS_SEEN_PATH
    const now = opts.now ?? Date.now()
    const seen = readJson(path) ?? {}
    seen[sid] = seen[sid] ?? now
    for (const [k, v] of Object.entries(seen)) if (now - v > 7 * 24 * 3600 * 1000) delete seen[k]
    writeJsonAtomic(path, seen)
  } catch {
    /* best effort */
  }
}

/** Record tool activity for a session id (PostToolUse hook, every tool call). */
export function noteActivity(sid, opts = {}) {
  if (!sid) return
  try {
    const path = opts.path ?? SESSION_ACTIVITY_PATH
    const now = opts.now ?? Date.now()
    const act = readJson(path) ?? {}
    act[sid] = now
    for (const [k, v] of Object.entries(act)) if (now - v > 24 * 3600 * 1000) delete act[k]
    writeJsonAtomic(path, act)
  } catch {
    /* best effort */
  }
}

export function clearActivity(sid, opts = {}) {
  try {
    const path = opts.path ?? SESSION_ACTIVITY_PATH
    const act = readJson(path) ?? {}
    delete act[sid]
    writeJsonAtomic(path, act)
  } catch {
    /* best effort */
  }
}

/** Live parallel sessions right now (excluding `ownerSid` and `opts.exclude`). */
export function detectParallel(ownerSid, opts = {}) {
  return classifyParallel({
    sessionsSeen: readJson(opts.sessionsPath ?? SESSIONS_SEEN_PATH) ?? {},
    activity: readJson(opts.activityPath ?? SESSION_ACTIVITY_PATH) ?? {},
    ownerSid,
    now: opts.now ?? Date.now(),
    exclude: opts.exclude ?? [],
  })
}

/** Raise/read/clear the parallel alert the owner's Stop guard surfaces. */
export function raiseParallelAlert(info, opts = {}) {
  try {
    writeJsonAtomic(opts.path ?? PARALLEL_ALERT_PATH, { at: Date.now(), ...info })
  } catch {
    /* best effort */
  }
}

export function readUnhandledAlert(opts = {}) {
  const alert = readJson(opts.path ?? PARALLEL_ALERT_PATH)
  if (!alert || typeof alert.at !== 'number') return null
  const state = readJson(opts.statePath ?? DOCTOR_STATE_PATH)
  if (state && typeof state.handledAt === 'number' && state.handledAt >= alert.at) return null
  return alert
}

export function markAlertHandled(opts = {}) {
  try {
    const statePath = opts.statePath ?? DOCTOR_STATE_PATH
    const state = readJson(statePath) ?? {}
    writeJsonAtomic(statePath, { ...state, handledAt: Date.now() })
  } catch {
    /* best effort */
  }
}

// --- CLI -----------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href
if (isMain) {
  const cmd = process.argv[2]
  if (cmd === 'status') {
    const lock = readOwnerLock()
    if (!lock) {
      console.log('no owner lock — the batch is unclaimed')
    } else {
      const probe = lock.pid ? probePid(lock.pid) : null
      const a = assessOwner(lock, { now: Date.now(), bootTime: bootTimeMs(), probe })
      console.log(JSON.stringify({ lock, probe, assessment: a }, null, 2))
    }
    const parallel = detectParallel(readOwnerLock()?.sessionId ?? '')
    console.log(`live parallel sessions: ${parallel.length ? JSON.stringify(parallel) : 'none'}`)
  } else if (cmd === 'release') {
    const lock = readOwnerLock()
    if (lock) {
      rmSync(LOCK_PATH, { force: true })
      console.log(`released lock held by ${lock.sessionId} (manual override)`)
    } else {
      console.log('no lock to release')
    }
  } else if (cmd) {
    console.log('usage: node scripts/batch-singleton.mjs [status|release]')
  }
}
