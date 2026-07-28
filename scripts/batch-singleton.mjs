// HARD batch singleton (user mandate 24.07.2026, after the e9407cae incident:
// two live sessions drove the batch and committed to main concurrently).
// This module is the ONE authority on "who may drive the batch":
//
//   1. A single OWNER LOCK (.claude/batch-lock.json) with a liveness heartbeat
//      (timestamp + session id + the owning claude process's OS PID + its start
//      time). The pid makes liveness REAL: a session mid-40-minute tool call
//      writes no heartbeat, but its process is provably alive — the old
//      claimedAt-age-only check declared exactly such a session dead and
//      double-spawned (the incident's root cause).
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

// --- Constants (exported for tests and callers) -------------------------------

/** A heartbeat younger than this proves life outright — no pid probe needed,
 *  and a dead-looking pid within this grace is still treated as alive (the
 *  owner may be mid-acquisition or the probe raced a restart). */
export const DEAD_CONFIRM_MS = 5 * 60 * 1000
/** Legacy locks (no pid recorded) fall back to age-only liveness with this
 *  generous bound (the old STALE_MS). */
export const LEGACY_STALE_MS = 45 * 60 * 1000
/** An alive-pid owner whose heartbeat is older than this is flagged "wedged"
 *  (hung process). It still BLOCKS takeover — a wedged owner is signalled to
 *  the user, never silently replaced — but the launcher may kill a wedged
 *  process it spawned itself. */
export const WEDGED_MS = 4 * 60 * 60 * 1000
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
/** An ALIVE owner silent for longer than this is reported out of band (point
 *  388 (c)). Calibratable — the longest legitimate silence in this repository is
 *  the LARGE browser regression at roughly 30-40 minutes, so the default leaves
 *  better than 2x headroom. Override with HOA_WEDGE_NOTIFY_MIN (minutes). */
export const WEDGE_NOTIFY_MS = 90 * 60 * 1000
/** Tool activity younger than this counts a session as "live" for the
 *  parallel-session detector. */
export const PARALLEL_FRESH_MS = 10 * 60 * 1000
/** A reap-mutex directory older than this belongs to a crashed reaper and may
 *  be cleared. */
export const REAP_MUTEX_STALE_MS = 60 * 1000
/** Start times within this tolerance count as the same process (pid reuse
 *  detection). */
export const PID_START_TOLERANCE_MS = 2000

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
 * Returns { alive, wedged, reason }.
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
export function assessOwner(lock, { now, bootTime, probe }) {
  if (!lock || typeof lock.claimedAt !== 'number') {
    return { alive: false, wedged: false, reason: 'no-lock' }
  }
  if (lock.handedOver === true && typeof lock.handedOverAt === 'number' && lock.claimedAt <= lock.handedOverAt) {
    const pidGone = probe ? probe.exists !== true : false
    if (pidGone || now - lock.handedOverAt >= HANDOVER_GRACE_MS) {
      return { alive: false, wedged: false, reason: 'handed-over' }
    }
    return { alive: true, wedged: false, reason: 'handover-grace' }
  }
  const age = now - lock.claimedAt
  // Fresh heartbeat proves life — REBOOT IS NOT SUFFICIENT to declare death
  // when a fresh heartbeat exists (a re-claimed post-boot session writes one).
  if (age < DEAD_CONFIRM_MS) return { alive: true, wedged: false, reason: 'fresh-heartbeat' }
  // A heartbeat from BEFORE this boot cannot have a living writer: no claude
  // process survives a reboot. (A live re-claimed session would have written a
  // post-boot heartbeat, caught above.)
  if (typeof bootTime === 'number' && lock.claimedAt < bootTime) {
    return { alive: false, wedged: false, reason: 'heartbeat-predates-boot' }
  }
  const kind = lock.kind === 'pending-spawn' ? 'pending-spawn' : 'session'
  const pid = typeof lock.pid === 'number' && lock.pid > 0 ? lock.pid : null
  if (pid === null) {
    // Legacy lock — age is all we have.
    const stale = kind === 'pending-spawn' ? PENDING_STALE_MS : LEGACY_STALE_MS
    return age > stale
      ? { alive: false, wedged: false, reason: 'legacy-stale' }
      : { alive: true, wedged: false, reason: 'legacy-fresh' }
  }
  if (!probe || probe.exists !== true) {
    // The owning process no longer exists → provably dead (past the grace).
    return { alive: false, wedged: false, reason: 'pid-dead' }
  }
  if (
    typeof lock.pidStartedAt === 'number' &&
    typeof probe.startedAt === 'number' &&
    Math.abs(probe.startedAt - lock.pidStartedAt) > PID_START_TOLERANCE_MS
  ) {
    // A pid exists but it is a DIFFERENT process (pid reuse) → owner dead.
    return { alive: false, wedged: false, reason: 'pid-reused' }
  }
  if (kind === 'pending-spawn' && age > PENDING_STALE_MS && probe.exists !== true) {
    return { alive: false, wedged: false, reason: 'pending-dead' }
  }
  // Pid alive and (as far as verifiable) the same process: ALIVE, no matter how
  // old the heartbeat — a long tool call starves the heartbeat but not the
  // process. This is the exact fix for the 24.07 incident (heartbeat 24 min
  // stale, session mid-turn, launcher double-spawned).
  return { alive: true, wedged: age > WEDGED_MS, reason: 'pid-alive' }
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
 * Returns 'spawn' | 'skip-alive' | 'skip-wedged'.
 */
export function spawnDecision(assessment) {
  if (!assessment.alive) return 'spawn'
  return assessment.wedged ? 'skip-wedged' : 'skip-alive'
}

/**
 * How far a silence has gone: null (still normal), 'silent' past the notify
 * threshold, 'wedged' past the hours-long one. TWO stages on purpose — the
 * incident was "nobody looked", so a silence that deepens escalates instead of
 * being reported once and then forgotten (four-eyes review, finding 5).
 */
export function wedgeStage(ageMs, { notifyMs = WEDGE_NOTIFY_MS, wedgedMs = WEDGED_MS } = {}) {
  if (typeof ageMs !== 'number') return null
  if (ageMs >= wedgedMs) return 'wedged'
  if (ageMs >= notifyMs) return 'silent'
  return null
}

/**
 * The identity of ONE silence at ONE stage: owner + pid + the heartbeat it fell
 * silent at + the stage. Keying the notification on this reports every genuine
 * stall exactly once per stage — the key holds still across the launcher's
 * 15-minute ticks (claimedAt does not move while nobody works), deepens into a
 * second report when the silence crosses into 'wedged', and a later stall of the
 * same session gets a new key again.
 */
export function wedgeOwnerKey(lock, stage = '') {
  if (!lock || !lock.sessionId || typeof lock.claimedAt !== 'number') return ''
  return `${lock.sessionId}#${lock.pid ?? 'nopid'}#${lock.claimedAt}${stage ? `#${stage}` : ''}`
}

/**
 * Should the launcher REPORT a silent owner (point 388 (c))? The launcher may
 * neither spawn against a live pid nor kill it — a long verify run legitimately
 * starves the heartbeat — but a night in which nothing happens must not be
 * discovered the next morning. Pure; the caller supplies the stage, the key and
 * the last key it notified for.
 */
export function wedgeNotifyDecision({ alive, stage, ownerKey, lastNotifiedKey }) {
  if (!alive) return { notify: false, reason: 'owner-not-alive' }
  if (!stage) return { notify: false, reason: 'below-threshold' }
  if (!ownerKey) return { notify: false, reason: 'no-owner' }
  if (lastNotifiedKey && lastNotifiedKey === ownerKey) return { notify: false, reason: 'already-notified' }
  return { notify: true, reason: stage === 'wedged' ? 'wedged-owner' : 'silent-owner' }
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
 */
export function classifyParallel({ sessionsSeen, activity, ownerSid, now }) {
  const out = []
  for (const [sid, lastToolAt] of Object.entries(activity ?? {})) {
    if (!sid || sid === ownerSid) continue
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
 *   'block-continue'   — owner + open points → keep working
 *   'block-format'     — TASKS.md unparseable → warn, never read as complete
 *
 * `boundary`/`launcher` come from scripts/batch-boundary-core.mjs
 * (`assessBoundary`, `classifyLauncherState`); omitting them keeps the old
 * behaviour exactly, which is what every non-boundary turn end wants.
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
  // The point boundary (point 373). A valid boundary is only ever honoured with
  // an armed launcher — an unarmed one would turn "end the session" into "end the
  // batch", so it blocks instead. An INVALID claim falls through to the ordinary
  // block: the work order, not the marker, decides whether a point is closed.
  if (boundary && boundary.valid) return launcher === 'armed' ? 'allow-boundary' : 'block-launcher'
  // A DUE boundary without a marker (point 388): the permission of point 373 was
  // never taken up, and the session simply sat there holding the lock. Both
  // verdicts block, so a false positive costs a wrong message and nothing more —
  // but a true one now names the single command that hands the batch over.
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
      { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] },
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
 */
export function acquire(sessionId, opts = {}) {
  if (!sessionId) return 'held'
  const lockPath = opts.lockPath ?? LOCK_PATH
  const mutexPath = `${lockPath}.reaping`
  const now = opts.now ?? Date.now()
  const deps = {
    bootTime: opts.bootTime ?? bootTimeMs(),
    probePid: opts.probePidFn ?? probePid,
    findAncestor: opts.findAncestorFn ?? findClaudeAncestor,
  }
  const identity = () => {
    // Resolve the owning claude process once, at acquisition.
    const anc = opts.pid ? { pid: opts.pid, startedAt: opts.pidStartedAt ?? null } : deps.findAncestor()
    return {
      v: 2,
      sessionId,
      kind: opts.kind ?? 'session',
      startedAt: now,
      claimedAt: now, // legacy heartbeat field
      acquiredAt: now,
      pid: anc ? anc.pid : null,
      pidStartedAt: anc ? anc.startedAt : null,
      ...(opts.extra ?? {}),
    }
  }

  // Sweep the litter of past failed writes (point 340 (b)) — only tmp files
  // whose owning pid is provably dead and which have settled. Best effort, and
  // deliberately here: acquisition is the one moment that is already doing lock
  // housekeeping, and it is not on the per-tool-call hot path.
  if (opts.sweep !== false) sweepOrphanTmp(lockPath, opts)

  // Fast path: no lock → exclusive create (test-and-set; one winner).
  if (!existsSync(lockPath)) {
    if (tryExclusiveCreate(lockPath, identity())) return 'acquired'
  }

  const lock = readOwnerLock(lockPath)
  if (lock && lock.sessionId === sessionId) {
    heartbeat(sessionId, { lockPath, now })
    return 'mine'
  }
  if (lock) {
    const probe = lock.pid ? deps.probePid(lock.pid) : null
    const a = assessOwner(lock, { now, bootTime: deps.bootTime, probe })
    if (a.alive) return 'held'
  } else {
    // Unreadable/corrupt lock file: reap only if it has settled (not mid-write).
    try {
      const st = statSync(lockPath)
      if (now - st.mtimeMs < REAP_MUTEX_STALE_MS) return 'held'
    } catch {
      // vanished between the existsSync and here — retry the fast path once
      if (tryExclusiveCreate(lockPath, identity())) return 'acquired'
      return 'lost-race'
    }
  }

  // Dead owner → takeover under the reap mutex (atomic mkdir): only ONE
  // process at a time may unlink+recreate, and it re-verifies deadness inside
  // the mutex so it can never clobber a freshly re-claimed live lock.
  if (!enterReapMutex(mutexPath)) return 'held'
  try {
    const recheck = readOwnerLock(lockPath)
    if (recheck) {
      if (recheck.sessionId === sessionId) {
        heartbeat(sessionId, { lockPath, now })
        return 'mine'
      }
      const probe = recheck.pid ? deps.probePid(recheck.pid) : null
      const a = assessOwner(recheck, { now, bootTime: deps.bootTime, probe })
      if (a.alive) return 'held'
    }
    try {
      rmSync(lockPath, { force: true })
    } catch {
      return 'lost-race'
    }
    if (tryExclusiveCreate(lockPath, identity())) return 'acquired'
    return 'lost-race'
  } finally {
    exitReapMutex(mutexPath)
  }
}

/** Refresh the heartbeat — ONLY if this session owns the lock. Never claims.
 *  Backfills the pid identity once for a lock claimed before the pid existed. */
export function heartbeat(sessionId, opts = {}) {
  const lockPath = opts.lockPath ?? LOCK_PATH
  const lock = readOwnerLock(lockPath)
  if (!lock || lock.sessionId !== sessionId) return false
  const now = opts.now ?? Date.now()
  // A heartbeat is proof the session is WORKING, so it withdraws a handover
  // outright rather than only outdating it. The comparison in assessOwner would
  // do the same, but an explicit delete also survives a clock stepped backwards
  // (four-eyes review, finding 1) and leaves an honest lock file behind.
  const next = { ...lock, v: 2, claimedAt: now }
  if (next.handedOver !== undefined || next.handedOverAt !== undefined) {
    delete next.handedOver
    delete next.handedOverAt
    delete next.handoverPoint
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
    if (sessionId && lock.sessionId === sessionId) return false
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
  if (!lock || lock.sessionId !== sessionId || lock.handedOver !== true) return false
  const next = { ...lock, claimedAt: opts.now ?? Date.now() }
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
    writeJsonAtomic(lockPath, {
      v: 2,
      sessionId,
      kind: 'session',
      startedAt: now,
      claimedAt: now,
      acquiredAt: now,
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

/** Live parallel sessions right now (excluding `ownerSid`). */
export function detectParallel(ownerSid, opts = {}) {
  return classifyParallel({
    sessionsSeen: readJson(opts.sessionsPath ?? SESSIONS_SEEN_PATH) ?? {},
    activity: readJson(opts.activityPath ?? SESSION_ACTIVITY_PATH) ?? {},
    ownerSid,
    now: opts.now ?? Date.now(),
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
